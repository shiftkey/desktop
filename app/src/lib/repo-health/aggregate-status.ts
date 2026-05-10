/**
 * Pure scoring function: take the raw signals collected for a repository and
 * derive the at-a-glance "attention" score (0–100).
 *
 * Higher scores = more attention needed. The formula is intentionally simple
 * and easy to tweak — the goal is rank ordering, not a calibrated risk model.
 *
 * Documented breakdown so users can see why their repo is highlighted:
 *
 *   uncommitted > 0                 → +30
 *   aheadBy   (capped at 5)         → +5 each, max +25
 *   behindBy  (capped at 4)         → +5 each, max +20
 *   defaultBranchStatus === failure → +15
 *   openPullRequestCount (cap 5)    → +2 each, max +10
 */

export interface IRepoHealthSignals {
  readonly uncommittedCount: number
  readonly aheadBy: number
  readonly behindBy: number
  readonly defaultBranchStatus: 'success' | 'pending' | 'failure' | 'unknown'
  readonly openPullRequestCount: number
}

export function computeAttentionScore(signals: IRepoHealthSignals): number {
  const uncommitted = signals.uncommittedCount > 0 ? 30 : 0
  const ahead = Math.min(Math.max(signals.aheadBy, 0) * 5, 25)
  const behind = Math.min(Math.max(signals.behindBy, 0) * 5, 20)
  const status = signals.defaultBranchStatus === 'failure' ? 15 : 0
  const prs = Math.min(Math.max(signals.openPullRequestCount, 0) * 2, 10)
  return Math.min(100, uncommitted + ahead + behind + status + prs)
}
