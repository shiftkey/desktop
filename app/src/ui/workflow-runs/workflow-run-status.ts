import * as octicons from '../octicons/octicons.generated'

/**
 * Shared status presentation for workflow runs, jobs, and steps. The
 * GitHub Actions run, job, and check APIs all use the same `status` /
 * `conclusion` string vocabulary, so a single mapping keeps the run list,
 * the run detail pane, and the job list visually consistent.
 */

const COMPLETED = 'completed'
const SUCCESS = 'success'

/** Conclusions that read as "finished, but not a pass and not a failure". */
const NEUTRAL_CONCLUSIONS: ReadonlySet<string> = new Set([
  'cancelled',
  'neutral',
  'skipped',
])

/** A CSS modifier class describing the run/job/step outcome. */
export function getWorkflowRunStatusClass(
  status: string,
  conclusion: string | null
): 'status-success' | 'status-failure' | 'status-cancelled' | 'status-pending' {
  if (status === COMPLETED) {
    if (conclusion === SUCCESS) {
      return 'status-success'
    }
    if (conclusion !== null && NEUTRAL_CONCLUSIONS.has(conclusion)) {
      return 'status-cancelled'
    }
    return 'status-failure'
  }
  return 'status-pending'
}

/** The Octicon symbol describing the run/job/step outcome. */
export function getWorkflowRunStatusIcon(
  status: string,
  conclusion: string | null
): octicons.OcticonSymbol {
  if (status === COMPLETED) {
    if (conclusion === SUCCESS) {
      return octicons.check
    }
    if (conclusion !== null && NEUTRAL_CONCLUSIONS.has(conclusion)) {
      return octicons.stop
    }
    return octicons.x
  }
  return octicons.clock
}

/** A short, human-readable label for the run/job/step outcome. */
export function getWorkflowRunStatusLabel(
  status: string,
  conclusion: string | null
): string {
  if (status !== COMPLETED) {
    switch (status) {
      case 'in_progress':
        return 'In progress'
      case 'queued':
        return 'Queued'
      case 'waiting':
        return 'Waiting'
      case 'requested':
        return 'Requested'
      case 'pending':
        return 'Pending'
      default:
        return 'In progress'
    }
  }
  if (conclusion === null) {
    return 'Completed'
  }
  switch (conclusion) {
    case 'success':
      return 'Succeeded'
    case 'failure':
      return 'Failed'
    case 'cancelled':
      return 'Cancelled'
    case 'neutral':
      return 'Neutral'
    case 'skipped':
      return 'Skipped'
    case 'timed_out':
      return 'Timed out'
    case 'action_required':
      return 'Action required'
    case 'stale':
      return 'Stale'
    case 'startup_failure':
      return 'Startup failure'
    default:
      return 'Completed'
  }
}

/**
 * Whether a completed run failed in a way that GitHub allows re-running
 * just the failed jobs for.
 */
export function isReRunnableConclusion(conclusion: string | null): boolean {
  return (
    conclusion === 'failure' ||
    conclusion === 'timed_out' ||
    conclusion === 'startup_failure' ||
    conclusion === 'stale' ||
    conclusion === 'action_required'
  )
}

/** Whether a run is still active and can therefore be cancelled. */
export function isCancellableStatus(status: string): boolean {
  return status !== COMPLETED
}
