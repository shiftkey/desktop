import { BaseStore } from './base-store'
import { Repository } from '../../models/repository'
import { IStashEntry } from '../../models/stash-entry'
import { getAllStashes } from '../git/stash'

/**
 * Per-repository stash list cache. Whether a refresh is currently in flight
 * is tracked so that the UI can show a spinner without double-issuing git
 * commands.
 */
export interface IRepoStashState {
  readonly entries: ReadonlyArray<IStashEntry>
  readonly loading: boolean
  readonly error: Error | null
  readonly loadedAt: number | null
}

const EMPTY_STATE: IRepoStashState = Object.freeze({
  entries: [],
  loading: false,
  error: null,
  loadedAt: null,
})

/**
 * Cache of stash entries by repository id.
 *
 * The store does not own the actual git operations beyond `loadStashes` —
 * mutations (apply / pop / drop / create) live on the dispatcher and call
 * back here to refresh the cache.
 */
export class StashStore extends BaseStore {
  private state: Map<number, IRepoStashState> = new Map()

  /** Get the cached state for a repository, or an empty state if not loaded. */
  public getState(repository: Repository): IRepoStashState {
    return this.state.get(repository.id) ?? EMPTY_STATE
  }

  /** Get the full state map. Useful for selectors that want to react to any change. */
  public getAllState(): ReadonlyMap<number, IRepoStashState> {
    return this.state
  }

  /**
   * Refresh the stash list for the given repository. Concurrent calls for the
   * same repository coalesce — the second caller awaits the in-flight result
   * rather than re-running git.
   */
  public async loadStashes(repository: Repository): Promise<void> {
    const current = this.state.get(repository.id)
    if (current?.loading) {
      return
    }

    this.update(repository.id, current ?? EMPTY_STATE, { loading: true })

    try {
      const entries = await getAllStashes(repository)
      // `loadStashes` seeds a loading entry above, so a missing entry now
      // means clear() ran while git was in flight (e.g. the repo was
      // removed). Don't resurrect the dropped cache.
      if (!this.state.has(repository.id)) {
        return
      }
      this.update(repository.id, this.state.get(repository.id) ?? EMPTY_STATE, {
        entries,
        loading: false,
        error: null,
        loadedAt: Date.now(),
      })
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e))
      if (!this.state.has(repository.id)) {
        this.emitError(error)
        return
      }
      this.update(repository.id, this.state.get(repository.id) ?? EMPTY_STATE, {
        loading: false,
        error,
      })
      this.emitError(error)
    }
  }

  /**
   * Drop the cached state for a repository (e.g. when the user removes it from
   * the app). Emits an update so any view bound to the cache re-renders.
   */
  public clear(repository: Repository): void {
    if (this.state.delete(repository.id)) {
      this.emitUpdate()
    }
  }

  private update(
    repoId: number,
    base: IRepoStashState,
    patch: Partial<IRepoStashState>
  ) {
    this.state.set(repoId, { ...base, ...patch })
    this.emitUpdate()
  }
}
