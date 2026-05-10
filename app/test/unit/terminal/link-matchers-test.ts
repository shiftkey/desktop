import {
  filePathRegex,
  parseFilePathMatch,
} from '../../../src/lib/terminal/link-matchers'

describe('filePathRegex', () => {
  it.each([
    ['src/foo.ts:12', 'src/foo.ts', 12, null],
    ['./src/foo.ts:12:34', './src/foo.ts', 12, 34],
    ['/abs/path/to/file.py:7', '/abs/path/to/file.py', 7, null],
    ['lib/x/y.tsx:200:15', 'lib/x/y.tsx', 200, 15],
  ])('matches %s', (input, file, line, col) => {
    const m = parseFilePathMatch(input as string)
    expect(m).not.toBeNull()
    expect(m!.path).toBe(file)
    expect(m!.line).toBe(line)
    expect(m!.column).toBe(col)
  })

  it('does not match URLs', () => {
    expect(parseFilePathMatch('http://example.com:8080')).toBeNull()
    expect(parseFilePathMatch('https://x.io/path:1')).toBeNull()
  })

  it('does not match plain numbers', () => {
    expect(parseFilePathMatch('1234:5')).toBeNull()
  })

  it('does not match a colon with no number after it', () => {
    expect(parseFilePathMatch('src/foo.ts:abc')).toBeNull()
  })

  it('respects the regex global flag for multi-match scans', () => {
    const text = 'see src/a.ts:1 and lib/b.ts:2:3'
    const matches = Array.from(text.matchAll(filePathRegex))
    expect(matches).toHaveLength(2)
  })
})
