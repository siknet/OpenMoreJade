import { describe, expect, it } from 'vitest'
import { classify, matchersOf, relevanceOf } from '../../src/classify.ts'
import type { Config } from '../../src/config.ts'
import type { RawCandidate } from '../../src/types.ts'
import { hfModel, lab, news, realConfig, repo, tweet } from './make.ts'

const kept = async (cands: RawCandidate[], config?: Config) =>
  classify(cands, config ?? (await realConfig())).map((c) => c.key)
const one = async (cand: RawCandidate) => {
  const config = await realConfig()
  return relevanceOf(cand, config.topic, matchersOf(config.topic))
}

describe('classify: on topic by construction', () => {
  it('passes hf models, lab posts and X posts of watched lab accounts with a fixed reason', async () => {
    const config = await realConfig()
    const out = classify(
      [
        hfModel('MiniMax/MiniMax-H3-Reason'),
        lab('https://www.anthropic.com/news/claude-opus-5', 'Introducing Claude Opus 5', 'model'),
        tweet('1', 'This is GPT-6 Astra.\n\nAnything you can do on a computer, Astra can do for you. Fast.', 'lab'),
        tweet('2', 'Happy Friday everyone, enjoy the weekend', 'lab'),
      ],
      config,
    )
    expect(out.map((c) => [c.key, c.relevance])).toEqual([
      ['hf:minimax/minimax-h3-reason', { score: 1, reasons: ['model:hf'] }],
      ['url:anthropic.com/news/claude-opus-5', { score: 1, reasons: ['lab:anthropic'] }],
      ['x:1', { score: 1, reasons: ['watch:lab'] }],
      ['x:2', { score: 1, reasons: ['watch:lab'] }],
    ])
  })
})

describe('classify: social posts need topic evidence', () => {
  it('keeps watched people only when the post is about AI', async () => {
    const off = tweet('10', 'happy thanksgiving to everyone, grateful for this team', 'person')
    const on = tweet('11', 'GPT-6 is remarkably good at long-horizon tasks', 'person')
    // Real post (recorded oEmbed/tweet-result fixture): the author is not on the watch list.
    const linked = tweet(
      '2101009392611278961',
      "We're adding support for AGENTS.md to Claude Code. \n\nStarting today in version 2.1.277, if there is no CLAUDE.md in a folder, Claude will check for and use AGENTS.md.",
      'community',
    )
    expect(await kept([off, on, linked])).toEqual(['x:11', 'x:2101009392611278961'])
    expect((await one(on)).reasons).toEqual(['kw:gpt'])
  })

  it('keeps the known false-positive traps out, in social text too', async () => {
    const traps = [
      tweet('t3', 'Claude Shannon would have loved this puzzle', 'person'),
      tweet('t4', 'Show HN: Hacker News, Without AI', 'person'),
    ]
    expect(await kept(traps)).toEqual([])
  })
})

describe('classify: repos and news (unchanged v1 rules)', () => {
  it('judges HN by title only and repos by description and topics', async () => {
    const story = news(1, 'Anthropic raises $30B Series G')
    const noisy = news(2, 'Show HN: A calendar app', { summary: 'built with an LLM agent and RAG' })
    const topical = repo('acme/tool', { topics: ['llm', 'rag'], description: 'A small utility' })
    const plainRepo = repo('acme/css', { description: 'A CSS framework' })
    expect(await kept([story, noisy, topical, plainRepo])).toEqual(['hn:1', 'gh:acme/tool'])
  })

  it('lets config.topic.exclude veto on-topic-by-construction posts too', async () => {
    const config = await realConfig()
    const custom: Config = { ...config, topic: { ...config.topic, exclude: ['astra'] } }
    const story = news(3, 'OpenAI Astra for Law')
    const post = tweet('9', 'Astra is live', 'lab')
    expect(await kept([story, post], custom)).toEqual([])
  })
})
