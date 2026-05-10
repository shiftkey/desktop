import { BaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { IRepoHealth, IRepoHealthSnapshot } from '../repo-health/types'
import {
  collectMany,
  ICollectorOptions,
} from '../repo-health/collect-health'

export interface IRepoHealthStoreOptions {
  readonly collectorOptions: ICollectorOptions
  readonly concurrency?: number
  readonly now?: () => number
}

const DEDUP_WINDOW_MS = 60_000

export class RepoHealthStore extends BaseStore {
  private readonly options: IRepoHealthStoreOptions
  private statuses: Map<number, IRepoHealth> = new Map()
  private refreshing: Set<number> = new Set()
  private lastRefreshAt: number | null = null
  private inFlight: Promise<void> | null = null

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
   * Refresh health for the given repositories. Concurrent calls coalesce —
   * the second caller awaits the in-flight promise rather than re-running.
   *
   * If `force=false` and the cache is fresh (<60s old) the call is a no-op.
   */
  public async refreshAll(
    repos: ReadonlyArray<Repository>,
    force: boolean = false
  ): Promise<void> {
    if (this.inFlight !== null) {
      return this.inFlight
    }
    const now = (this.options.now ?? Date.now)()
    if (
      !force &&
      this.lastRefreshAt !== null &&
      now - this.lastRefreshAt < DEDUP_WINDOW_MS
    ) {
      return
    }

    for (const r of repos) this.refreshing.add(r.id)
    this.emitUpdate()

    this.inFlight = (async () => {
      try {
        const results = await collectMany(
          repos,
          this.options.collectorOptions,
          this.options.concurrency ?? 4
        )
        for (const r of results) {
          this.statuses.set(r.repositoryId, r)
        }
        this.lastRefreshAt = (this.options.now ?? Date.now)()
      } finally {
        for (const r of repos) this.refreshing.delete(r.id)
        this.inFlight = null
        this.emitUpdate()
      }
    })()

    return this.inFlight
  }

  /** Refresh exactly one repository (e.g., after a successful push). */
  public async refreshOne(repo: Repository): Promise<void> {
    this.refreshing.add(repo.id)
    this.emitUpdate()
    try {
      const [health] = await collectMany([repo], this.options.collectorOptions, 1)
      this.statuses.set(repo.id, health)
    } finally {
      this.refreshing.delete(repo.id)
      this.lastRefreshAt = (this.options.now ?? Date.now)()
      this.emitUpdate()
    }
  }

  /** Drop the snapshot for one repository (e.g., user removed the repo). */
  public forget(repositoryId: number): void {
    if (this.statuses.delete(repositoryId)) {
      this.emitUpdate()
    }
  }

  /** Drop all cached state. */
  public clear(): void {
    if (this.statuses.size === 0 && this.refreshing.size === 0) return
    this.statuses.clear()
    this.refreshing.clear()
    this.lastRefreshAt = null
    this.emitUpdate()
  }
}
