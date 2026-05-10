/**
 * Link matchers for the integrated terminal.
 *
 * Detects diagnostic-style file references like `src/foo.ts:42:7` or
 * `/abs/path/file.py:99` so the terminal panel can wire them into
 * clickable handlers that jump to the file in the diff/history viewer.
 *
 * URL-shaped strings (`http://host:port/path`) are deliberately rejected
 * — the web-links addon already handles those.
 */

export interface IFilePathMatch {
  readonly path: string
  readonly line: number
  readonly column: number | null
}

/**
 * Matches `[./|/]?path/with/dots.ext:line[:col]`. The leading
 * negative-lookbehind avoids matching the `://` in URL schemes.
 */
export const filePathRegex =
  /(?<!:\/)(?:\.\/|\/)?[\w./-]+\.[A-Za-z][\w]*:\d+(?::\d+)?/g

export function parseFilePathMatch(text: string): IFilePathMatch | null {
  // Reject URL-shaped inputs outright; the web-links addon owns those.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text)) {
    return null
  }
  const m = new RegExp(filePathRegex.source).exec(text)
  if (m === null) {
    return null
  }
  const matched = m[0]
  if (/^https?:\/\//.test(matched)) {
    return null
  }
  // Reject "1234:5" — must have at least one path-like prefix char.
  const last = matched.lastIndexOf(':')
  const beforeLast = matched.slice(0, last)
  if (!/[A-Za-z./_-]/.test(beforeLast)) {
    return null
  }
  const parts = matched.split(':')
  // parts.length is 2 or 3
  const path = parts[0]
  if (!/\.[A-Za-z]/.test(path)) {
    return null
  }
  const line = parseInt(parts[1], 10)
  if (Number.isNaN(line)) {
    return null
  }
  let column: number | null = null
  if (parts.length === 3) {
    const c = parseInt(parts[2], 10)
    column = Number.isNaN(c) ? null : c
  }
  return { path, line, column }
}
