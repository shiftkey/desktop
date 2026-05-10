import {
  collectRepoHealth,
  collectMany,
  IRepoHealthProbes,
} from '../../../src/lib/repo-health/collect-health'
import { Repository } from '../../../src/models/repository'

const repo = (id: number) => new Repository('/tmp/r' + id, id, null, false)

const okProbes = (): IRepoHealthProbes => ({
  uncommittedCount: async () => 2,
  aheadBehind: async () => ({ ahead: 1, behind: 0 }),
  defaultBranchStatus: async () => 'success',
  openPullRequestCount: async () => 3,
  lastActivityUnix: async () => 1700000000,
  staleBranchCount: async () => 1,
})

const failingProbes = (): IRepoHealthProbes => ({
  uncommittedCount: async () => {
    throw new Error('git status failed')
  },
  aheadBehind: async () => {
    throw new Error('rev-list failed')
  },
  defaultBranchStatus: async () => {
    throw new Error('api failed')
  },
  openPullRequestCount: async () => {
    throw new Error('api failed')
  },
  lastActivityUnix: async () => {
    throw new Error('log failed')
  },
  staleBranchCount: async () => {
    throw new Error('for-each-ref failed')
  },
})

describe('collectRepoHealth', () => {
  it('returns aggregated signals + score for a healthy collector', async () => {
    const r = repo(1)
    const h = await collectRepoHealth(r, {
      probes: okProbes(),
      now: () => 1700000000000,
    })
    expect(h.repositoryId).toBe(1)
    expect(h.uncommittedCount).toBe(2)
    expect(h.aheadBy).toBe(1)
    expect(h.openPullRequestCount).toBe(3)
    expect(h.lastActivityUnix).toBe(1700000000)
    expect(h.staleBranchCount).toBe(1)
    expect(h.collectedAt).toBe(1700000000000)
    expect(h.error).toBeNull()
    // 30 (uncommitted) + 5 (ahead) + 6 (3 PRs) = 41
    expect(h.attentionScore).toBe(41)
  })

  it('degrades each failing probe to a sensible default', async () => {
    const h = await collectRepoHealth(repo(1), {
      probes: failingProbes(),
      now: () => 0,
    })
    expect(h.error).toBeNull() // individual probe failures don't poison
    expect(h.uncommittedCount).toBe(0)
    expect(h.aheadBy).toBe(0)
    expect(h.behindBy).toBe(0)
    expect(h.defaultBranchStatus).toBe('unknown')
    expect(h.openPullRequestCount).toBe(0)
    expect(h.attentionScore).toBe(0)
  })

  it('uses Date.now() when no clock is supplied', async () => {
    const before = Date.now()
    const h = await collectRepoHealth(repo(1), { probes: okProbes() })
    const after = Date.now()
    expect(h.collectedAt).toBeGreaterThanOrEqual(before)
    expect(h.collectedAt).toBeLessThanOrEqual(after)
  })
})

describe('collectMany', () => {
  it('runs collectors and preserves input order', async () => {
    const repos = [repo(1), repo(2), repo(3), repo(4), repo(5)]
    const probes: IRepoHealthProbes = {
      ...okProbes(),
      // deliberately resolve out of order
      uncommittedCount: r =>
        new Promise(resolve =>
          setTimeout(() => resolve(r.id), Math.random() * 5)
        ),
    }
    const results = await collectMany(repos, { probes }, 3)
    expect(results.map(r => r.repositoryId)).toEqual([1, 2, 3, 4, 5])
    expect(results.map(r => r.uncommittedCount)).toEqual([1, 2, 3, 4, 5])
  })

  it('respects concurrency cap (no more than N in-flight)', async () => {
    let inFlight = 0
    let peak = 0
    const probes: IRepoHealthProbes = {
      ...okProbes(),
      uncommittedCount: async () => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await new Promise(r => setTimeout(r, 5))
        inFlight--
        return 0
      },
    }
    const repos = Array.from({ length: 8 }, (_, i) => repo(i + 1))
    await collectMany(repos, { probes }, 2)
    expect(peak).toBeLessThanOrEqual(2)
  })

  it('handles concurrency below 1 by clamping to 1', async () => {
    const repos = [repo(1), repo(2)]
    const results = await collectMany(repos, { probes: okProbes() }, 0)
    expect(results).toHaveLength(2)
  })

  it('returns empty array for empty input', async () => {
    const results = await collectMany([], { probes: okProbes() })
    expect(results).toEqual([])
  })
})
