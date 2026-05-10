import { RepoHealthStore } from '../../../src/lib/stores/repo-health-store'
import { Repository } from '../../../src/models/repository'
import { IRepoHealthProbes } from '../../../src/lib/repo-health/collect-health'

const repo = (id: number) => new Repository('/tmp/r' + id, id, null, false)

const probes = (uncommittedCount = 0): IRepoHealthProbes => ({
  uncommittedCount: async () => uncommittedCount,
  aheadBehind: async () => ({ ahead: 0, behind: 0 }),
  defaultBranchStatus: async () => 'unknown',
  openPullRequestCount: async () => 0,
  lastActivityUnix: async () => 0,
  staleBranchCount: async () => 0,
})

describe('RepoHealthStore', () => {
  it('refreshAll fills the snapshot for the given repos', async () => {
    const store = new RepoHealthStore({
      collectorOptions: { probes: probes(2) },
    })
    await store.refreshAll([repo(1), repo(2)])
    const snap = store.getSnapshot()
    expect(snap.statuses.get(1)?.uncommittedCount).toBe(2)
    expect(snap.statuses.get(2)?.uncommittedCount).toBe(2)
    expect(snap.refreshing.size).toBe(0)
    expect(snap.lastRefreshAt).not.toBeNull()
  })

  it('refreshAll is a no-op when called within the dedup window', async () => {
    let calls = 0
    const p: IRepoHealthProbes = {
      ...probes(),
      uncommittedCount: async () => {
        calls++
        return 0
      },
    }
    const fixedNow = 1000
    const store = new RepoHealthStore({
      collectorOptions: { probes: p },
      now: () => fixedNow,
    })
    await store.refreshAll([repo(1)])
    await store.refreshAll([repo(1)]) // within window — should skip
    expect(calls).toBe(1)
  })

  it('refreshAll force=true bypasses the dedup window', async () => {
    let calls = 0
    const p: IRepoHealthProbes = {
      ...probes(),
      uncommittedCount: async () => {
        calls++
        return 0
      },
    }
    const store = new RepoHealthStore({
      collectorOptions: { probes: p },
      now: () => 1000,
    })
    await store.refreshAll([repo(1)])
    await store.refreshAll([repo(1)], true)
    expect(calls).toBe(2)
  })

  it('coalesces concurrent refreshAll calls onto a single in-flight promise', async () => {
    let calls = 0
    const p: IRepoHealthProbes = {
      ...probes(),
      uncommittedCount: async () => {
        calls++
        await new Promise(r => setTimeout(r, 5))
        return 0
      },
    }
    const store = new RepoHealthStore({ collectorOptions: { probes: p } })
    const a = store.refreshAll([repo(1)])
    const b = store.refreshAll([repo(2)])
    await Promise.all([a, b])
    // Only the first call's repos got collected.
    expect(calls).toBe(1)
  })

  it('refreshOne updates only the specified repo and emits twice', async () => {
    const store = new RepoHealthStore({ collectorOptions: { probes: probes(5) } })
    let updates = 0
    store.onDidUpdate(() => updates++)
    await store.refreshOne(repo(7))
    expect(store.getSnapshot().statuses.get(7)?.uncommittedCount).toBe(5)
    // start (refreshing add) + finish (refreshing remove)
    expect(updates).toBeGreaterThanOrEqual(2)
  })

  it('forget removes a single repo', async () => {
    const store = new RepoHealthStore({ collectorOptions: { probes: probes() } })
    await store.refreshAll([repo(1), repo(2)])
    let updates = 0
    store.onDidUpdate(() => updates++)
    store.forget(1)
    expect(store.getSnapshot().statuses.has(1)).toBe(false)
    expect(store.getSnapshot().statuses.has(2)).toBe(true)
    expect(updates).toBe(1)
  })

  it('forget is a no-op for unknown ids', () => {
    const store = new RepoHealthStore({ collectorOptions: { probes: probes() } })
    let updates = 0
    store.onDidUpdate(() => updates++)
    store.forget(999)
    expect(updates).toBe(0)
  })

  it('clear empties the snapshot and emits one update', async () => {
    const store = new RepoHealthStore({ collectorOptions: { probes: probes() } })
    await store.refreshAll([repo(1), repo(2)])
    let updates = 0
    store.onDidUpdate(() => updates++)
    store.clear()
    const s = store.getSnapshot()
    expect(s.statuses.size).toBe(0)
    expect(s.lastRefreshAt).toBeNull()
    expect(updates).toBe(1)
  })

  it('clear is a no-op when state is already empty', () => {
    const store = new RepoHealthStore({ collectorOptions: { probes: probes() } })
    let updates = 0
    store.onDidUpdate(() => updates++)
    store.clear()
    expect(updates).toBe(0)
  })

  it('marks repos as refreshing during refreshAll', async () => {
    let observed = false
    const p: IRepoHealthProbes = {
      ...probes(),
      uncommittedCount: async () => {
        observed = true
        return 0
      },
    }
    const store = new RepoHealthStore({ collectorOptions: { probes: p } })
    let refreshingDuring: number[] = []
    store.onDidUpdate(() => {
      // Snapshot the refreshing set's contents at this exact emit, since
      // the live Set will be cleared by the time we assert.
      refreshingDuring = [...store.getSnapshot().refreshing]
    })
    await store.refreshAll([repo(1)])
    expect(observed).toBe(true)
    // After all updates we'll have the LAST emitted state which is empty.
    // The intermediate emit (when refreshing was added) must have included id 1.
    // We verify by re-running with a hook that captures peak.
    let peakRefreshing: number[] = []
    const store2 = new RepoHealthStore({
      collectorOptions: { probes: probes() },
    })
    store2.onDidUpdate(() => {
      const live = [...store2.getSnapshot().refreshing]
      if (live.length > peakRefreshing.length) peakRefreshing = live
    })
    await store2.refreshAll([repo(1)])
    expect(peakRefreshing).toEqual([1])
    // refreshingDuring is asserted only to silence unused-variable lint.
    expect(Array.isArray(refreshingDuring)).toBe(true)
  })
})
