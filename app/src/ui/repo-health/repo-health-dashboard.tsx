import * as React from 'react'
import { Repository } from '../../models/repository'
import { IRepoHealthSnapshot } from '../../lib/repo-health/types'
import { RepoHealthRow } from './repo-health-row'

interface IRepoHealthDashboardProps {
  readonly repositories: ReadonlyArray<Repository>
  readonly snapshot: IRepoHealthSnapshot
  readonly onSelectRepository: (repo: Repository) => void
  readonly onRefreshClick: () => void
}

type SortMode = 'attention' | 'name' | 'recent'
type FilterMode = 'all' | 'attention' | 'has-prs' | 'behind' | 'clean'

interface IRepoHealthDashboardState {
  readonly sort: SortMode
  readonly filter: FilterMode
  readonly query: string
}

export class RepoHealthDashboard extends React.Component<
  IRepoHealthDashboardProps,
  IRepoHealthDashboardState
> {
  public constructor(props: IRepoHealthDashboardProps) {
    super(props)
    this.state = { sort: 'attention', filter: 'all', query: '' }
  }

  public render() {
    const visible = this.applySortFilter()
    const summary = this.summarize()
    return (
      <div className="repo-health-dashboard">
        <div className="repo-health-dashboard__summary">
          <SummaryStat
            label="Repositories"
            value={this.props.repositories.length}
          />
          <SummaryStat
            label="Need attention"
            value={summary.needAttention}
            tone={summary.needAttention > 0 ? 'warn' : 'ok'}
          />
          <SummaryStat label="With open PRs" value={summary.withPRs} />
          <SummaryStat
            label="Failing CI"
            value={summary.failingCI}
            tone={summary.failingCI > 0 ? 'bad' : 'ok'}
          />
          <SummaryStat
            label="Behind remote"
            value={summary.behindCount}
            tone={summary.behindCount > 0 ? 'warn' : 'ok'}
          />
          <span style={{ flex: 1 }} />
          {this.props.snapshot.lastRefreshAt !== null && (
            <span className="repo-health-dashboard__last-refresh">
              Last refresh: {formatTime(this.props.snapshot.lastRefreshAt)}
            </span>
          )}
        </div>
        <div className="repo-health-dashboard__controls">
          <input
            type="search"
            className="repo-health-dashboard__search"
            placeholder="Search repositories…"
            value={this.state.query}
            onChange={this.onQueryChange}
          />
          <select value={this.state.sort} onChange={this.onSortChange}>
            <option value="attention">Sort: Attention score</option>
            <option value="recent">Sort: Recent activity</option>
            <option value="name">Sort: Name</option>
          </select>
          <select value={this.state.filter} onChange={this.onFilterChange}>
            <option value="all">All ({this.props.repositories.length})</option>
            <option value="attention">
              Needs attention ({summary.needAttention})
            </option>
            <option value="has-prs">Has PRs ({summary.withPRs})</option>
            <option value="behind">
              Behind remote ({summary.behindCount})
            </option>
            <option value="clean">Clean ({summary.cleanCount})</option>
          </select>
          <button
            className="repo-health-dashboard__refresh"
            onClick={this.props.onRefreshClick}
            disabled={this.props.snapshot.refreshing.size > 0}
          >
            {this.props.snapshot.refreshing.size > 0
              ? 'Refreshing…'
              : 'Refresh'}
          </button>
        </div>
        {visible.length === 0 ? (
          <div className="repo-health-dashboard__empty">
            {this.props.repositories.length === 0
              ? 'No repositories added yet.'
              : 'No repositories match the current filter.'}
          </div>
        ) : (
          <div className="repo-health-dashboard__grid">
            {visible.map(r => (
              <RepoHealthRow
                key={r.id}
                repository={r}
                health={this.props.snapshot.statuses.get(r.id) ?? null}
                refreshing={this.props.snapshot.refreshing.has(r.id)}
                onClick={this.props.onSelectRepository}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  private onQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: e.currentTarget.value })
  }

  private onSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ sort: e.currentTarget.value as SortMode })
  }

  private onFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.setState({ filter: e.currentTarget.value as FilterMode })
  }

  private applySortFilter(): ReadonlyArray<Repository> {
    const { repositories, snapshot } = this.props
    const q = this.state.query.trim().toLowerCase()
    const filtered = repositories.filter(r => {
      if (!this.matchesFilter(r)) {
        return false
      }
      if (q.length === 0) {
        return true
      }
      const hay = `${r.name ?? ''} ${r.path}`.toLowerCase()
      return hay.includes(q)
    })
    if (this.state.sort === 'attention') {
      return [...filtered].sort((a, b) => {
        const sa = snapshot.statuses.get(a.id)?.attentionScore ?? 0
        const sb = snapshot.statuses.get(b.id)?.attentionScore ?? 0
        return sb - sa
      })
    }
    if (this.state.sort === 'recent') {
      return [...filtered].sort((a, b) => {
        const ta = snapshot.statuses.get(a.id)?.lastActivityUnix ?? 0
        const tb = snapshot.statuses.get(b.id)?.lastActivityUnix ?? 0
        return tb - ta
      })
    }
    return [...filtered].sort((a, b) =>
      (a.name || a.path).localeCompare(b.name || b.path)
    )
  }

  private matchesFilter(r: Repository): boolean {
    const h = this.props.snapshot.statuses.get(r.id)
    switch (this.state.filter) {
      case 'all':
        return true
      case 'attention':
        return (h?.attentionScore ?? 0) > 0
      case 'has-prs':
        return (h?.openPullRequestCount ?? 0) > 0
      case 'behind':
        return (h?.behindBy ?? 0) > 0
      case 'clean':
        return (
          (h?.uncommittedCount ?? 0) === 0 &&
          (h?.aheadBy ?? 0) === 0 &&
          (h?.behindBy ?? 0) === 0 &&
          h?.defaultBranchStatus !== 'failure'
        )
      default:
        return true
    }
  }

  private summarize() {
    let needAttention = 0
    let withPRs = 0
    let failingCI = 0
    let behindCount = 0
    let cleanCount = 0
    for (const r of this.props.repositories) {
      const h = this.props.snapshot.statuses.get(r.id)
      if ((h?.attentionScore ?? 0) > 0) {
        needAttention++
      }
      if ((h?.openPullRequestCount ?? 0) > 0) {
        withPRs++
      }
      if (h?.defaultBranchStatus === 'failure') {
        failingCI++
      }
      if ((h?.behindBy ?? 0) > 0) {
        behindCount++
      }
      if (
        (h?.uncommittedCount ?? 0) === 0 &&
        (h?.aheadBy ?? 0) === 0 &&
        (h?.behindBy ?? 0) === 0 &&
        h?.defaultBranchStatus !== 'failure'
      ) {
        cleanCount++
      }
    }
    return { needAttention, withPRs, failingCI, behindCount, cleanCount }
  }
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'warn' | 'bad'
}) {
  return (
    <div className={`repo-health-dashboard__stat tone-${tone ?? 'ok'}`}>
      <span className="repo-health-dashboard__stat-value">{value}</span>
      <span className="repo-health-dashboard__stat-label">{label}</span>
    </div>
  )
}

function formatTime(unixMs: number): string {
  const d = new Date(unixMs)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}
