import { ChangeSummaryBadge } from '../../../src/ui/changes/change-summary-badge'

function createBadge(
  stats: { files: number; additions: number; deletions: number } | null,
  changedFilesCount: number = stats?.files ?? 0
) {
  return new ChangeSummaryBadge({ stats, changedFilesCount })
}

describe('ChangeSummaryBadge', () => {
  it('renders the added/removed line counts', () => {
    const badge = createBadge({ files: 12, additions: 248, deletions: 67 })
    const element = badge.render() as any
    expect(element).not.toBeNull()
    const text = renderToText(element)
    expect(text).toContain('+248')
    expect(text).toContain('-67')
  })

  it('does not duplicate the file count in the rendered badge', () => {
    const badge = createBadge({ files: 12, additions: 248, deletions: 67 })
    const element = badge.render() as any
    const text = renderToText(element)
    expect(text).not.toContain('files')
  })

  it('renders zero stats when stats is null and there are no changed files', () => {
    const badge = createBadge(null)
    const element = badge.render() as any
    const text = renderToText(element)
    expect(text).toContain('+0')
    expect(text).toContain('-0')
  })

  it('renders zero stats when files is 0', () => {
    const badge = createBadge({ files: 0, additions: 0, deletions: 0 })
    const element = badge.render() as any
    const text = renderToText(element)
    expect(text).toContain('+0')
    expect(text).toContain('-0')
  })

  it('uses the working directory file count when diff stats do not include every file', () => {
    const badge = createBadge({ files: 1, additions: 5, deletions: 2 }, 3)
    const element = badge.render() as any
    expect(element.props.tooltip).toContain('3 files')
    const text = renderToText(element)
    expect(text).toContain('+5')
    expect(text).toContain('-2')
  })

  it('summarizes the file count and line deltas in the tooltip', () => {
    const badge = createBadge({ files: 12, additions: 248, deletions: 67 })
    const element = badge.render() as any
    expect(element.props.tooltip).toBe(
      '12 files changed • 248 additions • 67 deletions'
    )
  })

  it('uses the singular file label for one file in the tooltip', () => {
    const badge = createBadge({ files: 1, additions: 5, deletions: 2 })
    const element = badge.render() as any
    expect(element.props.tooltip).toContain('1 file changed')
    expect(element.props.tooltip).not.toContain('1 files')
  })
})

function renderToText(element: any): string {
  if (element === null || element === undefined) {
    return ''
  }
  if (typeof element === 'string' || typeof element === 'number') {
    return String(element)
  }
  if (Array.isArray(element)) {
    return element.map(renderToText).join('')
  }
  if (element.props && element.props.children) {
    return renderToText(element.props.children)
  }
  return ''
}
