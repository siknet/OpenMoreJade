import { fetchJson } from '../http.ts'
import type { BoardConfig, Item, SubChannelData } from '../types.ts'

interface DevToArticle {
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
    profile_image_90?: string
  }
}

export async function fetchDevTo(boardConfig: BoardConfig): Promise<{ items: Item[]; channels: SubChannelData[] }> {
  const options = boardConfig.options || {}
  const channelsConfig = options.channels || [
    { id: 'latest', name: '最新精选', url: 'https://dev.to/api/articles?per_page=30', limit: 15 },
    { id: 'opensource', name: '开源专区', url: 'https://dev.to/api/articles?tag=opensource&per_page=30', limit: 15 },
  ]

  const channels: SubChannelData[] = []
  const allItems: Item[] = []

  for (const ch of channelsConfig) {
    const limit = ch.limit || 15
    const url = ch.url || `https://dev.to/api/articles?per_page=30`

    try {
      const articles = await fetchJson<DevToArticle[]>(url, { timeoutMs: 12000 })
      const list = Array.isArray(articles) ? articles : []

      const channelItems: Item[] = []
      for (const article of list.slice(0, limit)) {
        if (!article || !article.id || !article.title) continue

        let tags: string[] = []
        if (Array.isArray(article.tag_list)) {
          tags = article.tag_list
        } else if (typeof article.tag_list === 'string') {
          tags = article.tag_list.split(',').map((t) => t.trim())
        }

        const points = article.public_reactions_count ?? article.positive_reactions_count ?? 0
        const comments = article.comments_count ?? 0

        const mapped: Item = {
          id: `devto:${article.id}`,
          title: article.title.trim(),
          url: article.url,
          summary: article.description?.trim() || '',
          source: 'devto',
          subChannel: ch.id,
          author: article.user?.name || article.user?.username || 'Dev.to Author',
          avatar: article.user?.profile_image_90,
          tags,
          publishedAt: article.published_at || article.created_at || new Date().toISOString(),
          metrics: {
            points,
            comments,
          },
        }

        channelItems.push(mapped)
        allItems.push(mapped)
      }

      channels.push({
        id: ch.id,
        name: ch.name,
        items: channelItems,
      })
    } catch (err: any) {
      console.warn(`[Dev.to] Failed to fetch channel ${ch.id}: ${err.message}`)
      channels.push({
        id: ch.id,
        name: ch.name,
        items: [],
      })
    }
  }

  return {
    items: allItems,
    channels,
  }
}
