import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { assignEditions } from '../../src/edition.ts'
import { mergeByKey } from '../../src/link.ts'
import { publishAll } from '../../src/publish/index.ts'
import { fileEditions } from '../../src/run.ts'
import { rankDay } from '../../src/score.ts'
import { createStore } from '../../src/store.ts'
import { labPost, memoryStore, openSnapshot, silent, snapshot, story, testConfig } from '../derive/fixture.ts'

const roots: string[] = []
async function temp() {
  const root = await mkdtemp(join(tmpdir(), 'res-settlement-'))
  roots.push(root)
  return root
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
const statuses = (stamp: string, failed: boolean) => [
  {
    id: 'hacker-news',
    board: 'news' as const,
    state: failed ? ('failed' as const) : ('ok' as const),
    count: failed ? 0 : 1,
    fetchedAt: stamp,
  },
  { id: 'github-search', board: 'repos' as const, state: 'ok' as const, count: 1, fetchedAt: stamp },
]

describe('edition recovery and immutable source readings', () => {
  it('retries a failed source after the next cutoff while keeping completed sources and their clocks unchanged', async () => {
    const cfg = await testConfig()
    const store = createStore(await temp(), 183)
    const event = '2026-09-18T23:00:00.000Z'
    const repo = { ...openSnapshot().candidates[0], sources: ['github-search'] }
    await store.writeSnapshot(
      snapshot('2026-09-18', [story(1, event, { points: 10, comments: 1 }), repo], {
        settled: false,
        fetchedAt: '2026-09-19T01:00:00.000Z',
        sources: statuses('2026-09-19T01:00:00.000Z', false),
      }),
    )
    const failedAt = '2026-09-19T08:00:00.000Z'
    await fileEditions(store, { candidates: [], sources: statuses(failedAt, true) }, new Date(failedAt), cfg)
    let day = (await store.readSnapshot('2026-09-18'))!
    expect(day.window.settled).toBe(false)
    expect(day.sources.find((s) => s.id === 'github-search')?.settledAt).toBe(failedAt)
    const recovery = '2026-09-20T01:00:00.000Z'
    await fileEditions(
      store,
      {
        candidates: [story(1, event, { points: 500, comments: 100 }), { ...repo, metrics: { stars: 999999 } }],
        sources: statuses(recovery, false),
      },
      new Date(recovery),
      cfg,
    )
    day = (await store.readSnapshot('2026-09-18'))!
    expect(day.window.settled).toBe(true)
    expect(day.candidates.find((c) => c.key === 'hn:1')?.metrics.points).toBe(500)
    expect(day.candidates.find((c) => c.board === 'repos')?.metrics).toEqual(repo.metrics)
    expect(day.sources.find((s) => s.id === 'github-search')?.fetchedAt).toBe(failedAt)
  })

  it('does not treat cached Reddit data as a successful settle refresh', async () => {
    const cfg = await testConfig()
    const store = createStore(await temp(), 183)
    await store.writeSnapshot(snapshot('2026-09-18', [], { settled: false }))
    const at = '2026-09-19T09:00:00.000Z'
    await fileEditions(
      store,
      {
        candidates: [],
        sources: [
          ...statuses(at, false),
          {
            id: 'reddit',
            board: 'social',
            state: 'ok',
            count: 30,
            mode: 'cached',
            fetchedAt: at,
          },
        ],
      },
      new Date(at),
      cfg,
    )
    expect((await store.readSnapshot('2026-09-18'))!.window.settled).toBe(false)
  })

  it('freezes an existing lab metric while permitting a genuinely late new post', async () => {
    const cfg = await testConfig()
    const store = createStore(await temp(), 183)
    const lab = labPost('https://example.org/model', 'openai', 'model', '2026-09-17T12:00:00.000Z', {
      title: 'New model',
      hfLikes: 1,
    })
    await store.writeSnapshot(snapshot('2026-09-17', [lab]))
    const before = rankDay((await store.readSnapshot('2026-09-17'))!, [], cfg, {}).boards.labs.top[0].score
    const at = '2026-09-19T11:00:00.000Z'
    await fileEditions(
      store,
      { candidates: [{ ...lab, metrics: { hfLikes: 500 } }], sources: statuses(at, false) },
      new Date(at),
      cfg,
    )
    const frozen = (await store.readSnapshot('2026-09-17'))!
    expect(frozen.candidates[0].metrics.hfLikes).toBe(1)
    expect(rankDay(frozen, [], cfg, {}).boards.labs.top[0].score).toEqual(before)
  })
})



it('publishes a usable manifest and latest alias with only an open edition, then transitions to a closed one', async () => {
  const cfg = await testConfig()
  const store = memoryStore([openSnapshot()])
  const outDir = join(await temp(), 'api', 'v1')
  const publish = (today: string, openDate: string, now: string) =>
    publishAll({ store, config: cfg, outDir, today, openDate, now: new Date(now), pricing: null, log: silent })
  const json = async (file: string) => JSON.parse(await readFile(join(outDir, file), 'utf8'))
  await publish('2026-09-18', '2026-09-19', '2026-09-19T10:30:00Z')
  expect(await json('manifest.json')).toMatchObject({
    latest: '2026-09-19',
    latestKind: 'live',
    live: '2026-09-19',
    dates: [],
    weeks: [],
  })
  expect(await json('latest.json')).toEqual(await json('live.json'))
  store.snapshots.set(
    '2026-09-18',
    snapshot('2026-09-18', [story(1, '2026-09-18T16:00:00Z', { points: 100, comments: 10 })]),
  )
  await publish('2026-09-18', '2026-09-19', '2026-09-19T11:30:00Z')
  expect((await json('manifest.json')).latestKind).toBeUndefined()
  expect((await json('latest.json')).date).toBe('2026-09-18')
})
