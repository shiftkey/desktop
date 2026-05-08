import { filterChangedFilesByPath } from '../../src/lib/filter-changed-files'

describe('filterChangedFilesByPath', () => {
  const files = [
    { path: 'app/src/ui/changes/changes-list.tsx' },
    { path: 'README.md' },
    { path: 'script/package.ts' },
  ]

  it('returns all files for blank filters', () => {
    expect(filterChangedFilesByPath(files, '')).toEqual(files)
    expect(filterChangedFilesByPath(files, '   ')).toEqual(files)
  })

  it('matches paths case-insensitively', () => {
    expect(filterChangedFilesByPath(files, 'README')).toEqual([files[1]])
    expect(filterChangedFilesByPath(files, 'CHANGES')).toEqual([files[0]])
  })

  it('matches multiple terms in any path segment', () => {
    expect(filterChangedFilesByPath(files, 'src list')).toEqual([files[0]])
    expect(filterChangedFilesByPath(files, 'package script')).toEqual([
      files[2],
    ])
  })
})
