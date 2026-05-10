import { RepoHealthDashboard } from '../../../src/ui/repo-health/repo-health-dashboard'
import { Repository } from '../../../src/models/repository'
import { IRepoHealth, IRepoHealthSnapshot } from '../../../src/lib/repo-health/types'

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

function makeDashboard(over: Partial<IRepoHealthSnapshot> = {}, repos = [repo(1, 'a'), repo(2, 'b')]) {
  const snapshot: IRepoHealthSnapshot = {
    statuses: over.statuses ?? new Map(),
    refreshing: over.refreshing ?? new Set(),
    lastRefreshAt: over.lastRefreshAt ?? null,
  }
  const onSelect = jest.fn()
  const onRefresh = jest.fn()
  const dash = new RepoHealthDashboard({
    repositories: repos,
    snapshot,
    onSelectRepository: onSelect,
    onRefreshClick: onRefresh,
  })
  ;(dash as any).setState = (s: any) => {
    dash.state = { ...dash.state, ...s }
  }
  return { dash, onSelect, onRefresh }
}

describe('RepoHealthDashboard', () => {
  it('renders an empty placeholder when no repos match the filter', () => {
    const { dash } = makeDashboard({}, [])
    const tree: any = dash.render()
    const empty = tree.props.children[1]
    expect(empty.props.className).toBe('repo-health-dashboard__empty')
  })

  it('renders one row per repository when present', () => {
    const repos = [repo(1, 'a'), repo(2, 'b'), repo(3, 'c')]
    const { dash } = makeDashboard({}, repos)
    const tree: any = dash.render()
    const rows = tree.props.children[1].props.children as any[]
    expect(rows).toHaveLength(3)
  })

  it('sorts by attention score descending by default', () => {
    const repos = [repo(1, 'a'), repo(2, 'b'), repo(3, 'c')]
    const statuses = new Map([
      [1, health({ repositoryId: 1, attentionScore: 10 })],
      [2, health({ repositoryId: 2, attentionScore: 50 })],
      [3, health({ repositoryId: 3, attentionScore: 30 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    const rows = dash.render().props.children[1].props.children as any[]
    expect(rows.map(r => r.key)).toEqual(['2', '3', '1'])
  })

  it('sorts alphabetically when sort=name', () => {
    const repos = [repo(1, 'banana'), repo(2, 'apple'), repo(3, 'cherry')]
    const { dash } = makeDashboard({}, repos)
    dash.state = { ...dash.state, sort: 'name' }
    const rows = dash.render().props.children[1].props.children as any[]
    expect(rows.map(r => r.key)).toEqual(['2', '1', '3'])
  })

  it('filters to "needs attention" only', () => {
    const repos = [repo(1, 'a'), repo(2, 'b')]
    const statuses = new Map([
      [1, health({ repositoryId: 1, attentionScore: 0 })],
      [2, health({ repositoryId: 2, attentionScore: 5 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    dash.state = { ...dash.state, filter: 'attention' }
    const rows = dash.render().props.children[1].props.children as any[]
    expect(rows.map(r => r.key)).toEqual(['2'])
  })

  it('filters to "has-prs" only', () => {
    const repos = [repo(1, 'a'), repo(2, 'b')]
    const statuses = new Map([
      [1, health({ repositoryId: 1, openPullRequestCount: 0 })],
      [2, health({ repositoryId: 2, openPullRequestCount: 3 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    dash.state = { ...dash.state, filter: 'has-prs' }
    const rows = dash.render().props.children[1].props.children as any[]
    expect(rows.map(r => r.key)).toEqual(['2'])
  })

  it('filters to "behind" only', () => {
    const repos = [repo(1, 'a'), repo(2, 'b')]
    const statuses = new Map([
      [1, health({ repositoryId: 1, behindBy: 0 })],
      [2, health({ repositoryId: 2, behindBy: 3 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    dash.state = { ...dash.state, filter: 'behind' }
    const rows = dash.render().props.children[1].props.children as any[]
    expect(rows.map(r => r.key)).toEqual(['2'])
  })

  it('filters to "clean" only (no uncommitted, no ahead, no behind)', () => {
    const repos = [repo(1, 'a'), repo(2, 'b'), repo(3, 'c')]
    const statuses = new Map([
      [1, health({ repositoryId: 1 })], // clean
      [2, health({ repositoryId: 2, uncommittedCount: 1 })],
      [3, health({ repositoryId: 3, aheadBy: 1 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    dash.state = { ...dash.state, filter: 'clean' }
    const rows = dash.render().props.children[1].props.children as any[]
    expect(rows.map(r => r.key)).toEqual(['1'])
  })

  it('forwards refresh button click', () => {
    const { dash, onRefresh } = makeDashboard()
    const tree: any = dash.render()
    const toolbar = tree.props.children[0]
    // last child is the refresh button
    const button = toolbar.props.children[toolbar.props.children.length - 1]
    button.props.onClick()
    expect(onRefresh).toHaveBeenCalled()
  })
})
