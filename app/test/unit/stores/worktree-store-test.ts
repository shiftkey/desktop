import { Repository } from '../../../src/models/repository'
import { WorktreeStore } from '../../../src/lib/stores/worktree-store'
import {
  listWorkTrees,
  getWorktreeStatusCount,
} from '../../../src/lib/git/worktree'

jest.mock('../../../src/lib/git/worktree', () => ({
  listWorkTrees: jest.fn(),
  getWorktreeStatusCount: jest.fn(async () => 0),
}))

const mockedListWorkTrees = listWorkTrees as jest.MockedFunction<
  typeof listWorkTrees
>

function makeRepo(id: number, path: string): Repository {
  return new Repository(path, id, null, false)
}

describe('WorktreeStore', () => {
  let store: WorktreeStore

  beforeEach(() => {
    store = new WorktreeStore()
    mockedListWorkTrees.mockReset()
    ;(getWorktreeStatusCount as jest.Mock).mockResolvedValue(0)
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

  it('does not resurrect state cleared while a load is in flight', async () => {
    const repo = makeRepo(1, '/tmp/repo')

    // First load completes normally so the repo has cached state — this is
    // the case the previous guard mishandled (it only bailed when the repo
    // had *never* been loaded).
    mockedListWorkTrees.mockResolvedValueOnce([])
    await store.loadWorktrees(repo)
    expect(store.getAllState().has(1)).toBe(true)

    // Second load is held open; the repo is removed (clear) mid-flight.
    let release: (value: never[]) => void = () => {}
    mockedListWorkTrees.mockReturnValueOnce(
      new Promise<never[]>(resolve => {
        release = resolve
      })
    )
    const inFlight = store.loadWorktrees(repo)
    store.clear(repo)
    expect(store.getAllState().has(1)).toBe(false)

    release([])
    await inFlight

    // The completed load must not recreate state for the removed repo.
    expect(store.getAllState().has(1)).toBe(false)
    expect(store.getState(repo).loadedAt).toBeNull()
  })
})
