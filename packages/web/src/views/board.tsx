/**
 * One board column: header (title, subtitle, look-back, source chips), the top N cards, and collapsible runners-up.
 * An empty board is never hidden: it explains itself with its source status (DESIGN §3a).
 */
import type { Board, BoardMeta, Category, DailyFile, DateStr, Item, RepoItem, SourceStatus } from '@resonance/schema'
import { useState } from 'preact/hooks'
import { fmt, localized, t } from '../i18n/index.ts'
import { ItemCard, RunnerRow } from '../items/card.tsx'
import { boardTitle, categoryLabel, notableSources, sourceName, staleSince } from '../items/text.ts'
import { SourceChip } from '../shell/status.tsx'
import { boardHue } from '../ui/chip.tsx'
import { Icon } from '../ui/icons.tsx'
import { EmptyState } from '../ui/state.tsx'

export interface BoardColumnProps {
  board: Board
  day: DailyFile
  date?: DateStr | 'live'
  meta?: BoardMeta
  category: Category | null
  /** Grid span on the front-page layout (set by Today). */
  span?: number
  /** Narrow layout: the board switcher labels the region instead of the heading. */
  panelProps?: Record<string, unknown>
  /**
   * Items on this board before the reader's own filters (unread / following / mute rules) shaped `day`. When those
   * filters empty a board that had news, it says so instead of blaming the edition or its sources.
   */
  total?: number
}

const matches = (category: Category | null) => (it: Item) => !category || it.category === category

function EmptyBoard({
  board,
  sources,
  category,
  hadItems,
  readingHidden,
}: {
  board: Board
  sources: SourceStatus[]
  category: Category | null
  hadItems: boolean
  /** The reader's filters hid everything this board had. */
  readingHidden: boolean
}) {
  const name = boardTitle(board)
  if (category && hadItems) {
    return (
      <EmptyState
        compact
        icon="filter"
        title={t('board.emptyCategory', { category: categoryLabel(category), board: name })}
      />
    )
  }
  if (readingHidden) {
    return (
      <EmptyState compact icon="filter" title={t('reading.filteredEmpty')}>
        <p>
          <a href="#/settings/interests">{t('reading.manage')}</a>
        </p>
      </EmptyState>
    )
  }
  const failed = sources.filter((s) => s.state === 'failed' || s.state === 'degraded')
  if (!sources.length || sources.every((s) => s.state === 'skipped')) {
    return (
      <EmptyState compact icon="info" title={t('board.emptyDisabled')}>
        <p>{t('board.emptyDisabledHint')}</p>
      </EmptyState>
    )
  }
  if (failed.length) {
    return (
      <EmptyState compact icon="warn" title={t('board.emptyFailed')}>
        <ul class="empty__list">
          {failed.map((s) => (
            <li key={s.id}>
              <strong>{sourceName(s.id)}</strong>
              {s.message ? ` — ${s.message}` : ''}
            </li>
          ))}
        </ul>
      </EmptyState>
    )
  }
  return <EmptyState compact icon="info" title={t('board.emptyQuiet')} />
}

/** A board's column (wide grid) or panel (narrow). */
export function BoardColumn({ board, day, date, meta, category, span, panelProps, total }: BoardColumnProps) {
  const [trendRange, setTrendRange] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [newsChannel, setNewsChannel] = useState<'show' | 'best'>('show')
  const data = day.boards[board] ?? { top: [], runnersUp: [] }

  // When viewing repos, filter and rank by the official GitHub Trending scope
  let allRepos = [...data.top, ...data.runnersUp]
  if (board === 'repos') {
    const reposList = allRepos.filter((r): r is RepoItem => r.board === 'repos')
    const scopeTag = `trend:${trendRange}`
    // 优先筛选出真正登上 GitHub 官方该周期（daily/weekly/monthly）Trending 的项目
    const tagged = reposList.filter((r) => r.tags.includes(scopeTag) || r.repo?.topics?.includes(scopeTag))
    const rest = reposList.filter((r) => !tagged.includes(r))

    type RepoWithMetrics = RepoItem & { metrics?: { starsWeekly?: number; starsMonthly?: number } }
    if (trendRange === 'weekly') {
      // 官方周榜项目排在前，按官方周增量或动量排序
      tagged.sort(
        (a, b) =>
          ((b as RepoWithMetrics).metrics?.starsWeekly ?? 0) - ((a as RepoWithMetrics).metrics?.starsWeekly ?? 0) ||
          b.score.total - a.score.total,
      )
      rest.sort(
        (a, b) =>
          (b.score?.parts?.find((p) => p.key === 'momentum')?.raw ?? 0) -
          (a.score?.parts?.find((p) => p.key === 'momentum')?.raw ?? 0),
      )
    } else if (trendRange === 'monthly') {
      // 官方月榜项目排在前，按官方月增量或总星标排序
      tagged.sort(
        (a, b) =>
          ((b as RepoWithMetrics).metrics?.starsMonthly ?? 0) - ((a as RepoWithMetrics).metrics?.starsMonthly ?? 0) ||
          (b.repo?.stars ?? 0) - (a.repo?.stars ?? 0),
      )
      rest.sort((a, b) => (b.repo?.stars ?? 0) - (a.repo?.stars ?? 0))
    } else {
      // 官方日榜项目排在前，按今日增量排序
      tagged.sort((a, b) => (b.repo?.starsToday ?? 0) - (a.repo?.starsToday ?? 0) || b.score.total - a.score.total)
      rest.sort((a, b) => (b.repo?.starsToday ?? 0) - (a.repo?.starsToday ?? 0) || b.score.total - a.score.total)
    }

    allRepos = [...tagged, ...rest].map((item, idx) => ({ ...item, rank: idx + 1 }))
  }

  // HN uses one Algolia pool for both views. SHOW is the newest 15 stories;
  // BEST uses the pipeline's transparent score and engagement signals.
  if (board === 'news') {
    const newsItems = allRepos.filter((item) => item.board === 'news')
    if (newsChannel === 'show') {
      newsItems.sort(
        (a, b) =>
          (a.news.showRank ?? Number.MAX_SAFE_INTEGER) - (b.news.showRank ?? Number.MAX_SAFE_INTEGER) ||
          b.rank - a.rank,
      )
    } else {
      newsItems.sort(
        (a, b) =>
          b.score.total - a.score.total ||
          b.relevance.score - a.relevance.score ||
          b.news.points - a.news.points ||
          b.news.comments - a.news.comments ||
          Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''),
      )
    }
    allRepos = newsItems.map((item, idx) => ({ ...item, rank: idx + 1 }))
  }

  const topSize = board === 'news' ? Math.min(15, allRepos.length) : data.top.length || 10
  const baseTop = allRepos.slice(0, topSize)
  const baseRunners = allRepos.slice(topSize)

  const top = baseTop.filter(matches(category))
  const runners = baseRunners.filter(matches(category))
  const sources = day.sources.filter((s) => s.board === board)
  const notable = notableSources(sources)
  const stale = staleSince(day.sources, board)
  const titleId = `board-${board}-title`
  const lookback = meta?.lookbackDays

  return (
    <section
      class="board mat-lift"
      data-part="board"
      data-board={board}
      style={{ '--hue': boardHue(board), gridColumn: span ? `span ${span}` : undefined }}
      aria-labelledby={titleId}
      {...panelProps}
    >
      <header class="board__head">
        <div class="board__titles">
          <h2 class="board__title" id={titleId}>
            <span class="board__dot" aria-hidden="true" />
            {boardTitle(board, meta)}
            <span class="board__count num">
              {category ? t('home.filteredCount', { shown: top.length, total: topSize }) : top.length}
            </span>
          </h2>
          <p class="board__sub">
            {meta ? localized(meta.subtitle) : ''}
            {lookback ? <span class="board__lookback"> · {t('board.lookback', { n: lookback })}</span> : null}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {board === 'repos' && (
            <div class="board__tabs" role="tablist" aria-label="GitHub Trending Scope">
              <button
                type="button"
                role="tab"
                class={`board__tab ${trendRange === 'daily' ? 'is-active' : ''}`}
                onClick={() => setTrendRange('daily')}
              >
                日趋势
              </button>
              <button
                type="button"
                role="tab"
                class={`board__tab ${trendRange === 'weekly' ? 'is-active' : ''}`}
                onClick={() => setTrendRange('weekly')}
              >
                周趋势
              </button>
              <button
                type="button"
                role="tab"
                class={`board__tab ${trendRange === 'monthly' ? 'is-active' : ''}`}
                onClick={() => setTrendRange('monthly')}
              >
                月趋势
              </button>
            </div>
          )}
          {board === 'news' && (
            <div class="board__tabs" role="tablist" aria-label={t('board.newsChannels')}>
              <button
                type="button"
                role="tab"
                aria-selected={newsChannel === 'show'}
                class={`board__tab ${newsChannel === 'show' ? 'is-active' : ''}`}
                onClick={() => setNewsChannel('show')}
              >
                {t('board.newsShow')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={newsChannel === 'best'}
                class={`board__tab ${newsChannel === 'best' ? 'is-active' : ''}`}
                onClick={() => setNewsChannel('best')}
              >
                {t('board.newsBest')}
              </button>
            </div>
          )}
          {notable.length > 0 && (
            <div class="board__status">
              {notable.map((s) => (
                <SourceChip key={s.id} s={s} />
              ))}
            </div>
          )}
        </div>
      </header>
      {stale && (
        <p class="board__stale" role="note">
          {t('board.staleNote', { date: fmt.day(stale) })}
        </p>
      )}
      {top.length ? (
        <ol class="board__list">
          {top.map((it) => (
            <li key={it.key}>
              <ItemCard item={it} date={date} meta={meta} stale={!!stale} />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyBoard
          board={board}
          sources={sources}
          category={category}
          hadItems={data.top.length + data.runnersUp.length > 0}
          readingHidden={data.top.length + data.runnersUp.length === 0 && (total ?? 0) > 0}
        />
      )}
      {runners.length > 0 && (
        <details class="runners" data-part="runners-up">
          <summary class="runners__summary">
            <span>{t('board.runnersUp')}</span>
            <span class="runners__count num">{runners.length}</span>
            <Icon name="chevron-down" size={14} />
          </summary>
          <ol class="runners__list">
            {runners.map((it) => (
              <li key={it.key}>
                <RunnerRow item={it} date={date} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  )
}
