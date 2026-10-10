/** The source catalogue: which sources exist, whether config enables them, and how to build them. */
import type { Board } from '@resonance/schema'
import type { Config } from '../config.ts'
import type { CreateSources, Source } from '../types.ts'
import { githubSearch } from './github-search.ts'
import { githubTrending } from './github-trending.ts'
import { hackerNews } from './hacker-news.ts'
import { hfTrending } from './hf-trending.ts'
import { companySource, companyWeight, labCompanies } from './labs/index.ts'
import { SITES } from './labs/sites.ts'
import { xLinked, xSource } from './x/index.ts'

import { devTo } from './dev-to.ts'
import { lobsters } from './lobsters.ts'

export { noteOf, type SourceNote, statusOf, withNote } from './status.ts'
export { enqueueLinkedX, LINKED_QUEUE } from './x/linked.ts'

/** Catalogue row; `collect` reports disabled rows as `skipped` so an outage and a choice look different. */
export interface SourceSpec {
  id: string
  board: Board
  enabled: (config: Config) => boolean
  create: (config: Config) => Source
}

function labSpec(company: string): SourceSpec {
  return {
    id: `labs-${company}`,
    board: 'labs',
    enabled: (c) => c.sources.labs.enabled && companyWeight(company, c) > 0,
    create: (c) => companySource(company, c),
  }
}

/** Every core source with a fixed id, in display order. */
export const SOURCES: readonly SourceSpec[] = [
  { id: 'github-trending', board: 'repos', enabled: (c) => c.sources.githubTrending.enabled, create: githubTrending },
  { id: 'github-search', board: 'repos', enabled: (c) => c.sources.githubSearch.enabled, create: githubSearch },
  { id: 'hf-trending', board: 'hf', enabled: (c) => c.sources.hfTrending.enabled, create: hfTrending },
  { id: 'hacker-news', board: 'news', enabled: (c) => c.sources.hackerNews.enabled, create: hackerNews },
  { id: 'dev-to', board: 'news', enabled: (c) => c.sources.devTo.enabled, create: devTo },
  { id: 'lobsters', board: 'news', enabled: (c) => c.sources.lobsters.enabled, create: lobsters },
  // Paid providers stay unconstructed (no network, no cost) unless X is explicitly enabled.
  { id: 'x', board: 'social', enabled: (c) => c.sources.x.enabled, create: xSource },
  { id: 'x-linked', board: 'social', enabled: (c) => c.sources.x.linked, create: xLinked },
]

/**
 * The catalogue for one configuration: core `SOURCES` plus labs sources only when labs is enabled or configured.
 */
export function sourceSpecs(config: Config): SourceSpec[] {
  if (!config.sources.labs.enabled && !config.sources.labs.extraFeeds?.length) {
    return [...SOURCES]
  }
  const labSpecs = labCompanies(config).map(labSpec)
  return [...SOURCES, ...labSpecs]
}

/** The enabled sources for this configuration. */
export const createSources: CreateSources = (config) =>
  sourceSpecs(config)
    .filter((spec) => spec.enabled(config))
    .map((spec) => spec.create(config))

