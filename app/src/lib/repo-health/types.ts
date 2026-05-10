/**
 * Aggregated health snapshot for a single repository in the dashboard.
 *
 * Optional fields default to "unknown"-shaped values so renderers can degrade
 * gracefully when an individual collector fails.
 */
export interface IRepoHealth {
  readonly repositoryId: number
  readonly uncommittedCount: number
  readonly aheadBy: number
  readonly behindBy: number
  readonly defaultBranchStatus: 'success' | 'pending' | 'failure' | 'unknown'
  readonly openPullRequestCount: number
  readonly lastActivityUnix: number
  readonly staleBranchCount: number
  /** 0..100; higher = more attention needed. */
  readonly attentionScore: number
  readonly collectedAt: number
  readonly error: string | null
}

export interface IRepoHealthSnapshot {
  readonly statuses: ReadonlyMap<number, IRepoHealth>
  readonly refreshing: ReadonlySet<number>
  readonly lastRefreshAt: number | null
}
