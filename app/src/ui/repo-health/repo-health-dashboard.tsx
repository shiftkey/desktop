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

type SortMode = 'attention' | 'name'
type FilterMode = 'all' | 'attention' | 'has-prs' | 'behind' | 'clean'

interface IRepoHealthDashboardState {
  readonly sort: SortMode
  readonly filter: FilterMode
}

export class RepoHealthDashboard extends React.Component<
  IRepoHealthDashboardProps,
  IRepoHealthDashboardState
> {
  public constructor(props: IRepoHealthDashboardProps) {
    super(props)
    this.state = { sort: 'attention', filter: 'all' }
  }

  public render() {
    const visible = this.applySortFilter()
    return (
      <div className="repo-health-dashboard">
        <div className="repo-health-dashboard__toolbar">
          <strong>Dashboard</strong>
          <span style={{ flex: 1 }} />
          <select
            value={this.state.sort}
            onChange={e =>
              this.setState({ sort: e.currentTarget.value as SortMode })
            }
          >
            <option value="attention">Sort: Attention</option>
            <option value="name">Sort: Name</option>
          </select>
          <select
            value={this.state.filter}
            onChange={e =>
              this.setState({ filter: e.currentTarget.value as FilterMode })
            }
          >
            <option value="all">All</option>
            <option value="attention">Needs attention</option>
            <option value="has-prs">Has PRs</option>
            <option value="behind">Behind remote</option>
            <option value="clean">Clean</option>
          </select>
          <button onClick={this.props.onRefreshClick}>Refresh</button>
        </div>
        {visible.length === 0 ? (
          <div className="repo-health-dashboard__empty">
            No repositories match the current filter.
          </div>
        ) : (
          <div className="repo-health-dashboard__rows">
            {visible.map(r => (
              <RepoHealthRow
                key={r.id}
                repository={r}
                health={
                  this.props.snapshot.statuses.get(r.id) ?? null
                }
                refreshing={this.props.snapshot.refreshing.has(r.id)}
                onClick={this.props.onSelectRepository}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  private applySortFilter(): ReadonlyArray<Repository> {
    const { repositories, snapshot } = this.props
    const filtered = repositories.filter(r => this.matchesFilter(r))
    if (this.state.sort === 'attention') {
      return [...filtered].sort((a, b) => {
        const sa = snapshot.statuses.get(a.id)?.attentionScore ?? 0
        const sb = snapshot.statuses.get(b.id)?.attentionScore ?? 0
        return sb - sa
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
          (h?.behindBy ?? 0) === 0
        )
      default:
        return true
    }
  }
}
