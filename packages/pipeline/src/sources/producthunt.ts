import { XMLParser } from 'fast-xml-parser'
import { fetchJson, fetchText } from '../http.ts'
import type { BoardConfig, Item } from '../types.ts'

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
})

function cleanHtml(html?: string): string {
  if (!html) return ''
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 官方 GraphQL API 查询（当配置了 PRODUCT_HUNT_TOKEN 时）
 */
async function fetchViaGraphQL(token: string, limit: number): Promise<Item[]> {
  const query = `
    query GetDailyPosts($first: Int!) {
      posts(first: $first, order: VOTES) {
        edges {
          node {
            id
            name
            tagline
            description
            url
            votesCount
            commentsCount
            website
            thumbnail {
              url
            }
            createdAt
          }
        }
      }
    }
  `

  const res = await fetchJson<any>('https://api.producthunt.com/v2/api/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables: { first: limit } }),
    timeoutMs: 15000,
  })

  const edges = res?.data?.posts?.edges || []
  return edges.map((edge: any) => {
    const node = edge.node
    return {
      id: `ph:${node.id}`,
      title: `${node.name} - ${node.tagline || ''}`.trim(),
      url: node.website || node.url,
      summary: node.description || node.tagline || '',
      source: 'producthunt',
      author: node.name,
      avatar: node.thumbnail?.url,
      publishedAt: node.createdAt || new Date().toISOString(),
      metrics: {
        votes: node.votesCount || 0,
        comments: node.commentsCount || 0,
      },
      extra: {
        productHuntUrl: node.url,
      },
    }
  })
}

/**
 * 官方免鉴权 RSS/Atom Feed 备选方案（开箱即用，无需申请 API Token）
 */
async function fetchViaRssFeed(feedUrl: string, limit: number): Promise<Item[]> {
  const xml = await fetchText(feedUrl, { timeoutMs: 15000 })
  const result = xmlParser.parse(xml)
  const items = result?.feed?.entry || result?.rss?.channel?.item || []
  const list = Array.isArray(items) ? items : [items]

  const parsedItems: Item[] = []
  for (const entry of list.slice(0, limit)) {
    const title = entry.title || ''

    // 提取真实的 URL（兼容 Atom 的 link 对象与 RSS 的 link 字符串）
    let url = ''
    if (typeof entry.link === 'string') {
      url = entry.link
    } else if (entry.link?.['@_href']) {
      url = entry.link['@_href']
    } else if (Array.isArray(entry.link)) {
      const alt = entry.link.find((l: any) => l['@_rel'] === 'alternate') || entry.link[0]
      url = alt?.['@_href'] || ''
    }

    // 提取摘要文本（优先从 content 获取，兼容 summary 与 description）
    let rawContent = ''
    if (typeof entry.content === 'string') {
      rawContent = entry.content
    } else if (entry.content?.['#text']) {
      rawContent = entry.content['#text']
    } else if (typeof entry.summary === 'string') {
      rawContent = entry.summary
    } else if (entry.summary?.['#text']) {
      rawContent = entry.summary['#text']
    } else if (entry.description) {
      rawContent = typeof entry.description === 'string' ? entry.description : (entry.description['#text'] || '')
    }

    // 过滤掉 Discussion | Link 这类模板尾巴
    let summary = cleanHtml(rawContent)
    summary = summary.replace(/Discussion\s*\|\s*Link/gi, '').trim()

    const author = entry.author?.name || ''
    const pubDate = entry.published || entry.pubDate || entry.updated || new Date().toISOString()

    // 提取绝对唯一的 ID，防止全部重复
    let uniqueId = ''
    if (entry.id && typeof entry.id === 'string') {
      uniqueId = entry.id.replace(/^tag:www\.producthunt\.com,\d+:/, '').replace(/[^a-zA-Z0-9_-]/g, '_')
    } else if (url) {
      uniqueId = url.replace(/[^a-zA-Z0-9_-]/g, '_')
    } else {
      uniqueId = encodeURIComponent(title)
    }

    parsedItems.push({
      id: `ph:${uniqueId}`,
      title,
      url: url || 'https://www.producthunt.com',
      summary,
      source: 'producthunt',
      author,
      publishedAt: new Date(pubDate).toISOString(),
      metrics: {
        votes: 0,
      },
      extra: {
        productHuntUrl: url,
      },
    })
  }

  return parsedItems
}

export async function fetchProductHunt(boardConfig: BoardConfig): Promise<Item[]> {
  const options = boardConfig.options || {}
  const limit = boardConfig.limit || 15
  const tokenEnv = options.tokenEnv || 'PRODUCT_HUNT_TOKEN'
  const token = process.env[tokenEnv] || process.env.PH_TOKEN

  if (token) {
    try {
      console.log('[Product Hunt] Using official GraphQL API...')
      return await fetchViaGraphQL(token, limit)
    } catch (err: any) {
      console.warn(`[Product Hunt] GraphQL API failed (${err.message}), falling back to official RSS feed...`)
    }
  }

  const feedUrl = options.feedUrl || 'https://www.producthunt.com/feed'
  console.log(`[Product Hunt] Fetching from official feed: ${feedUrl}`)
  return await fetchViaRssFeed(feedUrl, limit)
}
