import * as React from 'react'
import {
  IWorkflowRun,
  WorkflowRunStatus,
  WorkflowRunConclusion,
} from '../../models/workflow-run'
import { Octicon } from '../octicons/octicon'
import * as octicons from '../octicons/octicons.generated'
import { formatPreciseDuration } from '../../lib/format-duration'

interface IWorkflowRunListItemProps {
  readonly entry: IWorkflowRun
  readonly onRunClick?: (entry: IWorkflowRun) => void
}

/**
 * A single workflow run row: status icon, workflow name + run number,
 * branch and short SHA, and formatted duration.
 */
export class WorkflowRunListItem extends React.Component<IWorkflowRunListItemProps> {
  public render() {
    const { entry } = this.props
    const statusClass = this.getStatusClass()
    const icon = this.getStatusIcon()

    return (
      <div
        className={`workflow-run-list-item ${statusClass}`}
        onClick={this.onClick}
        onKeyDown={this.onKeyDown}
        tabIndex={0}
        role="row"
      >
        <Octicon symbol={icon} />
        <div className="workflow-run-info">
          <div className="workflow-run-name">
            {entry.name} #{entry.runNumber}
          </div>
          <div className="workflow-run-meta">
            {entry.headBranch} @ {entry.headSha.slice(0, 7)}
          </div>
        </div>
        {entry.duration !== null && (
          <div className="workflow-run-duration">
            {formatPreciseDuration(entry.duration)}
          </div>
        )}
      </div>
    )
  }

  private getStatusClass(): string {
    const { status, conclusion } = this.props.entry
    if (status === WorkflowRunStatus.Completed) {
      if (conclusion === WorkflowRunConclusion.Success) {
        return 'status-success'
      }
      if (
        conclusion === WorkflowRunConclusion.Cancelled ||
        conclusion === WorkflowRunConclusion.Neutral ||
        conclusion === WorkflowRunConclusion.Skipped
      ) {
        return 'status-cancelled'
      }
      return 'status-failure'
    }
    return 'status-pending'
  }

  private getStatusIcon(): octicons.OcticonSymbol {
    const { status, conclusion } = this.props.entry
    if (status === WorkflowRunStatus.Completed) {
      if (conclusion === WorkflowRunConclusion.Success) {
        return octicons.check
      }
      if (
        conclusion === WorkflowRunConclusion.Cancelled ||
        conclusion === WorkflowRunConclusion.Neutral ||
        conclusion === WorkflowRunConclusion.Skipped
      ) {
        return octicons.stop
      }
      return octicons.x
    }
    return octicons.clock
  }

  private onClick = () => {
    if (this.props.onRunClick) {
      this.props.onRunClick(this.props.entry)
    }
  }

  private onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.onClick()
    }
  }
}
