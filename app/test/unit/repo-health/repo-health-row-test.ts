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

describe('RepoHealthRow', () => {
  it('renders the repo name without health when not loaded yet', () => {
    const { row } = makeRow()
    const tree: any = row.render()
    expect(tree.props.className).toBe('repo-health-row')
    const name = tree.props.children[0]
    expect(name.props.children).toBe('a')
  })

  it('adds the "refreshing" class and a refreshing indicator', () => {
    const { row } = makeRow({ refreshing: true })
    const tree: any = row.render()
    expect(tree.props.className).toContain('refreshing')
    const indicator = tree.props.children[1]
    expect(indicator.props.className).toBe('repo-health-row__refreshing')
  })

  it('renders an error span when health.error is set', () => {
    const { row } = makeRow({ health: health({ error: 'boom' }) })
    const tree: any = row.render()
    const signals = tree.props.children[2]
    expect(signals.props.className).toBe('repo-health-row__error')
    expect(signals.props.title).toBe('boom')
  })

  it('renders signals for uncommitted/ahead/behind/PRs/CI failure/score', () => {
    const { row } = makeRow({
      health: health({
        uncommittedCount: 3,
        aheadBy: 2,
        behindBy: 1,
        openPullRequestCount: 4,
        defaultBranchStatus: 'failure',
        attentionScore: 70,
      }),
    })
    const tree: any = row.render()
    const signalsSpan = tree.props.children[2]
    const json = JSON.stringify(signalsSpan)
    expect(json).toContain('uncommitted')
    expect(json).toContain('ahead')
    expect(json).toContain('behind')
    expect(json).toContain('PRs')
    expect(json).toContain('✗ CI')
    expect(json).toContain('⚠')
    expect(json).toContain('70')
    expect(json).toContain('score-high')
  })

  it('uses score-mid for attention 20-49', () => {
    const { row } = makeRow({ health: health({ attentionScore: 30 }) })
    const tree: any = row.render()
    expect(JSON.stringify(tree)).toContain('score-mid')
  })

  it('uses score-low for attention < 20', () => {
    const { row } = makeRow({ health: health({ attentionScore: 5 }) })
    const tree: any = row.render()
    expect(JSON.stringify(tree)).toContain('score-low')
  })

  it('hides per-signal spans when their values are zero', () => {
    const { row } = makeRow({ health: health({ attentionScore: 0 }) })
    const tree: any = row.render()
    const json = JSON.stringify(tree)
    expect(json).not.toContain('uncommitted')
    expect(json).not.toContain('ahead')
    expect(json).not.toContain('behind')
    expect(json).not.toContain('PRs')
    expect(json).not.toContain('✗ CI')
  })

  it('forwards the click with the repository', () => {
    const { row, onClick } = makeRow()
    const tree: any = row.render()
    tree.props.onClick()
    expect(onClick).toHaveBeenCalledWith(row.props.repository)
  })

  it('falls back to repo path when name is empty', () => {
    const r = new Repository('/path/only', 99, null, false)
    // Repository name is derived from path basename -> 'only'.
    // Test the explicit empty-name path by manually constructing:
    Object.defineProperty(r, 'name', { value: '' })
    const row = new RepoHealthRow({
      repository: r,
      health: null,
      refreshing: false,
      onClick: jest.fn(),
    })
    const tree: any = row.render()
    const name = tree.props.children[0]
    expect(name.props.children).toBe('/path/only')
  })
})
