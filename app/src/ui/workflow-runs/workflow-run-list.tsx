import * as React from 'react'
import {
  IWorkflowRun,
  WorkflowRunStatus,
  WorkflowRunConclusion,
  WorkflowRunFilter,
} from '../../models/workflow-run'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { Dispatcher } from '../dispatcher'
import { WorkflowRunListItem } from './workflow-run-list-item'
import { WorkflowRunToolbar } from './workflow-run-toolbar'
import { PopupType } from '../../models/popup'
import { getAccountForRepository } from '../../lib/get-account-for-repository'
import { API } from '../../lib/api'

interface IWorkflowRunListProps {
  readonly entries: ReadonlyArray<IWorkflowRun>
  readonly loading: boolean
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
  readonly branch: string
}

interface IWorkflowRunListState {
  readonly filter: WorkflowRunFilter
}

/**
 * Lists workflow runs for a repository with a status filter toolbar.
 * Shows loading and empty states. The "Run workflow" button fetches
 * available workflows and opens the dispatch popup.
 */
export class WorkflowRunList extends React.Component<
  IWorkflowRunListProps,
  IWorkflowRunListState
> {
  public constructor(props: IWorkflowRunListProps) {
    super(props)
    this.state = {
      filter: 'all',
    }
  }

  public render() {
    return (
      <div className="workflow-run-list">
        <WorkflowRunToolbar
          selectedFilter={this.state.filter}
          onFilterChange={this.onFilterChange}
          onRunWorkflow={this.onRunWorkflow}
        />
        {this.renderBody()}
      </div>
    )
  }

  private renderBody(): JSX.Element {
    if (this.props.loading) {
      return (
        <div className="workflow-run-list-loading">Loading workflow runs…</div>
      )
    }

    const filtered = this.getFilteredEntries()
    if (filtered.length === 0) {
      return (
        <div className="workflow-run-list-empty">No workflow runs found.</div>
      )
    }

    return (
      <div>
        {filtered.map(entry => (
          <WorkflowRunListItem
            key={entry.id}
            entry={entry}
            onRunClick={this.onRunClick}
          />
        ))}
      </div>
    )
  }

  private getFilteredEntries(): ReadonlyArray<IWorkflowRun> {
    const { entries } = this.props
    const { filter } = this.state
    if (filter === 'all') {
      return entries
    }
    if (filter === 'success') {
      return entries.filter(
        e =>
          e.status === WorkflowRunStatus.Completed &&
          e.conclusion === WorkflowRunConclusion.Success
      )
    }
    if (filter === 'failure') {
      return entries.filter(
        e =>
          e.status === WorkflowRunStatus.Completed &&
          e.conclusion === WorkflowRunConclusion.Failure
      )
    }
    if (filter === 'cancelled') {
      return entries.filter(
        e =>
          e.status === WorkflowRunStatus.Completed &&
          e.conclusion === WorkflowRunConclusion.Cancelled
      )
    }
    return entries.filter(e => e.status === filter)
  }

  private onFilterChange = (filter: WorkflowRunFilter) => {
    this.setState({ filter })
  }

  private onRunClick = (entry: IWorkflowRun) => {
    // Open the run on GitHub — the in-app run detail view is a separate
    // feature; until it exists the browser is the canonical destination.
    this.props.dispatcher.openInBrowser(entry.htmlUrl)
  }

  private onRunWorkflow = async () => {
    const { repository, dispatcher, accounts, branch } = this.props
    const account = getAccountForRepository(accounts, repository)
    if (account === null || repository.gitHubRepository === null) {
      dispatcher.postError(
        new Error(
          'Sign in to a GitHub account for this repository to run workflows.'
        )
      )
      return
    }

    const { owner, name } = repository.gitHubRepository

    try {
      const api = API.fromAccount(account)
      const response = await api.fetchWorkflows(owner.login, name)
      const workflows = response?.workflows ?? []

      if (workflows.length === 0) {
        dispatcher.postError(
          new Error('This repository has no workflows that can be run.')
        )
        return
      }

      await dispatcher.showPopup({
        type: PopupType.WorkflowRunDispatch,
        repository,
        branch,
        workflows: workflows.map(w => ({ id: w.id, name: w.name })),
      })
    } catch (error) {
      dispatcher.postError(
        error instanceof Error ? error : new Error(String(error))
      )
    }
  }
}
