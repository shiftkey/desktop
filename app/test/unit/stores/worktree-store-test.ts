import { Repository } from '../../../src/models/repository'
import { WorktreeStore } from '../../../src/lib/stores/worktree-store'

function makeRepo(id: number, path: string): Repository {
  return new Repository(path, id, null, false)
}

describe('WorktreeStore', () => {
  let store: WorktreeStore

  beforeEach(() => {
    store = new WorktreeStore()
  })

  it('returns empty state for unknown repository', () => {
    const repo = makeRepo(1, '/tmp/repo')
    const state = store.getState(repo)
    expect(state.entries).toHaveLength(0)
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
    expect(state.loadedAt).toBeNull()
  })

  it('emits an update when state changes', () => {
    const repo = makeRepo(1, '/tmp/repo')
    const onUpdate = jest.fn()
    store.onDidUpdate(onUpdate)

    // Directly update state by simulating a load
    store.loadWorktrees(repo).catch(() => {
      // ignore errors from mock repo
    })

    // Should have emitted at least one update (loading: true)
    expect(onUpdate).toHaveBeenCalled()
  })

  it('clears state for a repository', () => {
    const repo = makeRepo(1, '/tmp/repo')
    const onUpdate = jest.fn()
    store.onDidUpdate(onUpdate)

    store.clear(repo)

    expect(onUpdate).toHaveBeenCalled()
    const state = store.getState(repo)
    expect(state.entries).toHaveLength(0)
  })
})
