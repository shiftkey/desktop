import { BaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { IRepoHealth, IRepoHealthSnapshot } from '../repo-health/types'
import { collectMany, ICollectorOptions } from '../repo-health/collect-health'

export interface IRepoHealthStoreOptions {
  readonly collectorOptions: ICollectorOptions
  readonly concurrency?: number
  readonly now?: () => number
}

const DEDUP_WINDOW_MS = 60_000

interface IInFlightRefresh {
  readonly repoIds: Set<number>
  readonly promise: Promise<void>
  readonly controller: AbortController
}

export class RepoHealthStore extends BaseStore {
  private readonly options: IRepoHealthStoreOptions
  private statuses: Map<number, IRepoHealth> = new Map()
  private refreshing: Set<number> = new Set()
  private lastRefreshAt: number | null = null
  private inFlight: IInFlightRefresh | null = null
  private singleControllers: Set<AbortController> = new Set()

  public constructor(options: IRepoHealthStoreOptions) {
    super()
    this.options = options
  }

  public getSnapshot(): IRepoHealthSnapshot {
    return {
      statuses: this.statuses,
      refreshing: this.refreshing,
      lastRefreshAt: this.lastRefreshAt,
    }
  }

  /**
   * Refresh health for the given repositories.
   *
   * If a refresh is already in flight that covers every requested repo, the
   * caller awaits the in-flight promise. Otherwise — including the case
   * where the new caller asks for repos that the in-flight run doesn't
   * cover — a new run is scheduled to pick up the missing repos as soon as
   * the current one finishes.
   *
   * If `force=false` and the cache is fresh (<60s old) the call is a no-op.
   */
  public async refreshAll(
    repos: ReadonlyArray<Repository>,
    force: boolean = false
  ): Promise<void> {
    const requestedIds = new Set(repos.map(r => r.id))

    if (this.inFlight !== null) {
      const covered = isSubsetOf(requestedIds, this.inFlight.repoIds)
      if (covered) {
        return this.inFlight.promise
      }
      // The in-flight run doesn't cover everything we need. Wait for it,
      // then run a follow-up. We force=true on the follow-up because the
      // dedup window would otherwise skip the run we just promised to
      // perform — leaving the new repos with stale (or absent) statuses.
      const previous = this.inFlight.promise
      const followUp = previous.then(() => this.refreshAll(repos, true))
      return followUp
    }

    const now = (this.options.now ?? Date.now)()
    if (
      !force &&
      this.lastRefreshAt !== null &&
      now - this.lastRefreshAt < DEDUP_WINDOW_MS
    ) {
      return
    }

    for (const id of requestedIds) {
      this.refreshing.add(id)
    }
    this.emitUpdate()

    const controller = new AbortController()
    const reposCopy = repos.slice()
    const promise = (async () => {
      try {
        const results = await collectMany(
          reposCopy,
          this.options.collectorOptions,
          this.options.concurrency ?? 4,
          controller.signal
        )
        if (controller.signal.aborted) {
          return
        }
        for (const r of results) {
          this.storeResult(r)
        }
        this.lastRefreshAt = (this.options.now ?? Date.now)()
      } finally {
        for (const id of requestedIds) {
          this.refreshing.delete(id)
        }
        this.inFlight = null
        this.emitUpdate()
      }
    })()

    this.inFlight = { repoIds: requestedIds, promise, controller }
    return promise
  }

  /** Refresh exactly one repository (e.g., after a successful push). */
  public async refreshOne(repo: Repository): Promise<void> {
    this.refreshing.add(repo.id)
    this.emitUpdate()
    const controller = new AbortController()
    this.singleControllers.add(controller)
    try {
      const [health] = await collectMany(
        [repo],
        this.options.collectorOptions,
        1,
        controller.signal
      )
      if (controller.signal.aborted) {
        return
      }
      if (health) {
        this.storeResult(health)
      }
      // Note: deliberately does NOT touch `lastRefreshAt`. That field
      // tracks the last *full sweep* and gates the `refreshAll` dedup
      // window; updating it here would suppress a subsequent full
      // refresh and leave every other repo showing stale data.
    } finally {
      this.singleControllers.delete(controller)
      this.refreshing.delete(repo.id)
      this.emitUpdate()
    }
  }

  /**
   * Store a collected snapshot unless a strictly newer one is already
   * present. A long `refreshAll` batch and a fast `refreshOne` can resolve
   * in either order; without this guard the later-resolving-but-older run
   * would clobber the fresher data (e.g. overwriting a post-push snapshot
   * with the pre-push state captured when the batch started).
   */
  private storeResult(health: IRepoHealth): void {
    const existing = this.statuses.get(health.repositoryId)
    if (existing !== undefined && existing.collectedAt > health.collectedAt) {
      return
    }
    this.statuses.set(health.repositoryId, health)
  }

  /** Drop the snapshot for one repository (e.g., user removed the repo). */
  public forget(repositoryId: number): void {
    let changed = false
    if (this.statuses.delete(repositoryId)) {
      changed = true
    }
    if (this.refreshing.delete(repositoryId)) {
      changed = true
    }
    if (changed) {
      this.emitUpdate()
    }
  }

  /** Drop all cached state and abort any in-flight collection. */
  public clear(): void {
    if (this.inFlight !== null) {
      try {
        this.inFlight.controller.abort()
      } catch {
        // Some Node/Electron versions throw on double-abort; ignore.
      }
    }
    for (const ctrl of this.singleControllers) {
      try {
        ctrl.abort()
      } catch {
        // ignore
      }
    }
    if (this.statuses.size === 0 && this.refreshing.size === 0) {
      return
    }
    this.statuses.clear()
    this.refreshing.clear()
    this.lastRefreshAt = null
    this.emitUpdate()
  }
}

function isSubsetOf(a: Set<number>, b: Set<number>): boolean {
  if (a.size > b.size) {
    return false
  }
  for (const v of a) {
    if (!b.has(v)) {
      return false
    }
  }
  return true
}
