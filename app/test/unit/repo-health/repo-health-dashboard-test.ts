import { RepoHealthDashboard } from '../../../src/ui/repo-health/repo-health-dashboard'
import { Repository } from '../../../src/models/repository'
import {
  IRepoHealth,
  IRepoHealthSnapshot,
} from '../../../src/lib/repo-health/types'

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

function makeDashboard(
  over: Partial<IRepoHealthSnapshot> = {},
  repos = [repo(1, 'a'), repo(2, 'b')]
) {
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

/** Walk the rendered tree, return all elements whose className contains a substring. */
function findByClassName(tree: any, substring: string): any[] {
  const out: any[] = []
  const walk = (node: any) => {
    if (node === null || node === undefined) {return}
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node === 'object' && node.props) {
      const cn: string | undefined = node.props.className
      if (typeof cn === 'string' && cn.includes(substring)) {out.push(node)}
      walk(node.props.children)
    }
  }
  walk(tree)
  return out
}

describe('RepoHealthDashboard', () => {
  it('renders the empty placeholder when no repos match the filter', () => {
    const { dash } = makeDashboard({}, [])
    const tree: any = dash.render()
    expect(findByClassName(tree, 'repo-health-dashboard__empty')).toHaveLength(
      1
    )
  })

  it('renders one card per repository in the grid', () => {
    const repos = [repo(1, 'a'), repo(2, 'b'), repo(3, 'c')]
    const { dash } = makeDashboard({}, repos)
    const tree: any = dash.render()
    const grid = findByClassName(tree, 'repo-health-dashboard__grid')
    expect(grid).toHaveLength(1)
    const cards = grid[0].props.children as any[]
    expect(cards).toHaveLength(3)
  })

  it('sorts by attention score descending by default', () => {
    const repos = [repo(1, 'a'), repo(2, 'b'), repo(3, 'c')]
    const statuses = new Map([
      [1, health({ repositoryId: 1, attentionScore: 10 })],
      [2, health({ repositoryId: 2, attentionScore: 50 })],
      [3, health({ repositoryId: 3, attentionScore: 30 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    const tree: any = dash.render()
    const cards = findByClassName(tree, 'repo-health-dashboard__grid')[0].props
      .children as any[]
    expect(cards.map(c => c.key)).toEqual(['2', '3', '1'])
  })

  it('sorts alphabetically when sort=name', () => {
    const repos = [repo(1, 'banana'), repo(2, 'apple'), repo(3, 'cherry')]
    const { dash } = makeDashboard({}, repos)
    dash.state = { ...dash.state, sort: 'name' }
    const tree: any = dash.render()
    const cards = findByClassName(tree, 'repo-health-dashboard__grid')[0].props
      .children as any[]
    expect(cards.map(c => c.key)).toEqual(['2', '1', '3'])
  })

  it('sorts by recent activity when sort=recent', () => {
    const repos = [repo(1, 'a'), repo(2, 'b'), repo(3, 'c')]
    const statuses = new Map([
      [1, health({ repositoryId: 1, lastActivityUnix: 1000 })],
      [2, health({ repositoryId: 2, lastActivityUnix: 3000 })],
      [3, health({ repositoryId: 3, lastActivityUnix: 2000 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    dash.state = { ...dash.state, sort: 'recent' }
    const tree: any = dash.render()
    const cards = findByClassName(tree, 'repo-health-dashboard__grid')[0].props
      .children as any[]
    expect(cards.map(c => c.key)).toEqual(['2', '3', '1'])
  })

  it('filters to "needs attention" only', () => {
    const repos = [repo(1, 'a'), repo(2, 'b')]
    const statuses = new Map([
      [1, health({ repositoryId: 1, attentionScore: 0 })],
      [2, health({ repositoryId: 2, attentionScore: 5 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    dash.state = { ...dash.state, filter: 'attention' }
    const tree: any = dash.render()
    const cards = findByClassName(tree, 'repo-health-dashboard__grid')[0].props
      .children as any[]
    expect(cards.map(c => c.key)).toEqual(['2'])
  })

  it('filter "clean" excludes repos with failing CI', () => {
    const repos = [repo(1, 'a'), repo(2, 'b')]
    const statuses = new Map([
      [1, health({ repositoryId: 1 })], // clean
      [2, health({ repositoryId: 2, defaultBranchStatus: 'failure' })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    dash.state = { ...dash.state, filter: 'clean' }
    const tree: any = dash.render()
    const cards = findByClassName(tree, 'repo-health-dashboard__grid')[0].props
      .children as any[]
    expect(cards.map(c => c.key)).toEqual(['1'])
  })

  it('search query filters by name and path', () => {
    const repos = [repo(1, 'apple'), repo(2, 'banana'), repo(3, 'cherry')]
    const { dash } = makeDashboard({}, repos)
    dash.state = { ...dash.state, query: 'an' }
    const tree: any = dash.render()
    const cards = findByClassName(tree, 'repo-health-dashboard__grid')[0].props
      .children as any[]
    // 'banana' matches; 'apple' and 'cherry' don't.
    expect(cards.map(c => c.key)).toEqual(['2'])
  })

  it('forwards refresh button click', () => {
    const { dash, onRefresh } = makeDashboard()
    const tree: any = dash.render()
    const refreshBtn = findByClassName(
      tree,
      'repo-health-dashboard__refresh'
    )[0]
    refreshBtn.props.onClick()
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it('renders summary stats including key labels', () => {
    const repos = [repo(1, 'a'), repo(2, 'b'), repo(3, 'c')]
    const statuses = new Map([
      [1, health({ repositoryId: 1, attentionScore: 30 })],
      [
        2,
        health({
          repositoryId: 2,
          openPullRequestCount: 2,
          attentionScore: 5,
        }),
      ],
      [3, health({ repositoryId: 3, behindBy: 4, attentionScore: 10 })],
    ])
    const { dash } = makeDashboard({ statuses }, repos)
    const tree: any = dash.render()
    const text = JSON.stringify(tree)
    // SummaryStat is a function component; the labels appear as props on it.
    expect(text).toContain('Repositories')
    expect(text).toContain('Need attention')
    expect(text).toContain('With open PRs')
    expect(text).toContain('Failing CI')
    expect(text).toContain('Behind remote')
  })
})
