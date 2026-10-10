/** Lobste.rs stories source: release, ai, show tags */
import type { Config } from '../config.ts'
import type { RawNews, Source } from '../types.ts'
import { clip, hostOf, plain, refsOf } from './util.ts'

export interface LobstersStory {
  short_id: string
  created_at: string
  title: string
  url: string
  score: number
  comment_count: number
  description?: string
  description_plain?: string
  submitter_user?: string
  tags?: string[]
  short_id_url?: string
  comments_url?: string
}

export function mapLobstersStory(story: LobstersStory, sourceTag: string): RawNews {
  const key = `lobsters:${story.short_id}`
  const title = plain(story.title)
  const url = story.url || story.comments_url || `https://lobste.rs/s/${story.short_id}`
  const summary = clip(plain(story.description_plain || story.description))
  const createdAt = story.created_at || new Date().toISOString()
  const points = story.score ?? 0
  const comments = story.comment_count ?? 0
  const tagsList = (story.tags ?? []).map((t) => `tag:${t.toLowerCase()}`)
  const tags = ['source:lobsters', `tag:${sourceTag}`, ...tagsList]

  return {
    key,
    board: 'news',
    title,
    url,
    summary,
    tags: [...new Set(tags)],
    publishedAt: createdAt,
    sources: ['lobsters'],
    refs: refsOf(key, url, summary),
    metrics: { points, comments, frontPage: 0 },
    news: {
      hnId: parseInt(story.short_id, 36) || 0,
      hnUrl: story.comments_url || `https://lobste.rs/s/${story.short_id}`,
      domain: hostOf(url) || 'lobste.rs',
      author: story.submitter_user,
      points,
      comments,
      createdAt,
    },
  }
}

export function lobsters(config: Config): Source {
  void config
  return {
    id: 'lobsters',
    board: 'news',
    async fetch(ctx) {
      // 3 channels in order: release (default), ai, show
      const [releaseRes, aiRes, showRes] = await Promise.all([
        ctx.http.json<LobstersStory[]>('https://lobste.rs/t/release.json').catch(() => []),
        ctx.http.json<LobstersStory[]>('https://lobste.rs/t/ai.json').catch(() => []),
        ctx.http.json<LobstersStory[]>('https://lobste.rs/t/show.json').catch(() => []),
      ])

      const releaseStories = Array.isArray(releaseRes) ? releaseRes : []
      const aiStories = Array.isArray(aiRes) ? aiRes : []
      const showStories = Array.isArray(showRes) ? showRes : []

      const items = new Map<string, RawNews>()

      const addStories = (list: LobstersStory[], tag: string) => {
        for (const story of list) {
          if (!story || !story.short_id || !story.title) continue
          const existing = items.get(`lobsters:${story.short_id}`)
          if (existing) {
            if (!existing.tags.includes(`tag:${tag}`)) {
              existing.tags.push(`tag:${tag}`)
            }
          } else {
            const mapped = mapLobstersStory(story, tag)
            items.set(mapped.key, mapped)
          }
        }
      }

      addStories(releaseStories, 'release')
      addStories(aiStories, 'ai')
      addStories(showStories, 'show')

      return [...items.values()]
    },
  }
}
