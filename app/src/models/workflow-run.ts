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
}

export interface IWorkflowRun {
  readonly id: number
  readonly name: string
  readonly headBranch: string
  readonly headSha: string
  readonly runNumber: number
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
  readonly headCommitMessage: string
  readonly duration: number | null
}

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

export interface IWorkflowJobStep {
  readonly name: string
  readonly status: WorkflowRunStatus
  readonly conclusion: WorkflowRunConclusion | null
  readonly number: number
  readonly startedAt: string | null
  readonly completedAt: string | null
}
