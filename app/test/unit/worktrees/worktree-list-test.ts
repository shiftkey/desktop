import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorktreeList } from '../../../src/ui/worktrees/worktree-list'
import { WorktreeListItem } from '../../../src/ui/worktrees/worktree-list-item'
import { IWorktreeEntry } from '../../../src/models/worktree'

const entry = (over: Partial<IWorktreeEntry> = {}): IWorktreeEntry => ({
  path: '/tmp/worktree',
  head: 'abcdef0123456789abcdef0123456789abcdef01',
  branch: 'main',
  isDetached: false,
  isBare: false,
  lockedReason: null,
  prunableReason: null,
  changesCount: 0,
  ...over,
})

const renderList = (props: {
  entries: ReadonlyArray<IWorktreeEntry>
  loading: boolean
}): string => renderToStaticMarkup(React.createElement(WorktreeList, props))

const renderItem = (e: IWorktreeEntry): string =>
  renderToStaticMarkup(React.createElement(WorktreeListItem, { entry: e }))

describe('WorktreeList', () => {
  it('shows a loading message while refreshing', () => {
    const html = renderList({ entries: [], loading: true })
    expect(html).toContain('Loading worktrees')
  })

  it('shows an empty message when there are no linked worktrees', () => {
    const html = renderList({ entries: [], loading: false })
    expect(html).toContain('No linked worktrees found')
  })

  it('renders one row per entry', () => {
    const html = renderList({
      entries: [
        entry({ path: '/wt/a', branch: 'a' }),
        entry({ path: '/wt/b', branch: 'b' }),
      ],
      loading: false,
    })
    expect(html).toContain('/wt/a')
    expect(html).toContain('/wt/b')
  })
})

describe('WorktreeListItem', () => {
  it('shows the checked-out branch name', () => {
    const html = renderItem(entry({ branch: 'feature/login' }))
    expect(html).toContain('feature/login')
    expect(html).not.toContain('detached')
  })

  it('shows a detached sha when no branch is checked out', () => {
    const html = renderItem(
      entry({ branch: null, isDetached: true, head: 'deadbeef'.repeat(5) })
    )
    expect(html).toContain('detached @ deadbeef')
  })

  it('labels the bare repository entry', () => {
    const html = renderItem(entry({ branch: null, isBare: true }))
    expect(html).toContain('bare repository')
  })

  it('renders a locked badge', () => {
    const html = renderItem(entry({ lockedReason: 'on a removable drive' }))
    expect(html).toContain('Locked')
    expect(html).toContain('worktree-list__badge--locked')
  })

  it('renders a prunable badge', () => {
    const html = renderItem(entry({ prunableReason: 'gitdir is gone' }))
    expect(html).toContain('Prunable')
    expect(html).toContain('worktree-list__badge--prunable')
  })

  it('omits status badges for a healthy worktree', () => {
    const html = renderItem(entry())
    expect(html).not.toContain('worktree-list__badge')
  })

  it('pluralizes the uncommitted change count', () => {
    expect(renderItem(entry({ changesCount: 1 }))).toContain(
      '1 uncommitted change'
    )
    const many = renderItem(entry({ changesCount: 3 }))
    expect(many).toContain('3 uncommitted changes')
  })

  it('hides the change count when the worktree is clean', () => {
    const html = renderItem(entry({ changesCount: 0 }))
    expect(html).not.toContain('uncommitted change')
  })
})
