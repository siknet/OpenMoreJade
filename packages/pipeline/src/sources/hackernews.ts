import { fetchJson } from '../http.ts'
import type { BoardConfig, Item, SubChannelData } from '../types.ts'

interface HnItemPayload {
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

function cleanText(htmlText?: string): string {
  if (!htmlText) return ''
  return htmlText
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function fetchHackerNews(boardConfig: BoardConfig): Promise<{ items: Item[]; channels: SubChannelData[] }> {
  const options = boardConfig.options || {}
  const channelsConfig = options.channels || [
    { id: 'top', name: 'TOP 热门', endpoint: 'https://hacker-news.firebaseio.com/v0/topstories.json', limit: 15 },
    { id: 'show', name: 'SHOW 自荐', endpoint: 'https://hacker-news.firebaseio.com/v0/showstories.json', limit: 15 },
    { id: 'best', name: 'BEST 精选', endpoint: 'https://hacker-news.firebaseio.com/v0/beststories.json', limit: 15 },
  ]

  const channels: SubChannelData[] = []
  const allItems: Item[] = []

  for (const ch of channelsConfig) {
    const limit = ch.limit || 15
    const endpoint = ch.endpoint || `https://hacker-news.firebaseio.com/v0/${ch.id}stories.json`

    try {
      const ids = await fetchJson<number[]>(endpoint, { timeoutMs: 12000 })
      const targetIds = (ids || []).slice(0, limit)

      // 并发拉取对应详情
      const details = await Promise.all(
        targetIds.map(async (id) => {
          try {
            return await fetchJson<HnItemPayload>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, { timeoutMs: 8000 })
          } catch {
            return null
          }
        }),
      )

      const channelItems: Item[] = []
      for (const item of details) {
        if (!item || !item.id || !item.title) continue
        const hnUrl = `https://news.ycombinator.com/item?id=${item.id}`
        const primaryUrl = item.url || hnUrl
        const summary = cleanText(item.text) || ''

        const mapped: Item = {
          id: `hn:${item.id}`,
          title: item.title,
          url: primaryUrl,
          summary,
          source: 'hackernews',
          subChannel: ch.id,
          author: item.by || 'unknown',
          publishedAt: item.time ? new Date(item.time * 1000).toISOString() : new Date().toISOString(),
          metrics: {
            points: item.score || 0,
            comments: item.descendants || 0,
          },
          extra: {
            hnUrl,
            hnId: item.id,
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
      console.warn(`[Hacker News] Failed to fetch channel ${ch.id}: ${err.message}`)
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
