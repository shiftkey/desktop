import { ChangeSummaryBadge } from '../../../src/ui/changes/change-summary-badge'

function createBadge(
  stats: { files: number; additions: number; deletions: number } | null,
  changedFilesCount: number = stats?.files ?? 0
) {
  return new ChangeSummaryBadge({ stats, changedFilesCount })
}

describe('ChangeSummaryBadge', () => {
  it('renders stats', () => {
    const badge = createBadge({ files: 12, additions: 248, deletions: 67 })
    const element = badge.render() as any
    expect(element).not.toBeNull()
    const text = renderToText(element)
    expect(text).toContain('12 files')
    expect(text).toContain('+248')
    expect(text).toContain('-67')
  })

  it('renders zero stats when stats is null and there are no changed files', () => {
    const badge = createBadge(null)
    const element = badge.render() as any
    const text = renderToText(element)
    expect(text).toContain('0 files')
    expect(text).toContain('+0')
    expect(text).toContain('-0')
  })

  it('renders zero stats when files is 0', () => {
    const badge = createBadge({ files: 0, additions: 0, deletions: 0 })
    const element = badge.render() as any
    const text = renderToText(element)
    expect(text).toContain('0 files')
    expect(text).toContain('+0')
    expect(text).toContain('-0')
  })

  it('falls back to the changed files count when stats are unavailable', () => {
    const badge = createBadge(null, 3)
    const element = badge.render() as any
    const text = renderToText(element)
    expect(text).toContain('3 files')
    expect(text).toContain('+0')
    expect(text).toContain('-0')
  })

  it('uses the working directory file count when diff stats do not include every file', () => {
    const badge = createBadge({ files: 1, additions: 5, deletions: 2 }, 3)
    const element = badge.render() as any
    const text = renderToText(element)
    expect(text).toContain('3 files')
    expect(text).toContain('+5')
    expect(text).toContain('-2')
  })

  it('uses singular file label for one file', () => {
    const badge = createBadge({ files: 1, additions: 5, deletions: 2 })
    const element = badge.render() as any
    const text = renderToText(element)
    expect(text).toContain('1 file')
    expect(text).not.toContain('1 files')
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
