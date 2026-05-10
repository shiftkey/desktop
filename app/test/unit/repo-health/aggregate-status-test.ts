import { computeAttentionScore } from '../../../src/lib/repo-health/aggregate-status'

const base = {
  uncommittedCount: 0,
  aheadBy: 0,
  behindBy: 0,
  defaultBranchStatus: 'success' as const,
  openPullRequestCount: 0,
}

describe('computeAttentionScore', () => {
  it('returns 0 for a fully clean repo', () => {
    expect(computeAttentionScore(base)).toBe(0)
  })

  it('adds 30 when there are any uncommitted files', () => {
    expect(computeAttentionScore({ ...base, uncommittedCount: 1 })).toBe(30)
    expect(computeAttentionScore({ ...base, uncommittedCount: 999 })).toBe(30)
  })

  it('adds 5 per ahead commit, capped at 25', () => {
    expect(computeAttentionScore({ ...base, aheadBy: 1 })).toBe(5)
    expect(computeAttentionScore({ ...base, aheadBy: 5 })).toBe(25)
    expect(computeAttentionScore({ ...base, aheadBy: 100 })).toBe(25)
  })

  it('adds 5 per behind commit, capped at 20', () => {
    expect(computeAttentionScore({ ...base, behindBy: 1 })).toBe(5)
    expect(computeAttentionScore({ ...base, behindBy: 4 })).toBe(20)
    expect(computeAttentionScore({ ...base, behindBy: 100 })).toBe(20)
  })

  it('adds 15 for a failing default branch CI', () => {
    expect(
      computeAttentionScore({ ...base, defaultBranchStatus: 'failure' })
    ).toBe(15)
  })

  it('does NOT add anything for pending or unknown CI status', () => {
    expect(
      computeAttentionScore({ ...base, defaultBranchStatus: 'pending' })
    ).toBe(0)
    expect(
      computeAttentionScore({ ...base, defaultBranchStatus: 'unknown' })
    ).toBe(0)
  })

  it('adds 2 per open PR, capped at 10', () => {
    expect(computeAttentionScore({ ...base, openPullRequestCount: 1 })).toBe(2)
    expect(computeAttentionScore({ ...base, openPullRequestCount: 5 })).toBe(10)
    expect(
      computeAttentionScore({ ...base, openPullRequestCount: 100 })
    ).toBe(10)
  })

  it('combines signals additively', () => {
    expect(
      computeAttentionScore({
        uncommittedCount: 3,
        aheadBy: 2,
        behindBy: 1,
        defaultBranchStatus: 'failure',
        openPullRequestCount: 3,
      })
    ).toBe(30 + 10 + 5 + 15 + 6)
  })

  it('caps the total at 100', () => {
    const big = computeAttentionScore({
      uncommittedCount: 999,
      aheadBy: 999,
      behindBy: 999,
      defaultBranchStatus: 'failure',
      openPullRequestCount: 999,
    })
    expect(big).toBe(100)
  })

  it('treats negative inputs as zero', () => {
    expect(
      computeAttentionScore({ ...base, aheadBy: -5, behindBy: -3 })
    ).toBe(0)
  })
})
