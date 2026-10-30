import type { BoardConfig, Item, SubChannelData } from '../types.ts'
import { fetchGithub } from './github.ts'
import { fetchHackerNews } from './hackernews.ts'
import { fetchDevTo } from './devto.ts'
import { fetchLobsters } from './lobsters.ts'
import { fetchProductHunt } from './producthunt.ts'

export interface FetchResult {
  items: Item[]
  channels?: SubChannelData[]
}

export async function fetchBoard(boardConfig: BoardConfig): Promise<FetchResult> {
  switch (boardConfig.source) {
    case 'github': {
      const items = await fetchGithub(boardConfig)
      return { items }
    }
    case 'hackernews': {
      return await fetchHackerNews(boardConfig)
    }
    case 'devto': {
      return await fetchDevTo(boardConfig)
    }
    case 'lobsters': {
      return await fetchLobsters(boardConfig)
    }
    case 'producthunt': {
      const items = await fetchProductHunt(boardConfig)
      return { items }
    }
    default:
      console.warn(`[Pipeline] Unknown source adapter: ${boardConfig.source}`)
      return { items: [] }
  }
}
