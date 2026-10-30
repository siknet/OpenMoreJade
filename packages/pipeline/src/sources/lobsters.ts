import { fetchJson } from '../http.ts'
import type { BoardConfig, Item, SubChannelData } from '../types.ts'

interface LobstersStory {
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
  comments_url?: string
}

export async function fetchLobsters(boardConfig: BoardConfig): Promise<{ items: Item[]; channels: SubChannelData[] }> {
  const options = boardConfig.options || {}
  const channelsConfig = options.channels || [
    { id: 'release', name: 'Release 版本', url: 'https://lobste.rs/t/release.json', limit: 15 },
    { id: 'ai', name: 'AI 议题', url: 'https://lobste.rs/t/ai.json', limit: 15 },
    { id: 'show', name: 'Show 作品', url: 'https://lobste.rs/t/show.json', limit: 15 },
  ]

  const channels: SubChannelData[] = []
  const allItems: Item[] = []

  for (const ch of channelsConfig) {
    const limit = ch.limit || 15
    const url = ch.url || `https://lobste.rs/t/${ch.id}.json`

    try {
      const stories = await fetchJson<LobstersStory[]>(url, { timeoutMs: 12000 })
      const list = Array.isArray(stories) ? stories : []

      const channelItems: Item[] = []
      for (const story of list.slice(0, limit)) {
        if (!story || !story.short_id || !story.title) continue

        const mapped: Item = {
          id: `lobsters:${story.short_id}`,
          title: story.title.trim(),
          url: story.url || story.comments_url || `https://lobste.rs/s/${story.short_id}`,
          summary: (story.description_plain || story.description || '').trim(),
          source: 'lobsters',
          subChannel: ch.id,
          author: story.submitter_user || 'Lobste.rs User',
          tags: story.tags || [],
          publishedAt: story.created_at || new Date().toISOString(),
          metrics: {
            points: story.score || 0,
            comments: story.comment_count || 0,
          },
          extra: {
            commentsUrl: story.comments_url,
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
      console.warn(`[Lobste.rs] Failed to fetch channel ${ch.id}: ${err.message}`)
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
