import { parse, type HTMLElement } from 'node-html-parser'
import { fetchText } from '../http.ts'
import type { BoardConfig, Item } from '../types.ts'

const DELTA_REGEX = /([\d,]+)\s+stars?\s+(?:today|this week|this month)/i
const int = (str?: string) => (str ? Number.parseInt(str.replace(/[^\d]/g, ''), 10) || 0 : 0)

function parseTrendingRow(row: HTMLElement): Item | null {
  const path = row.querySelector('h2 a')?.getAttribute('href')?.trim()
  if (!path) return null

  const cleanPath = path.replace(/^\//, '')
  const [owner, name] = cleanPath.split('/')
  if (!owner || !name) return null

  const title = `${owner}/${name}`
  const summary = row.querySelector('p')?.text.trim() || ''
  const language = row.querySelector('[itemprop="programmingLanguage"]')?.text.trim() || ''
  const stars = int(row.querySelector('a[href$="/stargazers"]')?.text)
  const forks = int(row.querySelector('a[href$="/forks"]')?.text)
  const starsToday = int(DELTA_REGEX.exec(row.text)?.[1])

  return {
    id: `github:${cleanPath}`,
    title,
    url: `https://github.com/${cleanPath}`,
    summary,
    source: 'github',
    author: owner,
    avatar: `https://github.com/${owner}.png?size=64`,
    tags: language ? [language] : [],
    metrics: {
      stars,
      forks,
      starsToday,
    },
    publishedAt: new Date().toISOString(),
  }
}

export async function fetchGithub(boardConfig: BoardConfig): Promise<Item[]> {
  const options = boardConfig.options || {}
  const languages: string[] = options.languages || ['']
  const since: string = options.since || 'daily'
  const limit: number = boardConfig.limit || 10
  const baseUrl: string = (options.baseUrl || 'https://github.com').replace(/\/+$/, '')

  const itemsMap = new Map<string, Item>()

  // 并行抓取各个语言的 Trending 页面
  const fetchTasks = languages.map(async (lang) => {
    const url = `${baseUrl}/trending${lang ? `/${encodeURIComponent(lang)}` : ''}?since=${since}`
    try {
      const html = await fetchText(url, { timeoutMs: 15000 })
      const root = parse(html)
      const rows = root.querySelectorAll('article.Box-row')

      const parsedItems: Item[] = []
      for (const row of rows) {
        const item = parseTrendingRow(row)
        if (item) {
          parsedItems.push(item)
        }
      }
      return { lang, items: parsedItems }
    } catch (err: any) {
      console.warn(`[GitHub Trending] Failed fetching ${url}: ${err.message}`)
      return { lang, items: [] }
    }
  })

  const results = await Promise.allSettled(fetchTasks)
  for (const res of results) {
    if (res.status === 'fulfilled' && res.value.items) {
      for (const item of res.value.items) {
        if (!itemsMap.has(item.id)) {
          itemsMap.set(item.id, item)
        }
      }
    }
  }

  // 严格按今日 Star 降序排序，并截取配置指定的 Top N 条（彻底移除候选队列）
  const allItems = Array.from(itemsMap.values())
  allItems.sort((a, b) => (b.metrics?.starsToday ?? 0) - (a.metrics?.starsToday ?? 0))

  return allItems.slice(0, limit)
}
