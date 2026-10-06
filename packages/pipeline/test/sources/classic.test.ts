import { describe, expect, it } from 'vitest'
import { mapSearchRepo, type SearchRepo } from '../../src/sources/github-search.ts'
import { parseTrending } from '../../src/sources/github-trending.ts'
import { mapHnHit } from '../../src/sources/hacker-news.ts'
import { parseFeed } from '../../src/sources/feeds-parser.ts'
import { plain, stripMarkdown } from '../../src/sources/util.ts'
import { fx } from './helpers.ts'

describe('feeds', () => {
  it('reads pubDate and categories (recorded openai.com/news/rss.xml)', () => {
    const [first, second, third] = parseFeed(fx('openai-news.xml'))
    expect(first).toMatchObject({
      title: 'How Cooley is accelerating IPO work with ChatGPT',
      date: '2026-09-17T12:00:00.000Z',
    })
    expect(second.categories).toEqual(['Company'])
    expect(third.categories).toEqual(['Global Affairs'])
  })
})

describe('text helpers', () => {
  it('drop zero-width characters and spaces left by removed tags', () => {
    expect(plain('DeepSeek-V4.1-Flash Release<a href="#x">​</a>')).toBe('DeepSeek-V4.1-Flash Release')
    expect(plain('OCR 4.1 (<code>mistral-ocr-4-1</code>) is GA , now.')).toBe('OCR 4.1 (mistral-ocr-4-1) is GA, now.')
  })
  it('strip Markdown emphasis but keep identifiers with underscores', () => {
    expect(stripMarkdown('**Bold** and _em_ in `product_surface` via [docs](https://x)')).toBe(
      'Bold and em in product_surface via docs',
    )
  })
})
