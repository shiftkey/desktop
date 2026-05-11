import { BaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { IWorktreeEntry } from '../../models/worktree'
import { listWorkTrees, getWorktreeStatusCount } from '../git/worktree'

/**
 * Per-repository worktree list cache. Whether a refresh is currently in flight
 * is tracked so that the UI can show a spinner without double-issuing git
 * commands.
 */
export interface IRepoWorktreeState {
  readonly entries: ReadonlyArray<IWorktreeEntry>
  readonly loading: boolean
  readonly error: Error | null
  readonly loadedAt: number | null
}

const EMPTY_STATE: IRepoWorktreeState = Object.freeze({
  entries: [],
  loading: false,
  error: null,
  loadedAt: null,
})

/**
 * Cache of worktree entries by repository id.
 */
export class WorktreeStore extends BaseStore {
  private state: Map<number, IRepoWorktreeState> = new Map()

  /** Get the cached state for a repository, or an empty state if not loaded. */
  public getState(repository: Repository): IRepoWorktreeState {
    return this.state.get(repository.id) ?? EMPTY_STATE
  }

  /** Get the full state map. */
  public getAllState(): ReadonlyMap<number, IRepoWorktreeState> {
    return this.state
  }

  /**
   * Refresh the worktree list for the given repository. Concurrent calls for the
   * same repository coalesce.
   */
  public async loadWorktrees(repository: Repository): Promise<void> {
    const current = this.state.get(repository.id)
    if (current?.loading) {
      return
    }

    this.update(repository.id, current ?? EMPTY_STATE, { loading: true })

    try {
      const linkedWorktrees = await listWorkTrees(repository)
      // Skip the main worktree (first entry) and get change counts for linked worktrees
      const entries: Array<IWorktreeEntry> = []
      for (const wt of linkedWorktrees.slice(1)) {
        const changesCount = await getWorktreeStatusCount(wt.path)
        entries.push({ ...wt, changesCount })
      }

      this.update(repository.id, this.state.get(repository.id) ?? EMPTY_STATE, {
        entries,
        loading: false,
        error: null,
        loadedAt: Date.now(),
      })
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      this.update(repository.id, this.state.get(repository.id) ?? EMPTY_STATE, {
        loading: false,
        error,
      })
      this.emitError(error)
    }
  }

  /**
   * Drop the cached state for a repository.
   */
  public clear(repository: Repository): void {
    this.state.delete(repository.id)
    this.emitUpdate()
  }

  private update(
    repositoryId: number,
    current: IRepoWorktreeState,
    partial: Partial<IRepoWorktreeState>
  ): void {
    const next = { ...current, ...partial }
    this.state.set(repositoryId, next)
    this.emitUpdate()
  }
}
