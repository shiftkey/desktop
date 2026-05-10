import { RepoHealthRow } from '../../../src/ui/repo-health/repo-health-row'
import { Repository } from '../../../src/models/repository'
import { IRepoHealth } from '../../../src/lib/repo-health/types'

const repo = (id: number, name: string) =>
  new Repository('/r/' + name, id, null, false)

const health = (over: Partial<IRepoHealth> = {}): IRepoHealth => ({
  repositoryId: 0,
  uncommittedCount: 0,
  aheadBy: 0,
  behindBy: 0,
  defaultBranchStatus: 'unknown',
  openPullRequestCount: 0,
  lastActivityUnix: 0,
  staleBranchCount: 0,
  attentionScore: 0,
  collectedAt: 0,
  error: null,
  ...over,
})

function makeRow(over: any = {}) {
  const onClick = jest.fn()
  const row = new RepoHealthRow({
    repository: over.repository ?? repo(1, 'a'),
    health: over.health ?? null,
    refreshing: over.refreshing ?? false,
    onClick: over.onClick ?? onClick,
  })
  return { row, onClick }
}

/** Stringify the React tree so we can assert on rendered content. */
function dump(tree: unknown): string {
  return JSON.stringify(tree)
}

describe('RepoHealthRow', () => {
  it('uses tier-ok when no health is loaded', () => {
    const { row } = makeRow()
    const tree: any = row.render()
    expect(tree.props.className).toContain('repo-health-card')
    expect(tree.props.className).toContain('tier-ok')
  })

  it('marks tier-high for attention >= 50', () => {
    const { row } = makeRow({ health: health({ attentionScore: 70 }) })
    const tree: any = row.render()
    expect(tree.props.className).toContain('tier-high')
    expect(dump(tree)).toContain('score-high')
  })

  it('marks tier-mid for 20 <= attention < 50', () => {
    const { row } = makeRow({ health: health({ attentionScore: 30 }) })
    const tree: any = row.render()
    expect(tree.props.className).toContain('tier-mid')
    expect(dump(tree)).toContain('score-mid')
  })

  it('marks tier-low for 0 < attention < 20', () => {
    const { row } = makeRow({ health: health({ attentionScore: 5 }) })
    const tree: any = row.render()
    expect(tree.props.className).toContain('tier-low')
  })

  it('renders the refreshing class and "…" placeholder', () => {
    const { row } = makeRow({ refreshing: true })
    const tree: any = row.render()
    expect(tree.props.className).toContain('refreshing')
    expect(dump(tree)).toContain('"…"')
  })

  it('renders an error block when health.error is set', () => {
    const { row } = makeRow({ health: health({ error: 'boom' }) })
    const tree: any = row.render()
    expect(dump(tree)).toContain('repo-health-card__error')
    expect(dump(tree)).toContain('boom')
  })

  it('renders all signal cells (changes/ahead/behind/PRs/CI/stale/last)', () => {
    const { row } = makeRow({
      health: health({
        uncommittedCount: 3,
        aheadBy: 2,
        behindBy: 1,
        openPullRequestCount: 4,
        defaultBranchStatus: 'failure',
        staleBranchCount: 7,
        lastActivityUnix: Math.floor(Date.now() / 1000) - 3600,
        attentionScore: 70,
      }),
    })
    const tree: any = row.render()
    const text = dump(tree)
    expect(text).toContain('Changes')
    expect(text).toContain('Ahead')
    expect(text).toContain('Behind')
    expect(text).toContain('Open PRs')
    expect(text).toContain('CI')
    expect(text).toContain('Stale branches')
    expect(text).toContain('Last commit')
  })

  it('flags the CI cell as bad on failure', () => {
    const { row } = makeRow({
      health: health({ defaultBranchStatus: 'failure' }),
    })
    const tree: any = row.render()
    // SignalCell is a function component; assert on the prop passed in.
    expect(dump(tree)).toContain('"bad":true')
    expect(dump(tree)).toContain('"value":"✗"')
  })

  it('forwards the click with the repository', () => {
    const { row, onClick } = makeRow()
    const tree: any = row.render()
    tree.props.onClick()
    expect(onClick).toHaveBeenCalledWith(row.props.repository)
  })

  it('Enter key triggers click', () => {
    const { row, onClick } = makeRow()
    const tree: any = row.render()
    const stub = { preventDefault: jest.fn() } as any
    tree.props.onKeyDown({ ...stub, key: 'Enter' })
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(stub.preventDefault).toHaveBeenCalled()
  })

  it('Space key triggers click', () => {
    const { row, onClick } = makeRow()
    const tree: any = row.render()
    const stub = { preventDefault: jest.fn() } as any
    tree.props.onKeyDown({ ...stub, key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('falls back to repo path when name is empty', () => {
    const r = new Repository('/path/only', 99, null, false)
    Object.defineProperty(r, 'name', { value: '' })
    const row = new RepoHealthRow({
      repository: r,
      health: null,
      refreshing: false,
      onClick: jest.fn(),
    })
    const tree: any = row.render()
    expect(dump(tree)).toContain('/path/only')
  })
})
