/** dev.to articles source: latest articles and tag=opensource articles */
import type { Config } from '../config.ts'
import type { RawNews, Source } from '../types.ts'
import { clip, hostOf, plain, refsOf } from './util.ts'

export interface DevToArticle {
  id: number
  title: string
  description?: string
  url: string
  comments_count?: number
  public_reactions_count?: number
  positive_reactions_count?: number
  published_at?: string
  created_at?: string
  tag_list?: string[] | string
  tags?: string
  user?: {
    name?: string
    username?: string
  }
}

export function mapDevToArticle(article: DevToArticle, isOpensourceTab = false): RawNews {
  const key = `devto:${article.id}`
  const title = plain(article.title)
  const url = article.url
  const summary = clip(plain(article.description))
  const createdAt = article.published_at || article.created_at || new Date().toISOString()
  const points = article.public_reactions_count ?? article.positive_reactions_count ?? 0
  const comments = article.comments_count ?? 0
  
  let tagList: string[] = []
  if (Array.isArray(article.tag_list)) {
    tagList = article.tag_list
  } else if (typeof article.tag_list === 'string') {
    tagList = article.tag_list.split(',').map((t) => t.trim().toLowerCase())
  } else if (typeof article.tags === 'string') {
    tagList = article.tags.split(',').map((t) => t.trim().toLowerCase())
  }

  const tags = ['source:dev-to', ...tagList.map((t) => `tag:${t}`)]
  if (isOpensourceTab) {
    tags.push('tab:opensource')
  }

  return {
    key,
    board: 'news',
    title,
    url,
    summary,
    tags,
    publishedAt: createdAt,
    sources: ['dev-to'],
    refs: refsOf(key, url, summary),
    metrics: { points, comments, frontPage: 0 },
    news: {
      hnId: article.id,
      hnUrl: url,
      domain: hostOf(url) || 'dev.to',
      author: article.user?.name || article.user?.username,
      points,
      comments,
      createdAt,
    },
  }
}

export function devTo(config: Config): Source {
  void config
  return {
    id: 'dev-to',
    board: 'news',
    async fetch(ctx) {
      // 1. Fetch latest articles (default feed)
      // 2. Fetch tag=opensource articles
      const [latestRes, opensourceRes] = await Promise.all([
        ctx.http.json<DevToArticle[]>('https://dev.to/api/articles?per_page=30').catch(() => []),
        ctx.http.json<DevToArticle[]>('https://dev.to/api/articles?tag=opensource&per_page=30').catch(() => []),
      ])

      const latestArticles = Array.isArray(latestRes) ? latestRes : []
      const opensourceArticles = Array.isArray(opensourceRes) ? opensourceRes : []

      const items = new Map<string, RawNews>()

      for (const item of latestArticles) {
        if (!item || !item.id || !item.title) continue
        const mapped = mapDevToArticle(item, false)
        items.set(mapped.key, mapped)
      }

      for (const item of opensourceArticles) {
        if (!item || !item.id || !item.title) continue
        const existing = items.get(`devto:${item.id}`)
        if (existing) {
          if (!existing.tags.includes('tab:opensource')) {
            existing.tags.push('tab:opensource')
          }
        } else {
          const mapped = mapDevToArticle(item, true)
          items.set(mapped.key, mapped)
        }
      }

      return [...items.values()]
    },
  }
}
