import { describe, expect, it } from 'vitest'
import { endpointsOf, HELP, keyChecks, parseCli } from '../../src/cli.ts'
import type { Config } from '../../src/config.ts'
import { realConfig } from './make.ts'

describe('parseCli', () => {
  it('maps run options, with --date as the edition to close', () => {
    expect(parseCli(['run', '--date', '2026-09-18', '--no-enrich']).cmd).toEqual({
      command: 'run',
      date: '2026-09-18',
      enrich: false,
      pricing: true,
      fixtures: undefined,
    })
    expect(parseCli(['backfill', '--days', '7', '--data', 'tmp']).cmd).toEqual({ command: 'backfill', days: 7 })
    expect(parseCli([]).cmd).toEqual({ command: 'help' })
  })

  it('rejects what it cannot run, with one-line messages', () => {
    expect(() => parseCli(['backfill'])).toThrow('--days is required')
    expect(() => parseCli(['run', '--date', '2026-9-18'])).toThrow('--date must be YYYY-MM-DD')
    expect(() => parseCli(['run', '--fixtures', 'maybe'])).toThrow('--fixtures must be')
    expect(() => parseCli(['deploy'])).toThrow('Unknown command "deploy"')
  })

  it('documents editions and what backfill can and cannot fill', () => {
    expect(HELP).toContain('Edition D is [D cutoff, D+1 cutoff)')
    expect(HELP).toContain('(news, labs)')
    expect(HELP).toContain('Repos, hf and social cannot be backfilled')
  })
})

describe('doctor checks', () => {
  it('probes every enabled source, the labs sites and never a billed X read', async () => {
    const config = await realConfig()
    const ids = endpointsOf(config, {}).map((e) => e.id)
    expect(ids).toEqual(
      expect.arrayContaining(['github-trending', 'github-api', 'hf-trending', 'hacker-news']),
    )
    expect(ids).toEqual(expect.arrayContaining(Object.keys(config.sources.labs.companies).map((c) => `labs:${c}`)))
    // `auto` without a secret probes only the free feed.
    expect(ids.filter((id) => id.startsWith('x:'))).toEqual(['x:syndication'])

    const probe = endpointsOf(config, { X_BEARER_TOKEN: 'secret' }).find((e) => e.id === 'x:xapi')
    expect(probe).toMatchObject({ expect: 'reachable' })
    expect(JSON.stringify(probe)).not.toContain('secret')
  })

  it('fails only on keys the configuration requires', async () => {
    const config = await realConfig()
    expect(keyChecks(config, {}).filter((c) => c.ok === false)).toEqual([])
    const strict: Config = {
      ...config,
      sources: {
        ...config.sources,
        x: { ...config.sources.x, enabled: true, provider: 'socialdata' },
      },
    }
    expect(
      keyChecks(strict, {})
        .filter((c) => c.ok === false)
        .map((c) => c.label),
    ).toEqual(['SOCIALDATA_API_KEY'])
    expect(keyChecks(strict, { SOCIALDATA_API_KEY: 'k' }).every((c) => c.ok !== false)).toBe(true)
  })
})
