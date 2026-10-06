/**
 * Hugging Face Trending Models source.
 * Official API: https://huggingface.co/api/models?sort=trendingScore&limit=...
 */
import type { Config } from '../config.ts'
import type { RawHf, Source } from '../types.ts'
import { hfKey } from '@resonance/schema'
import { clip, dedupe, plain } from './util.ts'

export interface HfTrendingModel {
  _id?: string
  id: string
  likes?: number
  trendingScore?: number
  private?: boolean
  downloads?: number
  tags?: string[]
  pipeline_tag?: string
  library_name?: string
  createdAt?: string
  modelId?: string
}

function formatYMD(dateStr?: string): string | undefined {
  if (!dateStr) return undefined
  try {
    const d = new Date(dateStr)
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10)
    }
  } catch {
    // fallback
  }
  return dateStr.slice(0, 10)
}

export function mapHfTrendingModel(model: HfTrendingModel, prior: number): RawHf {
  const modelId = model.id
  const url = `https://huggingface.co/${modelId}`
  const key = hfKey(modelId)
  const pipelineTag = model.pipeline_tag || ''
  const summary = pipelineTag ? `Category: ${pipelineTag}` : ''
  const tags = [pipelineTag, ...(model.tags ?? [])].filter(Boolean).slice(0, 8)
  const upvotes = model.likes ?? 0
  const formattedDate = formatYMD(model.createdAt)

  return {
    key,
    board: 'hf',
    title: plain(modelId),
    url,
    summary: clip(summary),
    tags,
    publishedAt: undefined,
    sources: ['hf-trending'],
    refs: [],
    metrics: {
      hfUpvotes: upvotes,
      trendingScore: model.trendingScore ?? 0,
      hf_likes: upvotes,
      trending_score: model.trendingScore ?? 0,
      prior,
    },
    hf: {
      id: modelId,
      url,
      author: modelId.includes('/') ? modelId.split('/')[0] : undefined,
      category: pipelineTag || undefined,
      tags,
      likes: upvotes,
      trendingScore: model.trendingScore,
      modelCreatedAt: formattedDate,
    },
  }
}

export function hfTrending(config: Config): Source {
  const { limit, prior } = config.sources.hfTrending
  return {
    id: 'hf-trending',
    board: 'hf',
    async fetch(ctx) {
      const url = `https://huggingface.co/api/models?sort=trendingScore&limit=${limit}`
      try {
        const rows = await ctx.http.json<HfTrendingModel[]>(url, { timeout: 15_000 })
        if (!Array.isArray(rows)) throw new Error(`unexpected response shape from ${url}`)
        const items = rows
          .filter((row) => row && row.id)
          .map((row) => mapHfTrendingModel(row, prior))
        return dedupe(items, (a, b) => (b.metrics.hfUpvotes > a.metrics.hfUpvotes ? b : a))
      } catch (err) {
        ctx.log.warn(`hf-trending: ${(err as Error).message}`)
        throw err
      }
    },
  }
}
