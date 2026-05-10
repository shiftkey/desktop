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
 * Full-window dialog frame around the dashboard.
 *
 * The `repo-health-dashboard-dialog` id hooks the SCSS rules that size
 * the dialog at 90% of the viewport, override the default cramped Dialog
 * width, and let the body scroll.
 */
export class RepoHealthDashboardDialog extends React.Component<IProps> {
  public render() {
    return (
      <Dialog
        id="repo-health-dashboard-dialog"
        title={__DARWIN__ ? 'Repository Health Dashboard' : 'Repository health'}
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
