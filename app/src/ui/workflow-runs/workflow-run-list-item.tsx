import * as React from 'react'
import { IWorkflowRun } from '../../models/workflow-run'
import { Octicon } from '../octicons/octicon'
import * as octicons from '../octicons/octicons.generated'
import { formatPreciseDuration } from '../../lib/format-duration'
import { formatRelative } from '../../lib/format-relative'
import { TooltippedContent } from '../lib/tooltipped-content'
import {
  getWorkflowRunStatusClass,
  getWorkflowRunStatusIcon,
  getWorkflowRunStatusLabel,
} from './workflow-run-status'

interface IWorkflowRunListItemProps {
  readonly entry: IWorkflowRun
  readonly onRunClick?: (entry: IWorkflowRun) => void
  /** Whether this row is the currently selected run. */
  readonly selected?: boolean
}

/**
 * A single workflow run row: status icon, workflow name + run number,
 * branch and short SHA, when it was triggered, and formatted duration.
 */
export class WorkflowRunListItem extends React.Component<IWorkflowRunListItemProps> {
  public render() {
    const { entry, selected } = this.props
    const statusClass = getWorkflowRunStatusClass(
      entry.status,
      entry.conclusion
    )
    const icon = getWorkflowRunStatusIcon(entry.status, entry.conclusion)
    const statusLabel = getWorkflowRunStatusLabel(
      entry.status,
      entry.conclusion
    )
    const className = `workflow-run-list-item ${statusClass}${
      selected ? ' selected' : ''
    }`

    return (
      <div
        className={className}
        onClick={this.onClick}
        onKeyDown={this.onKeyDown}
        tabIndex={0}
        role="row"
        aria-selected={selected === true}
      >
        <Octicon symbol={icon} title={statusLabel} />
        <div className="workflow-run-info">
          <div className="workflow-run-name">
            {entry.name} #{entry.runNumber}
          </div>
          <div className="workflow-run-meta">
            {entry.headBranch} @ {entry.headSha.slice(0, 7)}
          </div>
        </div>
        <div className="workflow-run-timing">
          {this.renderTriggeredAt()}
          {entry.duration !== null && (
            <div className="workflow-run-duration">
              {formatPreciseDuration(entry.duration)}
            </div>
          )}
        </div>
      </div>
    )
  }

  private renderTriggeredAt() {
    const { createdAt } = this.props.entry
    const triggered = Date.parse(createdAt)
    if (Number.isNaN(triggered)) {
      return null
    }

    return (
      <TooltippedContent
        className="workflow-run-triggered-at"
        tooltip={`Triggered ${new Date(triggered).toLocaleString()}`}
      >
        <Octicon symbol={octicons.calendar} />
        {formatRelative(triggered - Date.now())}
      </TooltippedContent>
    )
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
