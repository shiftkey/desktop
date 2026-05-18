import * as React from 'react'
import { Button } from '../lib/button'
import { WorkflowRunStatus, WorkflowRunFilter } from '../../models/workflow-run'

interface IWorkflowRunToolbarProps {
  readonly selectedFilter: WorkflowRunFilter
  readonly onFilterChange: (filter: WorkflowRunFilter) => void
  readonly onRunWorkflow: () => void
}

/**
 * Toolbar for the workflow run list: a status filter dropdown and a
 * "Run workflow" button that opens the dispatch dialog.
 */
export class WorkflowRunToolbar extends React.Component<IWorkflowRunToolbarProps> {
  public render() {
    return (
      <div className="workflow-run-toolbar">
        <select
          aria-label="Filter workflow runs by status"
          value={this.props.selectedFilter}
          onChange={this.onFilterChange}
        >
          <option value="all">All</option>
          <option value={WorkflowRunStatus.Queued}>Queued</option>
          <option value={WorkflowRunStatus.InProgress}>In progress</option>
          <option value={WorkflowRunStatus.Completed}>Completed</option>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <Button onClick={this.props.onRunWorkflow}>Run workflow</Button>
      </div>
    )
  }

  private onFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    this.props.onFilterChange(e.target.value as WorkflowRunFilter)
  }
}
