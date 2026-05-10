import * as React from 'react'
import { Dialog, DialogContent } from '../dialog'
import { Repository } from '../../models/repository'
import { IRepoHealthSnapshot } from '../../lib/repo-health/types'
import { RepoHealthDashboard } from './repo-health-dashboard'

interface IProps {
  readonly repositories: ReadonlyArray<Repository>
  readonly snapshot: IRepoHealthSnapshot
  readonly onSelectRepository: (repo: Repository) => void
  readonly onRefreshClick: () => void
  readonly onDismissed: () => void
}

/**
 * Dialog frame around the dashboard. Uses the existing `Dialog` component
 * for consistent chrome — the dashboard itself is the body.
 */
export class RepoHealthDashboardDialog extends React.Component<IProps> {
  public render() {
    return (
      <Dialog
        id="repo-health-dashboard"
        title={__DARWIN__ ? 'Repository Health' : 'Repository health'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.props.onDismissed}
      >
        <DialogContent>
          <RepoHealthDashboard
            repositories={this.props.repositories}
            snapshot={this.props.snapshot}
            onSelectRepository={this.props.onSelectRepository}
            onRefreshClick={this.props.onRefreshClick}
          />
        </DialogContent>
      </Dialog>
    )
  }
}
