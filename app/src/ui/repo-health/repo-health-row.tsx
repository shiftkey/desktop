import * as React from 'react'
import { Repository } from '../../models/repository'
import { IRepoHealth } from '../../lib/repo-health/types'

interface IRepoHealthRowProps {
  readonly repository: Repository
  readonly health: IRepoHealth | null
  readonly refreshing: boolean
  readonly onClick: (repo: Repository) => void
}

export class RepoHealthRow extends React.PureComponent<IRepoHealthRowProps> {
  public render() {
    const { repository, health, refreshing } = this.props
    return (
      <div
        className={`repo-health-row${refreshing ? ' refreshing' : ''}`}
        onClick={this.onClick}
        role="row"
      >
        <span className="repo-health-row__name">
          {repository.name || repository.path}
        </span>
        {refreshing && (
          <span className="repo-health-row__refreshing">refreshing…</span>
        )}
        {health && this.renderSignals(health)}
      </div>
    )
  }

  private renderSignals(h: IRepoHealth) {
    if (h.error) {
      return (
        <span className="repo-health-row__error" title={h.error}>
          error
        </span>
      )
    }
    return (
      <span className="repo-health-row__signals">
        {h.uncommittedCount > 0 && (
          <span className="signal uncommitted">
            {h.uncommittedCount} uncommitted
          </span>
        )}
        {h.aheadBy > 0 && (
          <span className="signal ahead">{h.aheadBy} ahead</span>
        )}
        {h.behindBy > 0 && (
          <span className="signal behind">{h.behindBy} behind</span>
        )}
        {h.openPullRequestCount > 0 && (
          <span className="signal prs">{h.openPullRequestCount} PRs</span>
        )}
        {h.defaultBranchStatus === 'failure' && (
          <span className="signal ci-fail">✗ CI</span>
        )}
        <span
          className={`signal score score-${
            h.attentionScore >= 50 ? 'high' : h.attentionScore >= 20 ? 'mid' : 'low'
          }`}
        >
          ⚠{h.attentionScore}
        </span>
      </span>
    )
  }

  private onClick = () => this.props.onClick(this.props.repository)
}
