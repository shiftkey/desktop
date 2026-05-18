export enum WorkflowRunStatus {
  Queued = 'queued',
  InProgress = 'in_progress',
  Completed = 'completed',
  Waiting = 'waiting',
  Pending = 'pending',
  Requested = 'requested',
}

export enum WorkflowRunConclusion {
  Success = 'success',
  Failure = 'failure',
  Neutral = 'neutral',
  Cancelled = 'cancelled',
  Skipped = 'skipped',
  TimedOut = 'timed_out',
  ActionRequired = 'action_required',
  Stale = 'stale',
  StartupFailure = 'startup_failure',
}

/** A workflow run as returned by the GitHub Actions API, enriched for UI display. */
export interface IWorkflowRun {
  readonly id: number
  readonly name: string
  readonly headBranch: string
  readonly headSha: string
  readonly runNumber: number
  /** The event that triggered the workflow run (e.g., 'push', 'pull_request', 'workflow_dispatch'). */
  readonly event: string
  readonly status: WorkflowRunStatus
  readonly conclusion: WorkflowRunConclusion | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly runStartedAt: string | null
  readonly htmlUrl: string
  readonly jobsUrl: string
  readonly logsUrl: string | null
  readonly workflowId: number
  readonly workflowName: string
  readonly repositoryName: string
  readonly repositoryOwner: string
  readonly headCommitMessage: string | null
  /** Duration in milliseconds, or null if the run has not started. */
  readonly duration: number | null
}

/**
 * Status filter applied to the workflow run list UI. Either a raw run
 * status, `'all'`, or one of the conclusion-derived buckets.
 */
export type WorkflowRunFilter =
  | WorkflowRunStatus
  | 'all'
  | 'success'
  | 'failure'
  | 'cancelled'

/** A job belonging to a workflow run. */
export interface IWorkflowJob {
  readonly id: number
  readonly runId: number
  readonly name: string
  readonly status: WorkflowRunStatus
  readonly conclusion: WorkflowRunConclusion | null
  readonly startedAt: string | null
  readonly completedAt: string | null
  readonly htmlUrl: string
  readonly steps: ReadonlyArray<IWorkflowJobStep>
}

/** A single step within a workflow job. */
export interface IWorkflowJobStep {
  readonly name: string
  readonly status: WorkflowRunStatus
  readonly conclusion: WorkflowRunConclusion | null
  readonly number: number
  readonly startedAt: string | null
  readonly completedAt: string | null
}
