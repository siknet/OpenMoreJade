import { describe, expect, it } from 'vitest'
import { hfTrending, type HfTrendingModel, mapHfTrendingModel } from '../../src/sources/hf-trending.ts'
import type { Config } from '../../src/config.ts'
import type { RunContext } from '../../src/types.ts'

describe('hf-trending', () => {
  const sampleModel: HfTrendingModel = {
    _id: '6aacc6b34a8e10ba66ac6d0f',
    id: 'convaiinnovations/laya',
    likes: 4867,
    trendingScore: 1207,
    private: false,
    downloads: 0,
    tags: [
      'transformers',
      'safetensors',
      'laya',
      'classification',
      'text-classification',
    ],
    pipeline_tag: 'text-classification',
    library_name: 'transformers',
    createdAt: '2026-09-18T05:05:55.000Z',
    modelId: 'convaiinnovations/laya',
  }

  it('maps HF trending model fields correctly', () => {
    const item = mapHfTrendingModel(sampleModel, 1.0)
    expect(item.board).toBe('hf')
    expect(item.title).toBe('convaiinnovations/laya')
    expect(item.url).toBe('https://huggingface.co/convaiinnovations/laya')
    expect(item.key).toBe('hf:convaiinnovations/laya')
    expect(item.publishedAt).toBeUndefined()
    expect(item.metrics.hf_likes).toBe(4867)
    expect(item.metrics.trending_score).toBe(1207)
    expect(item.hf.likes).toBe(4867)
    expect(item.hf.trendingScore).toBe(1207)
    expect(item.hf.modelCreatedAt).toBe('2026-09-18')
    expect(item.hf.category).toBe('text-classification')
  })

  it('fetches and dedupes items from HF api', async () => {
    const mockHttp = {
      json: async () => [sampleModel],
      text: async () => '',
    }
    const config = {
      sources: {
        hfTrending: { enabled: true, limit: 10, prior: 1 },
      },
    } as unknown as Config
    const ctx = {
      http: mockHttp,
      log: { warn: () => {}, info: () => {}, error: () => {} },
    } as unknown as RunContext

    const source = hfTrending(config)
    expect(source.id).toBe('hf-trending')
    expect(source.board).toBe('hf')
    const items = await source.fetch(ctx)
    expect(items).toHaveLength(1)
    expect(items[0].title).toBe('convaiinnovations/laya')
  })
})
