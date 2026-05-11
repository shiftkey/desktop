/**
 * Per-repository health collector.
 *
 * Composed from injectable probes so tests run without a real git invocation
 * or a network call. Each probe returns a Promise — we run them concurrently
 * and tolerate individual failures (one collector returning an error does not
 * poison the snapshot for other signals).
 */

import { Repository } from '../../models/repository'
import { IRepoHealth } from './types'
import { computeAttentionScore } from './aggregate-status'

export interface IRepoHealthProbes {
  /** Number of files in the working directory that aren't clean. */
  readonly uncommittedCount: (repo: Repository) => Promise<number>
  /** `[ahead, behind]` against the configured upstream. */
  readonly aheadBehind: (
    repo: Repository
  ) => Promise<{ ahead: number; behind: number }>
  /** Default branch CI status. */
  readonly defaultBranchStatus: (
    repo: Repository
  ) => Promise<IRepoHealth['defaultBranchStatus']>
  /** Number of open PRs targeting this repo. */
  readonly openPullRequestCount: (repo: Repository) => Promise<number>
  /** Unix seconds of last commit on the default branch (0 = unknown). */
  readonly lastActivityUnix: (repo: Repository) => Promise<number>
  /** Local branches with no commits in the last 60 days. */
  readonly staleBranchCount: (repo: Repository) => Promise<number>
}

export interface ICollectorOptions {
  readonly probes: IRepoHealthProbes
  readonly now?: () => number
}

/** Helper: turn a promise into `value | fallback` on rejection. */
async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p
  } catch {
    return fallback
  }
}

/**
 * Collect every signal for a single repository. Signals run in parallel; a
 * rejected probe degrades to a sensible default rather than failing the
 * whole snapshot.
 */
export async function collectRepoHealth(
  repo: Repository,
  opts: ICollectorOptions
): Promise<IRepoHealth> {
  const now = (opts.now ?? Date.now)()
  try {
    const [
      uncommittedCount,
      aheadBehind,
      defaultBranchStatus,
      openPullRequestCount,
      lastActivityUnix,
      staleBranchCount,
    ] = await Promise.all([
      safe(opts.probes.uncommittedCount(repo), 0),
      safe(opts.probes.aheadBehind(repo), { ahead: 0, behind: 0 }),
      safe<IRepoHealth['defaultBranchStatus']>(
        opts.probes.defaultBranchStatus(repo),
        'unknown'
      ),
      safe(opts.probes.openPullRequestCount(repo), 0),
      safe(opts.probes.lastActivityUnix(repo), 0),
      safe(opts.probes.staleBranchCount(repo), 0),
    ])

    return {
      repositoryId: repo.id,
      uncommittedCount,
      aheadBy: aheadBehind.ahead,
      behindBy: aheadBehind.behind,
      defaultBranchStatus,
      openPullRequestCount,
      lastActivityUnix,
      staleBranchCount,
      attentionScore: computeAttentionScore({
        uncommittedCount,
        aheadBy: aheadBehind.ahead,
        behindBy: aheadBehind.behind,
        defaultBranchStatus,
        openPullRequestCount,
      }),
      collectedAt: now,
      error: null,
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      repositoryId: repo.id,
      uncommittedCount: 0,
      aheadBy: 0,
      behindBy: 0,
      defaultBranchStatus: 'unknown',
      openPullRequestCount: 0,
      lastActivityUnix: 0,
      staleBranchCount: 0,
      attentionScore: 0,
      collectedAt: now,
      error: message,
    }
  }
}

/**
 * Run multiple collectors in parallel with a concurrency cap.
 *
 * Returns an array of `IRepoHealth` aligned with the input order. Order is
 * preserved even when probes resolve out of order so callers can stably
 * render rows. When an `AbortSignal` is provided and aborts mid-run, the
 * remaining repos are skipped — the resulting array contains a `null`
 * placeholder for every skipped slot which callers must filter out.
 */
export async function collectMany(
  repos: ReadonlyArray<Repository>,
  opts: ICollectorOptions,
  concurrency: number = 4,
  signal?: AbortSignal
): Promise<ReadonlyArray<IRepoHealth>> {
  if (concurrency < 1) {
    concurrency = 1
  }
  const results: Array<IRepoHealth | null> = new Array(repos.length).fill(null)
  let cursor = 0
  async function worker() {
    while (true) {
      if (signal?.aborted) {
        return
      }
      const idx = cursor++
      if (idx >= repos.length) {
        return
      }
      results[idx] = await collectRepoHealth(repos[idx], opts)
    }
  }
  const workers = Array.from(
    { length: Math.min(concurrency, repos.length) },
    () => worker()
  )
  await Promise.all(workers)
  return results.filter((r): r is IRepoHealth => r !== null)
}
