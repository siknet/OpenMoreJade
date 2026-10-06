/** Hacker News: the official Firebase Show Stories and Best Stories feeds. */
import { hnKey } from '@resonance/schema'
import type { Config } from '../config.ts'
import type { RawNews, Source } from '../types.ts'
import { clip, decodeEntities, hostOf, plain, refsOf } from './util.ts'

/** Story tags worth showing; the rest of `_tags` is bookkeeping (`story`, `author_x`, `story_123`). */
const KINDS = ['show_hn', 'ask_hn', 'launch_hn']

/** The slice of an Algolia story hit we read. `url` is absent on Ask/text posts, `story_text` on link posts. */
export interface HnHit {
  objectID: string
  title: string
  url?: string
  story_text?: string
  author?: string
  points: number | null
  num_comments: number | null
  created_at_i: number
  _tags?: string[]
}

/** Algolia's envelope. Bad filters and over-limit pages answer 200 with `message` and no hits. */
export interface HnSearchResponse {
  hits?: HnHit[]
  nbHits?: number
  message?: string
}

/** The public Firebase API's story shape. */
export interface HnFirebaseItem {
  id: number
  type?: string
  title?: string
  url?: string
  text?: string
  by?: string
  score?: number
  descendants?: number
  time?: number
}

/** One Algolia story hit → candidate. */
export function mapHnHit(hit: HnHit): RawNews {
  const key = hnKey(hit.objectID)
  const hnUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`
  const url = hit.url || hnUrl
  const text = plain(hit.story_text)
  const createdAt = new Date(hit.created_at_i * 1000).toISOString()
  const points = hit.points ?? 0
  const comments = hit.num_comments ?? 0
  const tags = hit._tags ?? []
  return {
    key,
    board: 'news',
    title: plain(hit.title),
    url,
    summary: clip(text),
    tags: KINDS.filter((kind) => tags.includes(kind)),
    publishedAt: createdAt,
    sources: ['hacker-news'],
    // Scan the raw story text: links live in href attributes that `plain` strips, slashes arrive as &#x2F;.
    refs: refsOf(key, hit.url, decodeEntities(hit.story_text ?? '')),
    metrics: { points, comments, frontPage: tags.includes('front_page') ? 1 : 0 },
    news: {
      hnId: Number(hit.objectID),
      hnUrl,
      domain: hostOf(hit.url),
      author: hit.author,
      points,
      comments,
      createdAt,
    },
  }
}

/** Convert an official Firebase story into the same raw shape as an Algolia hit. */
export function mapFirebaseItem(item: HnFirebaseItem, showRank?: number): RawNews {
  const mapped = mapHnHit({
    objectID: String(item.id),
    title: item.title ?? '',
    url: item.url,
    story_text: item.text,
    author: item.by,
    points: item.score ?? 0,
    num_comments: item.descendants ?? 0,
    created_at_i: item.time ?? 0,
    _tags: ['story'],
  })
  if (showRank !== undefined) mapped.news.showRank = showRank
  return mapped
}

/** Stories of the last `hours` with more than `minPoints` points. */
export function hackerNews(config: Config): Source {
  void config
  return {
    id: 'hacker-news',
    board: 'news',
    async fetch(ctx) {
      const [showIds, bestIds] = await Promise.all([
        ctx.http.json<number[]>('https://hacker-news.firebaseio.com/v0/showstories.json'),
        ctx.http.json<number[]>('https://hacker-news.firebaseio.com/v0/beststories.json'),
      ])
      // SHOW deliberately preserves HN's own list order and takes exactly its first 15 records. There is no
      // time/points filter here; topic classification remains the pipeline-wide safety gate after this source.
      const showItems = await Promise.all(
        (showIds ?? []).slice(0, 15).map((id) =>
          ctx.http.json<HnFirebaseItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null),
        ),
      )
      // BEST uses the canonical ranking. Fetch a bounded prefix; board scoring still decides the BEST display order.
      const bestItems = await Promise.all(
        (bestIds ?? []).slice(0, 60).map((id) =>
          ctx.http.json<HnFirebaseItem>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`).catch(() => null),
        ),
      )
      const show = showItems
        .filter((item): item is HnFirebaseItem => !!item && item.type === 'story' && !!item.id && !!item.title)
        .map((item, index) => mapFirebaseItem(item, index + 1))
      const best = bestItems
        .filter((item): item is HnFirebaseItem => !!item && item.type === 'story' && !!item.id && !!item.title)
        .map(mapFirebaseItem)
      const byKey = new Map(show.map((item) => [item.key, item]))
      for (const item of best) if (!byKey.has(item.key)) byKey.set(item.key, item)
      return [...byKey.values()]
    },
  }
}
