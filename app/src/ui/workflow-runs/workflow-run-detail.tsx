import * as React from 'react'
import { IWorkflowRun } from '../../models/workflow-run'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { Dispatcher } from '../dispatcher'
import { Octicon } from '../octicons/octicon'
import { Button } from '../lib/button'
import { API, IAPIWorkflowJob } from '../../lib/api'
import { getAccountForRepository } from '../../lib/get-account-for-repository'
import { formatPreciseDuration } from '../../lib/format-duration'
import { formatRelative } from '../../lib/format-relative'
import { TooltippedContent } from '../lib/tooltipped-content'
import {
  getWorkflowRunStatusClass,
  getWorkflowRunStatusIcon,
  getWorkflowRunStatusLabel,
  isCancellableStatus,
  isReRunnableConclusion,
} from './workflow-run-status'

interface IWorkflowRunDetailProps {
  readonly run: IWorkflowRun
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly accounts: ReadonlyArray<Account>
}

interface IWorkflowRunDetailState {
  readonly jobs: ReadonlyArray<IAPIWorkflowJob>
  readonly jobsLoading: boolean
  readonly jobsError: string | null
  /** Which long-running toolbar action, if any, is currently in flight. */
  readonly busyAction: 're-run' | 'cancel' | null
}

/**
 * Detail pane for a single workflow run: a status header, run metadata,
 * the triggering commit message, run-level actions (re-run / cancel /
 * open on GitHub), and the run's jobs with their steps.
 *
 * Jobs are fetched directly from the GitHub API on selection rather than
 * cached in a store — the detail pane is the only consumer and the data
 * is cheap to refetch after a re-run or cancel.
 */
export class WorkflowRunDetail extends React.Component<
  IWorkflowRunDetailProps,
  IWorkflowRunDetailState
> {
  private mounted = false

  public constructor(props: IWorkflowRunDetailProps) {
    super(props)
    this.state = {
      jobs: [],
      jobsLoading: true,
      jobsError: null,
      busyAction: null,
    }
  }

  public componentDidMount() {
    this.mounted = true
    this.loadJobs()
  }

  public componentDidUpdate(prevProps: IWorkflowRunDetailProps) {
    if (prevProps.run.id !== this.props.run.id) {
      this.loadJobs()
    }
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private setStateIfMounted(state: Partial<IWorkflowRunDetailState>): void {
    if (this.mounted) {
      this.setState(state as IWorkflowRunDetailState)
    }
  }

  private async loadJobs(): Promise<void> {
    const { run, repository, accounts } = this.props
    const account = getAccountForRepository(accounts, repository)

    if (account === null || repository.gitHubRepository === null) {
      this.setStateIfMounted({
        jobs: [],
        jobsLoading: false,
        jobsError: 'Sign in to a GitHub account to view this run’s jobs.',
      })
      return
    }

    const requestedRunId = run.id
    this.setStateIfMounted({ jobsLoading: true, jobsError: null })

    try {
      const api = API.fromAccount(account)
      const { owner, name } = repository.gitHubRepository
      const response = await api.fetchWorkflowRunJobs(
        owner.login,
        name,
        requestedRunId
      )

      // Bail if the user selected a different run while this was in flight.
      if (this.props.run.id !== requestedRunId) {
        return
      }

      this.setStateIfMounted({
        jobs: response?.jobs ?? [],
        jobsLoading: false,
        jobsError: null,
      })
    } catch (error) {
      if (this.props.run.id !== requestedRunId) {
        return
      }
      this.setStateIfMounted({
        jobsLoading: false,
        jobsError:
          error instanceof Error ? error.message : 'Failed to load jobs.',
      })
    }
  }

  public render() {
    const { run } = this.props
    const statusClass = getWorkflowRunStatusClass(run.status, run.conclusion)
    const statusIcon = getWorkflowRunStatusIcon(run.status, run.conclusion)
    const statusLabel = getWorkflowRunStatusLabel(run.status, run.conclusion)

    return (
      <div className="workflow-run-detail">
        <header className="workflow-run-detail__header">
          <span className={`workflow-run-detail__status-icon ${statusClass}`}>
            <Octicon symbol={statusIcon} title={statusLabel} />
          </span>
          <div className="workflow-run-detail__heading">
            <h2 className="workflow-run-detail__title">
              {run.name}{' '}
              <span className="workflow-run-detail__number">
                #{run.runNumber}
              </span>
            </h2>
            <div className="workflow-run-detail__status-label">
              {statusLabel}
            </div>
          </div>
        </header>

        {this.renderMeta()}
        {this.renderCommitMessage()}
        {this.renderActions()}
        {this.renderJobs()}
      </div>
    )
  }

  private renderMeta(): JSX.Element {
    const { run } = this.props
    return (
      <dl className="workflow-run-detail__meta">
        {this.renderMetaItem('Branch', run.headBranch)}
        {this.renderMetaItem('Commit', run.headSha.slice(0, 7))}
        {this.renderMetaItem('Event', run.event)}
        {this.renderMetaItem(
          'Triggered',
          this.renderRelative(run.createdAt, 'Triggered')
        )}
        {run.runStartedAt !== null &&
          this.renderMetaItem(
            'Started',
            this.renderRelative(run.runStartedAt, 'Started')
          )}
        {run.duration !== null &&
          this.renderMetaItem('Duration', formatPreciseDuration(run.duration))}
      </dl>
    )
  }

  private renderMetaItem(label: string, value: React.ReactNode): JSX.Element {
    return (
      <div className="workflow-run-detail__meta-item">
        <dt>{label}</dt>
        <dd>{value}</dd>
      </div>
    )
  }

  /** A relative time string with the absolute timestamp as a tooltip. */
  private renderRelative(iso: string, verb: string): React.ReactNode {
    const ms = Date.parse(iso)
    if (Number.isNaN(ms)) {
      return '—'
    }
    return (
      <TooltippedContent tooltip={`${verb} ${new Date(ms).toLocaleString()}`}>
        {formatRelative(ms - Date.now())}
      </TooltippedContent>
    )
  }

  private renderCommitMessage(): JSX.Element | null {
    const message = this.props.run.headCommitMessage
    if (message === null || message.trim().length === 0) {
      return null
    }
    // Surface only the commit summary (first line).
    const summary = message.split('\n')[0]
    return <p className="workflow-run-detail__commit">{summary}</p>
  }

  private renderActions(): JSX.Element {
    const { run } = this.props
    const { busyAction } = this.state
    const canReRun =
      run.status === 'completed' && isReRunnableConclusion(run.conclusion)
    const canCancel = isCancellableStatus(run.status)

    return (
      <div className="workflow-run-detail__actions">
        {canReRun && (
          <Button
            onClick={this.onReRun}
            disabled={busyAction !== null}
            tooltip="Re-run the jobs that did not succeed"
          >
            {busyAction === 're-run' ? 'Re-running…' : 'Re-run failed jobs'}
          </Button>
        )}
        {canCancel && (
          <Button onClick={this.onCancel} disabled={busyAction !== null}>
            {busyAction === 'cancel' ? 'Cancelling…' : 'Cancel run'}
          </Button>
        )}
        <Button onClick={this.onOpenOnGitHub}>View on GitHub</Button>
        {run.logsUrl !== null && (
          <Button onClick={this.onDownloadLogs}>Download logs</Button>
        )}
      </div>
    )
  }

  private renderJobs(): JSX.Element {
    const { jobs, jobsLoading, jobsError } = this.state

    return (
      <section className="workflow-run-detail__jobs">
        <h3>Jobs</h3>
        {jobsLoading ? (
          <div className="workflow-run-detail__jobs-status" role="status">
            Loading jobs…
          </div>
        ) : jobsError !== null ? (
          <div className="workflow-run-detail__jobs-status workflow-run-detail__jobs-error">
            {jobsError}
          </div>
        ) : jobs.length === 0 ? (
          <div className="workflow-run-detail__jobs-status">
            This run has no jobs.
          </div>
        ) : (
          <ul className="workflow-run-detail__job-list">
            {jobs.map(job => this.renderJob(job))}
          </ul>
        )}
      </section>
    )
  }

  private renderJob(job: IAPIWorkflowJob): JSX.Element {
    const statusClass = getWorkflowRunStatusClass(job.status, job.conclusion)
    const statusIcon = getWorkflowRunStatusIcon(job.status, job.conclusion)
    const statusLabel = getWorkflowRunStatusLabel(job.status, job.conclusion)
    const duration = this.computeDuration(job.started_at, job.completed_at)

    return (
      <li key={job.id} className="workflow-run-detail__job">
        <div className="workflow-run-detail__job-header">
          <span className={`workflow-run-detail__status-icon ${statusClass}`}>
            <Octicon symbol={statusIcon} title={statusLabel} />
          </span>
          <span className="workflow-run-detail__job-name">{job.name}</span>
          {duration !== null && (
            <span className="workflow-run-detail__job-duration">
              {duration}
            </span>
          )}
        </div>
        {job.steps.length > 0 && (
          <ul className="workflow-run-detail__steps">
            {job.steps.map(step => (
              <li
                key={step.number}
                className="workflow-run-detail__step"
                title={getWorkflowRunStatusLabel(step.status, step.conclusion)}
              >
                <span
                  className={`workflow-run-detail__status-icon ${getWorkflowRunStatusClass(
                    step.status,
                    step.conclusion
                  )}`}
                >
                  <Octicon
                    symbol={getWorkflowRunStatusIcon(
                      step.status,
                      step.conclusion
                    )}
                  />
                </span>
                <span className="workflow-run-detail__step-name">
                  {step.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </li>
    )
  }

  /** Elapsed time between two ISO timestamps, or null when incomplete. */
  private computeDuration(
    startedAt: string | null,
    completedAt: string | null
  ): string | null {
    if (!startedAt || !completedAt) {
      return null
    }
    const ms = Date.parse(completedAt) - Date.parse(startedAt)
    return Number.isFinite(ms) && ms >= 0 ? formatPreciseDuration(ms) : null
  }

  private onReRun = async () => {
    this.setState({ busyAction: 're-run' })
    try {
      await this.props.dispatcher.reRunWorkflowRun(
        this.props.repository,
        this.props.run.id
      )
      await this.loadJobs()
    } catch (error) {
      this.props.dispatcher.postError(
        error instanceof Error ? error : new Error(String(error))
      )
    } finally {
      this.setStateIfMounted({ busyAction: null })
    }
  }

  private onCancel = async () => {
    this.setState({ busyAction: 'cancel' })
    try {
      await this.props.dispatcher.cancelWorkflowRun(
        this.props.repository,
        this.props.run.id
      )
      await this.loadJobs()
    } catch (error) {
      this.props.dispatcher.postError(
        error instanceof Error ? error : new Error(String(error))
      )
    } finally {
      this.setStateIfMounted({ busyAction: null })
    }
  }

  private onOpenOnGitHub = () => {
    this.props.dispatcher.openInBrowser(this.props.run.htmlUrl)
  }

  private onDownloadLogs = () => {
    if (this.props.run.logsUrl !== null) {
      this.props.dispatcher.openInBrowser(this.props.run.logsUrl)
    }
  }
}
