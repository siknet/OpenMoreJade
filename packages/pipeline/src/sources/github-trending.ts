/**
 * github.com/trending scrape — the only place that knows "stars today". Server-rendered HTML; we anchor on the
 * stable bits (article.Box-row, h2 a[href], itemprop, /stargazers, /forks, "N stars today") because GitHub's
 * utility classes are mid-migration.
 */
import { repoKey } from '@resonance/schema'
import { type HTMLElement, parse } from 'node-html-parser'
import type { Config } from '../config.ts'
import type { RawRepo, Source } from '../types.ts'
import { clip, dedupe, plain, refsOf } from './util.ts'

/** Fewer rows than this across all pages means the markup changed, not that GitHub had a quiet day. */
const MIN_ROWS = 5
const DELTA = /([\d,]+)\s+stars?\s+(?:today|this week|this month)/

const int = (text: string | undefined) => Number.parseInt((text ?? '').replace(/[^\d]/g, ''), 10) || 0

function parseRow(row: HTMLElement, scope: 'daily' | 'weekly' | 'monthly'): RawRepo | null {
  // The first link in a row is a /login?return_to=… star button, so go through the heading.
  const path = row.querySelector('h2 a')?.getAttribute('href') ?? ''
  const [owner, name] = path.replace(/^\//, '').split('/')
  if (!owner || !name) return null
  const key = repoKey(owner, name)
  const summary = clip(plain(row.querySelector('p')?.text))
  const language = plain(row.querySelector('[itemprop="programmingLanguage"]')?.text) || undefined
  const stars = int(row.querySelector('a[href$="/stargazers"]')?.text)
  const forks = int(row.querySelector('a[href$="/forks"]')?.text)
  const deltaStars = int(DELTA.exec(row.text)?.[1])
  const starsToday = scope === 'daily' ? deltaStars : 0

  return {
    key,
    board: 'repos',
    title: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
    summary,
    tags: [`trend:${scope}`],
    sources: ['github-trending'],
    refs: refsOf(key, summary),
    metrics: {
      stars,
      forks,
      starsToday,
      ...(scope === 'weekly' ? { starsWeekly: deltaStars } : {}),
      ...(scope === 'monthly' ? { starsMonthly: deltaStars } : {}),
    },
    repo: {
      owner,
      name,
      avatar: `https://github.com/${owner}.png?size=64`,
      language,
      topics: [`trend:${scope}`],
      stars,
      forks,
      starsToday,
    },
  }
}

/** Rows of one trending page. */
export function parseTrending(html: string, scope: 'daily' | 'weekly' | 'monthly' = 'daily'): RawRepo[] {
  return parse(html)
    .querySelectorAll('article.Box-row')
    .map((row) => parseRow(row, scope))
    .filter((repo) => repo !== null)
}

/** Scrapes official GitHub Trending for daily, weekly, and monthly scopes across configured languages. */
export function githubTrending(config: Config): Source {
  const { languages } = config.sources.githubTrending
  const scopes: Array<'daily' | 'weekly' | 'monthly'> = ['daily', 'weekly', 'monthly']

  return {
    id: 'github-trending',
    board: 'repos',
    async fetch(ctx) {
      const repos: RawRepo[] = []
      for (const scope of scopes) {
        for (const language of languages) {
          const url = `https://github.com/trending${language ? `/${encodeURIComponent(language)}` : ''}?since=${scope}`
          try {
            const rows = parseTrending(await ctx.http.text(url, { minGap: 1500 }), scope)
            if (rows.length === 0) ctx.log.warn(`github-trending: no rows on ${url}`)
            repos.push(...rows)
          } catch (err) {
            ctx.log.warn(`github-trending (${scope}): ${(err as Error).message}`)
          }
        }
      }
      if (repos.length < MIN_ROWS) throw new Error(`only ${repos.length} rows parsed from trending pages`)

      // Deduplicate repos, merging trend tags and metrics
      const merged = new Map<string, RawRepo>()
      for (const repo of repos) {
        const existing = merged.get(repo.key)
        if (!existing) {
          merged.set(repo.key, repo)
        } else {
          // Merge trend tags
          for (const t of repo.tags) {
            if (!existing.tags.includes(t)) existing.tags.push(t)
            if (!existing.repo.topics.includes(t)) existing.repo.topics.push(t)
          }
          // Merge metrics
          existing.metrics = { ...existing.metrics, ...repo.metrics }
          if (repo.metrics.starsToday && !existing.metrics.starsToday) {
            existing.metrics.starsToday = repo.metrics.starsToday
            existing.repo.starsToday = repo.repo.starsToday
          }
        }
      }

      return [...merged.values()]
    },
  }
}
