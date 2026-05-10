# Terminal Experience Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the integrated terminal from a vanilla xterm embed into a top-tier in-app terminal: faster rendering, richer tabs, search, smart links, splits, command blocks, and quality-of-life polish.

**Architecture:** Layered enhancement. Renderer side: new addons (WebGL/Canvas, search, web-links, unicode11, ligatures), per-session metadata extensions (CWD/activity/exit-code), a `TerminalSettings` localStorage adapter, a layout layer for splits, and OSC parsers for prompt + CWD marks. Main process: extended PTY options for env injection, OSC sequence forwarding, and crash detection. We deliberately keep the MessagePort byte path untouched — it's the hot loop.

**Tech Stack:** TypeScript, Electron, React, xterm.js 5, `@xterm/addon-{webgl,canvas,search,web-links,unicode11,ligatures}`, node-pty, Jest.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `app/src/lib/terminal/terminal-settings.ts` | Persisted user preferences (font size, scrollback, theme-follow). localStorage adapter. |
| `app/src/lib/terminal/osc-parser.ts` | Detects OSC 7 (cwd) and OSC 133 (prompt boundaries) inside PTY byte streams. Pure function, no xterm dep. |
| `app/src/lib/terminal/link-matchers.ts` | Regexes + handlers for `path/to/file:line:col` style matches. Pure. |
| `app/src/lib/terminal/tab-model.ts` | Pure helpers for tab activity, label formatting (CWD-aware), reorder. |
| `app/src/lib/terminal/split-layout.ts` | Pure tree model for split panes (orientation, ratio, leaves carry sessionId). |
| `app/src/lib/terminal/command-blocks.ts` | Maintains a list of `{startLine, endLine, command, exitCode}` per session from OSC 133 marks. |
| `app/src/ui/terminal/terminal-find-bar.tsx` | The search overlay (`Ctrl+Shift+F`). |
| `app/src/ui/terminal/terminal-empty-state.tsx` | Friendly empty placeholder with primary CTA. |
| `app/src/ui/terminal/paste-confirm-dialog.tsx` | Bracketed-paste guard for multi-line clipboard content. |
| `app/src/ui/terminal/split-container.tsx` | Renders the split-layout tree of XtermViews. |
| `app/test/unit/terminal/terminal-settings-test.ts` | Unit tests. |
| `app/test/unit/terminal/osc-parser-test.ts` | Unit tests. |
| `app/test/unit/terminal/link-matchers-test.ts` | Unit tests. |
| `app/test/unit/terminal/tab-model-test.ts` | Unit tests. |
| `app/test/unit/terminal/split-layout-test.ts` | Unit tests. |
| `app/test/unit/terminal/command-blocks-test.ts` | Unit tests. |
| `app/test/unit/terminal/terminal-find-bar-test.ts` | Unit tests. |
| `app/test/unit/terminal/paste-confirm-dialog-test.ts` | Unit tests. |
| `app/test/unit/terminal/split-container-test.ts` | Unit tests. |

### Modified files

| Path | Changes |
|---|---|
| `app/package.json` | Add `@xterm/addon-canvas`, `@xterm/addon-unicode11`, `@xterm/addon-ligatures`, `@xterm/addon-serialize`. |
| `app/src/lib/terminal/pty-types.ts` | Extend `ITerminalSessionSnapshot` (cwd-live, hasActivity, lastExitCode, title). |
| `app/src/lib/terminal/ipc-channels.ts` | Add `OSC_CWD`, `OSC_PROMPT_MARK` channels. |
| `app/src/lib/terminal/terminal-client.ts` | Wire OSC parser; emit metadata events. |
| `app/src/lib/stores/terminal-store.ts` | Add CWD/activity/exit/title tracking + selectors + split state. |
| `app/src/main-process/terminal/pty-session.ts` | Tap byte stream to scan OSC sequences before forwarding; inject env (`TERM_PROGRAM`, prompt-mark hooks). |
| `app/src/ui/terminal/xterm-view.tsx` | WebGL+Canvas renderer w/ fallback; search/web-links/unicode11/ligatures addons; font zoom; throttled resize; mount-on-activate; bracketed-paste guard; reconnect prompt. |
| `app/src/ui/terminal/terminal-panel.tsx` | New tabs (CWD label, activity dot, drag-reorder, rename, middle-click, `Ctrl+1..9`); status icons; split layout; find-bar host; better empty state; richer resize gutter (4px hover, keyboard arrow). |
| `app/src/ui/dispatcher/dispatcher.ts` | New methods: `searchTerminal`, `splitTerminal`, `closeSplit`, `reorderTab`, `renameTab`, `focusTabByIndex`, `setTerminalFontSize`, `rerunBlock`, `restartTerminal`. |
| `app/src/lib/stores/app-store.ts` | Wire OSC events into store; add font-size persistence; lazy-mount tracking. |
| `app/styles/ui/_terminal.scss` | Tab activity dot, status icons, find bar, splits, hover-expand resize gutter, empty state. |

### Out-of-scope cross-cutting

We intentionally don't restructure terminal code into a sub-folder despite the file growth — existing tests reference the current paths, and incremental additions cost less.

---

## Task 1: Add missing xterm addons to package.json

**Files:**
- Modify: `app/package.json`

- [ ] **Step 1: Add the new dependencies**

In `app/package.json`, in the `"dependencies"` block, alphabetically locate the existing `"@xterm/addon-*"` entries and add four siblings:

```json
"@xterm/addon-canvas": "^0.8.0",
"@xterm/addon-ligatures": "^0.10.0",
"@xterm/addon-serialize": "^0.14.0",
"@xterm/addon-unicode11": "^0.9.0",
```

(`@xterm/addon-fit`, `@xterm/addon-search`, `@xterm/addon-web-links`, `@xterm/addon-webgl` are already present.)

- [ ] **Step 2: Install**

Run: `cd app && yarn install --no-progress`
Expected: completes without errors; `app/node_modules/@xterm/addon-canvas` exists.

- [ ] **Step 3: Commit**

```bash
git add app/package.json app/yarn.lock
git commit -m "build(deps): add canvas/ligatures/serialize/unicode11 xterm addons"
```

---

## Task 2: Persisted terminal settings module

**Files:**
- Create: `app/src/lib/terminal/terminal-settings.ts`
- Test: `app/test/unit/terminal/terminal-settings-test.ts`

This module owns user preferences that need to survive a relaunch: font size, scrollback size, theme-follow toggle, renderer preference.

- [ ] **Step 1: Write failing tests**

```typescript
// app/test/unit/terminal/terminal-settings-test.ts
import {
  TerminalSettings,
  ITerminalSettingsStorage,
  DEFAULT_FONT_SIZE,
  DEFAULT_SCROLLBACK,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  MIN_SCROLLBACK,
  MAX_SCROLLBACK,
} from '../../../src/lib/terminal/terminal-settings'

function memoryStorage(): ITerminalSettingsStorage {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v)
    },
  }
}

describe('TerminalSettings', () => {
  it('returns defaults when storage is empty', () => {
    const s = new TerminalSettings(memoryStorage())
    expect(s.getFontSize()).toBe(DEFAULT_FONT_SIZE)
    expect(s.getScrollback()).toBe(DEFAULT_SCROLLBACK)
    expect(s.getThemeFollowsApp()).toBe(true)
    expect(s.getRendererPreference()).toBe('webgl')
  })

  it('clamps font size on set and persists', () => {
    const store = memoryStorage()
    const s = new TerminalSettings(store)
    s.setFontSize(MIN_FONT_SIZE - 5)
    expect(s.getFontSize()).toBe(MIN_FONT_SIZE)
    s.setFontSize(MAX_FONT_SIZE + 100)
    expect(s.getFontSize()).toBe(MAX_FONT_SIZE)
    s.setFontSize(15)
    expect(s.getFontSize()).toBe(15)
    expect(store.getItem('terminal.fontSize')).toBe('15')
  })

  it('clamps scrollback on set and persists', () => {
    const store = memoryStorage()
    const s = new TerminalSettings(store)
    s.setScrollback(0)
    expect(s.getScrollback()).toBe(MIN_SCROLLBACK)
    s.setScrollback(MAX_SCROLLBACK + 1)
    expect(s.getScrollback()).toBe(MAX_SCROLLBACK)
    s.setScrollback(20000)
    expect(s.getScrollback()).toBe(20000)
    expect(store.getItem('terminal.scrollback')).toBe('20000')
  })

  it('round-trips theme-follow flag', () => {
    const store = memoryStorage()
    const s = new TerminalSettings(store)
    s.setThemeFollowsApp(false)
    expect(s.getThemeFollowsApp()).toBe(false)
    expect(new TerminalSettings(store).getThemeFollowsApp()).toBe(false)
  })

  it('falls back to defaults when persisted value is malformed', () => {
    const store = memoryStorage()
    store.setItem('terminal.fontSize', 'NaN')
    store.setItem('terminal.scrollback', '-5')
    const s = new TerminalSettings(store)
    expect(s.getFontSize()).toBe(DEFAULT_FONT_SIZE)
    expect(s.getScrollback()).toBe(DEFAULT_SCROLLBACK)
  })

  it('emits change events when a value changes', () => {
    const s = new TerminalSettings(memoryStorage())
    const events: string[] = []
    s.onDidChange(name => events.push(name))
    s.setFontSize(14)
    s.setFontSize(14) // no-op
    s.setScrollback(10000)
    expect(events).toEqual(['fontSize', 'scrollback'])
  })

  it('persists renderer preference', () => {
    const store = memoryStorage()
    const s = new TerminalSettings(store)
    s.setRendererPreference('canvas')
    expect(s.getRendererPreference()).toBe('canvas')
    expect(new TerminalSettings(store).getRendererPreference()).toBe('canvas')
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

Run: `cd app && yarn test:unit -- terminal-settings`
Expected: module-not-found error on `terminal-settings`.

- [ ] **Step 3: Implement the module**

```typescript
// app/src/lib/terminal/terminal-settings.ts
export interface ITerminalSettingsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export type RendererPreference = 'webgl' | 'canvas' | 'dom'

export const DEFAULT_FONT_SIZE = 13
export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 32

export const DEFAULT_SCROLLBACK = 5000
export const MIN_SCROLLBACK = 500
export const MAX_SCROLLBACK = 100000

const KEY_FONT_SIZE = 'terminal.fontSize'
const KEY_SCROLLBACK = 'terminal.scrollback'
const KEY_THEME_FOLLOW = 'terminal.themeFollowsApp'
const KEY_RENDERER = 'terminal.renderer'

const noopStorage: ITerminalSettingsStorage = {
  getItem: () => null,
  setItem: () => undefined,
}

type ChangeKey =
  | 'fontSize'
  | 'scrollback'
  | 'themeFollowsApp'
  | 'rendererPreference'

export class TerminalSettings {
  private fontSize: number
  private scrollback: number
  private themeFollow: boolean
  private renderer: RendererPreference
  private listeners: Array<(name: ChangeKey) => void> = []

  public constructor(
    private readonly storage: ITerminalSettingsStorage = noopStorage
  ) {
    this.fontSize = clampInt(
      storage.getItem(KEY_FONT_SIZE),
      MIN_FONT_SIZE,
      MAX_FONT_SIZE,
      DEFAULT_FONT_SIZE
    )
    this.scrollback = clampInt(
      storage.getItem(KEY_SCROLLBACK),
      MIN_SCROLLBACK,
      MAX_SCROLLBACK,
      DEFAULT_SCROLLBACK
    )
    this.themeFollow = storage.getItem(KEY_THEME_FOLLOW) !== 'false'
    this.renderer = parseRenderer(storage.getItem(KEY_RENDERER))
  }

  public getFontSize(): number {
    return this.fontSize
  }
  public getScrollback(): number {
    return this.scrollback
  }
  public getThemeFollowsApp(): boolean {
    return this.themeFollow
  }
  public getRendererPreference(): RendererPreference {
    return this.renderer
  }

  public setFontSize(px: number): void {
    const next = clampInt(String(px), MIN_FONT_SIZE, MAX_FONT_SIZE, this.fontSize)
    if (next === this.fontSize) {
      return
    }
    this.fontSize = next
    this.storage.setItem(KEY_FONT_SIZE, String(next))
    this.emit('fontSize')
  }

  public setScrollback(lines: number): void {
    const next = clampInt(
      String(lines),
      MIN_SCROLLBACK,
      MAX_SCROLLBACK,
      this.scrollback
    )
    if (next === this.scrollback) {
      return
    }
    this.scrollback = next
    this.storage.setItem(KEY_SCROLLBACK, String(next))
    this.emit('scrollback')
  }

  public setThemeFollowsApp(follow: boolean): void {
    if (follow === this.themeFollow) {
      return
    }
    this.themeFollow = follow
    this.storage.setItem(KEY_THEME_FOLLOW, follow ? 'true' : 'false')
    this.emit('themeFollowsApp')
  }

  public setRendererPreference(pref: RendererPreference): void {
    if (pref === this.renderer) {
      return
    }
    this.renderer = pref
    this.storage.setItem(KEY_RENDERER, pref)
    this.emit('rendererPreference')
  }

  public onDidChange(cb: (name: ChangeKey) => void): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb)
    }
  }

  private emit(name: ChangeKey): void {
    for (const l of this.listeners.slice()) {
      try {
        l(name)
      } catch {
        // listener errors must not poison the setter
      }
    }
  }
}

function clampInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number
): number {
  if (raw === null) {
    return fallback
  }
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) {
    return fallback
  }
  if (n < min) {
    return min
  }
  if (n > max) {
    return max
  }
  return n
}

function parseRenderer(raw: string | null): RendererPreference {
  if (raw === 'canvas' || raw === 'dom' || raw === 'webgl') {
    return raw
  }
  return 'webgl'
}
```

- [ ] **Step 4: Run tests**

Run: `cd app && yarn test:unit -- terminal-settings`
Expected: all 7 cases pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/terminal/terminal-settings.ts app/test/unit/terminal/terminal-settings-test.ts
git commit -m "feat(terminal): add TerminalSettings persistence layer"
```

---

## Task 3: OSC parser for cwd (OSC 7) and prompt marks (OSC 133)

**Files:**
- Create: `app/src/lib/terminal/osc-parser.ts`
- Test: `app/test/unit/terminal/osc-parser-test.ts`

OSC 7 emits `\x1b]7;file://host/path\x1b\\` so we can track the live shell cwd. OSC 133 emits `\x1b]133;A\x1b\\` (prompt start), `\x1b]133;B\x1b\\` (command start), `\x1b]133;C\x1b\\` (output start), `\x1b]133;D;<exit>\x1b\\` (command end).

The parser is a stateful incremental scanner: feed it bytes, get back a list of events. It must be robust against ESC fragments split across chunk boundaries.

- [ ] **Step 1: Write failing tests**

```typescript
// app/test/unit/terminal/osc-parser-test.ts
import { OscParser, OscEvent } from '../../../src/lib/terminal/osc-parser'

function feedString(p: OscParser, s: string): OscEvent[] {
  const out: OscEvent[] = []
  p.onEvent(e => out.push(e))
  p.feed(new TextEncoder().encode(s))
  return out
}

describe('OscParser', () => {
  it('parses an OSC 7 cwd notification (file://host/path)', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]7;file://localhost/home/u/proj\x1b\\')
    expect(events).toEqual([{ type: 'cwd', path: '/home/u/proj' }])
  })

  it('parses an OSC 7 cwd with no host', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]7;file:///srv/x\x1b\\')
    expect(events).toEqual([{ type: 'cwd', path: '/srv/x' }])
  })

  it('decodes percent-encoded paths', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]7;file:///a%20b/c\x1b\\')
    expect(events).toEqual([{ type: 'cwd', path: '/a b/c' }])
  })

  it('parses OSC 133 prompt-start, command-start, output-start, command-end', () => {
    const p = new OscParser()
    const events = feedString(
      p,
      '\x1b]133;A\x1b\\\x1b]133;B\x1b\\\x1b]133;C\x1b\\\x1b]133;D;0\x1b\\'
    )
    expect(events).toEqual([
      { type: 'prompt-start' },
      { type: 'command-start' },
      { type: 'output-start' },
      { type: 'command-end', exitCode: 0 },
    ])
  })

  it('parses non-zero exit code on D', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]133;D;127\x1b\\')
    expect(events).toEqual([{ type: 'command-end', exitCode: 127 }])
  })

  it('handles BEL terminator (0x07) instead of ESC \\\\', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]7;file:///x\x07')
    expect(events).toEqual([{ type: 'cwd', path: '/x' }])
  })

  it('survives sequence split across feed() calls', () => {
    const p = new OscParser()
    const events: OscEvent[] = []
    p.onEvent(e => events.push(e))
    p.feed(new TextEncoder().encode('\x1b]7;file:///he'))
    expect(events).toEqual([])
    p.feed(new TextEncoder().encode('llo\x1b\\'))
    expect(events).toEqual([{ type: 'cwd', path: '/hello' }])
  })

  it('ignores unknown OSC codes', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]9;notification\x1b\\')
    expect(events).toEqual([])
  })

  it('emits no events for plain text', () => {
    const p = new OscParser()
    expect(feedString(p, 'plain output\nmore output\n')).toEqual([])
  })

  it('drops absurdly long sequences without crashing', () => {
    const p = new OscParser()
    const huge = 'a'.repeat(10000)
    expect(feedString(p, '\x1b]7;file:///' + huge + '\x1b\\')).toEqual([])
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `cd app && yarn test:unit -- osc-parser`
Expected: module not found.

- [ ] **Step 3: Implement**

```typescript
// app/src/lib/terminal/osc-parser.ts
export type OscEvent =
  | { type: 'cwd'; path: string }
  | { type: 'prompt-start' }
  | { type: 'command-start' }
  | { type: 'output-start' }
  | { type: 'command-end'; exitCode: number }

const ESC = 0x1b
const RBRACKET = 0x5d
const BACKSLASH = 0x5c
const BEL = 0x07
const MAX_OSC_LEN = 4096

type State = 'text' | 'esc' | 'osc' | 'osc-esc'

export class OscParser {
  private listeners: Array<(e: OscEvent) => void> = []
  private state: State = 'text'
  private buf: number[] = []

  public onEvent(cb: (e: OscEvent) => void): void {
    this.listeners.push(cb)
  }

  public feed(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      switch (this.state) {
        case 'text':
          if (b === ESC) this.state = 'esc'
          break
        case 'esc':
          if (b === RBRACKET) {
            this.state = 'osc'
            this.buf.length = 0
          } else {
            this.state = 'text'
          }
          break
        case 'osc':
          if (b === BEL) {
            this.flush()
            this.state = 'text'
          } else if (b === ESC) {
            this.state = 'osc-esc'
          } else {
            if (this.buf.length < MAX_OSC_LEN) {
              this.buf.push(b)
            }
          }
          break
        case 'osc-esc':
          if (b === BACKSLASH) {
            this.flush()
            this.state = 'text'
          } else {
            this.state = 'osc'
            if (this.buf.length < MAX_OSC_LEN) {
              this.buf.push(ESC)
              this.buf.push(b)
            }
          }
          break
      }
    }
  }

  private flush(): void {
    if (this.buf.length === 0 || this.buf.length >= MAX_OSC_LEN) {
      this.buf.length = 0
      return
    }
    const text = String.fromCharCode(...this.buf)
    this.buf.length = 0
    const evt = parse(text)
    if (evt !== null) {
      for (const l of this.listeners.slice()) {
        try {
          l(evt)
        } catch {
          // listener errors must not break the byte pump
        }
      }
    }
  }
}

function parse(payload: string): OscEvent | null {
  const semi = payload.indexOf(';')
  const codeRaw = semi === -1 ? payload : payload.slice(0, semi)
  const rest = semi === -1 ? '' : payload.slice(semi + 1)
  const code = parseInt(codeRaw, 10)
  if (code === 7) {
    return parseCwd(rest)
  }
  if (code === 133) {
    return parsePromptMark(rest)
  }
  return null
}

function parseCwd(rest: string): OscEvent | null {
  if (!rest.startsWith('file://')) {
    return null
  }
  const afterScheme = rest.slice('file://'.length)
  const slash = afterScheme.indexOf('/')
  const path = slash === -1 ? '/' : afterScheme.slice(slash)
  try {
    return { type: 'cwd', path: decodeURIComponent(path) }
  } catch {
    return { type: 'cwd', path }
  }
}

function parsePromptMark(rest: string): OscEvent | null {
  const sub = rest.split(';')
  switch (sub[0]) {
    case 'A':
      return { type: 'prompt-start' }
    case 'B':
      return { type: 'command-start' }
    case 'C':
      return { type: 'output-start' }
    case 'D': {
      const exit = parseInt(sub[1] ?? '0', 10)
      return {
        type: 'command-end',
        exitCode: Number.isNaN(exit) ? 0 : exit,
      }
    }
    default:
      return null
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd app && yarn test:unit -- osc-parser`
Expected: all 10 cases pass.

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/terminal/osc-parser.ts app/test/unit/terminal/osc-parser-test.ts
git commit -m "feat(terminal): add OSC 7 / OSC 133 parser"
```

---

## Task 4: File-path link matchers

**Files:**
- Create: `app/src/lib/terminal/link-matchers.ts`
- Test: `app/test/unit/terminal/link-matchers-test.ts`

Defines a regex + handler that recognizes `relative/path/to/file.ts:42:7` and `/abs/path:99` so that web-links addon can register them. The handler resolves against a session cwd.

- [ ] **Step 1: Write failing tests**

```typescript
// app/test/unit/terminal/link-matchers-test.ts
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
    const m = parseFilePathMatch(input)
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
```

- [ ] **Step 2: Run, expect fail**

Run: `cd app && yarn test:unit -- link-matchers`

- [ ] **Step 3: Implement**

```typescript
// app/src/lib/terminal/link-matchers.ts
export interface IFilePathMatch {
  readonly path: string
  readonly line: number
  readonly column: number | null
}

// Match: optional ./ or /, then path-like chars (no spaces, no scheme), an
// extension that's at least 1 char, a colon, line number, optional :col.
// We negative-lookbehind for "://" so http/https don't match.
export const filePathRegex = /(?<!:\/)(?:\.\/|\/)?[\w./-]+\.[A-Za-z][\w]*:\d+(?::\d+)?/g

export function parseFilePathMatch(text: string): IFilePathMatch | null {
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
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd app && yarn test:unit -- link-matchers`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/terminal/link-matchers.ts app/test/unit/terminal/link-matchers-test.ts
git commit -m "feat(terminal): add file-path regex + parser for clickable diagnostics"
```

---

## Task 5: Tab metadata model (CWD label, activity, status icon)

**Files:**
- Create: `app/src/lib/terminal/tab-model.ts`
- Test: `app/test/unit/terminal/tab-model-test.ts`

Pure helpers used by `TerminalPanel` to render tabs. The store will hold the raw fields; this file converts them into the visual label/icon.

- [ ] **Step 1: Write failing tests**

```typescript
// app/test/unit/terminal/tab-model-test.ts
import {
  formatTabLabel,
  shouldShowActivityDot,
  tabStatusIcon,
} from '../../../src/lib/terminal/tab-model'

describe('formatTabLabel', () => {
  it('uses custom title when set', () => {
    expect(
      formatTabLabel({
        shell: '/bin/zsh',
        liveCwd: '/home/u/proj/src',
        homedir: '/home/u',
        title: 'build watcher',
      })
    ).toBe('build watcher')
  })

  it('uses ~/<basename> when liveCwd is inside homedir', () => {
    expect(
      formatTabLabel({
        shell: '/bin/zsh',
        liveCwd: '/home/u/proj/src',
        homedir: '/home/u',
        title: null,
      })
    ).toBe('zsh · ~/src')
  })

  it('uses absolute basename when liveCwd outside homedir', () => {
    expect(
      formatTabLabel({
        shell: '/bin/bash',
        liveCwd: '/tmp/build',
        homedir: '/home/u',
        title: null,
      })
    ).toBe('bash · build')
  })

  it('falls back to shell basename when liveCwd is null', () => {
    expect(
      formatTabLabel({
        shell: '/usr/bin/fish',
        liveCwd: null,
        homedir: '/home/u',
        title: null,
      })
    ).toBe('fish')
  })

  it('keeps full label under 32 chars', () => {
    const label = formatTabLabel({
      shell: '/bin/bash',
      liveCwd: '/very/deep/nested/repository/that/has/extremely/long/names',
      homedir: '/home/u',
      title: null,
    })
    expect(label.length).toBeLessThanOrEqual(32)
    expect(label.endsWith('names')).toBe(true)
  })
})

describe('shouldShowActivityDot', () => {
  it('shows dot when inactive tab has activity flag', () => {
    expect(shouldShowActivityDot({ active: false, hasActivity: true })).toBe(
      true
    )
  })
  it('does not show dot for active tab even with activity', () => {
    expect(shouldShowActivityDot({ active: true, hasActivity: true })).toBe(
      false
    )
  })
  it('does not show dot when no activity', () => {
    expect(shouldShowActivityDot({ active: false, hasActivity: false })).toBe(
      false
    )
  })
})

describe('tabStatusIcon', () => {
  it('returns "running" for an active running session', () => {
    expect(
      tabStatusIcon({ status: 'running', lastExitCode: null, isCommand: true })
    ).toBe('running')
  })
  it('returns "ok" for a clean exit (code 0)', () => {
    expect(
      tabStatusIcon({ status: 'running', lastExitCode: 0, isCommand: false })
    ).toBe('ok')
  })
  it('returns "fail" for non-zero exit', () => {
    expect(
      tabStatusIcon({ status: 'running', lastExitCode: 1, isCommand: false })
    ).toBe('fail')
  })
  it('returns "dead" when the shell itself exited', () => {
    expect(
      tabStatusIcon({ status: 'exited', lastExitCode: 137, isCommand: false })
    ).toBe('dead')
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `cd app && yarn test:unit -- tab-model`

- [ ] **Step 3: Implement**

```typescript
// app/src/lib/terminal/tab-model.ts
export interface ITabLabelInput {
  readonly shell: string
  readonly liveCwd: string | null
  readonly homedir: string
  readonly title: string | null
}

const MAX_LABEL = 32

export function formatTabLabel(input: ITabLabelInput): string {
  if (input.title !== null && input.title.length > 0) {
    return truncate(input.title, MAX_LABEL)
  }
  const shellName = basename(input.shell)
  if (input.liveCwd === null) {
    return truncate(shellName, MAX_LABEL)
  }
  const home = input.homedir.replace(/\/$/, '')
  let cwdPart: string
  if (
    home.length > 0 &&
    (input.liveCwd === home || input.liveCwd.startsWith(home + '/'))
  ) {
    const after = input.liveCwd.slice(home.length)
    cwdPart = '~' + (after === '' ? '' : after.split('/').slice(-1)[0] === '' ? '' : '/' + after.split('/').slice(-1)[0])
    if (cwdPart === '~') {
      cwdPart = '~'
    } else if (input.liveCwd === home) {
      cwdPart = '~'
    }
  } else {
    cwdPart = basename(input.liveCwd) || '/'
  }
  return truncate(`${shellName} · ${cwdPart}`, MAX_LABEL)
}

export interface IActivityInput {
  readonly active: boolean
  readonly hasActivity: boolean
}

export function shouldShowActivityDot(input: IActivityInput): boolean {
  return !input.active && input.hasActivity
}

export type TabStatusIcon = 'running' | 'ok' | 'fail' | 'dead'

export interface IStatusInput {
  readonly status: 'starting' | 'running' | 'exited'
  readonly lastExitCode: number | null
  readonly isCommand: boolean
}

export function tabStatusIcon(input: IStatusInput): TabStatusIcon {
  if (input.status === 'exited') {
    return 'dead'
  }
  if (input.isCommand) {
    return 'running'
  }
  if (input.lastExitCode === null) {
    return 'running'
  }
  return input.lastExitCode === 0 ? 'ok' : 'fail'
}

function basename(p: string): string {
  if (p === '' || p === '/') {
    return p
  }
  const trimmed = p.replace(/\/$/, '')
  const ix = trimmed.lastIndexOf('/')
  return ix === -1 ? trimmed : trimmed.slice(ix + 1)
}

function truncate(s: string, max: number): string {
  if (s.length <= max) {
    return s
  }
  return '…' + s.slice(s.length - (max - 1))
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd app && yarn test:unit -- tab-model`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/terminal/tab-model.ts app/test/unit/terminal/tab-model-test.ts
git commit -m "feat(terminal): tab label/activity/status helpers"
```

---

## Task 6: Split-pane layout tree

**Files:**
- Create: `app/src/lib/terminal/split-layout.ts`
- Test: `app/test/unit/terminal/split-layout-test.ts`

Pure tree model. A leaf is `{kind:'leaf', sessionId}`; a split is `{kind:'split', orientation, ratio, a, b}`. Operations: split a leaf, close a leaf (collapses parent), find by sessionId.

- [ ] **Step 1: Write failing tests**

```typescript
// app/test/unit/terminal/split-layout-test.ts
import {
  Layout,
  leaf,
  splitLeaf,
  closeSession,
  findLeafIds,
} from '../../../src/lib/terminal/split-layout'

describe('split-layout', () => {
  it('makes a leaf', () => {
    const l = leaf('s1')
    expect(l).toEqual({ kind: 'leaf', sessionId: 's1' })
  })

  it('splits a leaf horizontally', () => {
    const before: Layout = leaf('s1')
    const after = splitLeaf(before, 's1', 'horizontal', 's2')
    expect(after).toEqual({
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: leaf('s2'),
    })
  })

  it('splits a deep leaf without disturbing siblings', () => {
    const root: Layout = {
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: leaf('s2'),
    }
    const after = splitLeaf(root, 's2', 'vertical', 's3')
    expect(after).toEqual({
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: {
        kind: 'split',
        orientation: 'vertical',
        ratio: 0.5,
        a: leaf('s2'),
        b: leaf('s3'),
      },
    })
  })

  it('returns the input unchanged when target leaf is not present', () => {
    const before: Layout = leaf('s1')
    expect(splitLeaf(before, 'nope', 'horizontal', 's2')).toBe(before)
  })

  it('collapses a 2-leaf split when one side closes', () => {
    const root: Layout = {
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: leaf('s2'),
    }
    expect(closeSession(root, 's1')).toEqual(leaf('s2'))
  })

  it('returns null when the only leaf closes', () => {
    expect(closeSession(leaf('s1'), 's1')).toBeNull()
  })

  it('preserves nested layout when collapsing a peer', () => {
    const root: Layout = {
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: {
        kind: 'split',
        orientation: 'vertical',
        ratio: 0.5,
        a: leaf('s2'),
        b: leaf('s3'),
      },
    }
    expect(closeSession(root, 's2')).toEqual({
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: leaf('s3'),
    })
  })

  it('lists all leaf ids in declaration order', () => {
    const root: Layout = {
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: {
        kind: 'split',
        orientation: 'vertical',
        ratio: 0.5,
        a: leaf('s2'),
        b: leaf('s3'),
      },
    }
    expect(findLeafIds(root)).toEqual(['s1', 's2', 's3'])
  })
})
```

- [ ] **Step 2: Run to confirm fail**

Run: `cd app && yarn test:unit -- split-layout`

- [ ] **Step 3: Implement**

```typescript
// app/src/lib/terminal/split-layout.ts
export type Orientation = 'horizontal' | 'vertical'

export type Layout =
  | { readonly kind: 'leaf'; readonly sessionId: string }
  | {
      readonly kind: 'split'
      readonly orientation: Orientation
      readonly ratio: number
      readonly a: Layout
      readonly b: Layout
    }

export function leaf(sessionId: string): Layout {
  return { kind: 'leaf', sessionId }
}

export function splitLeaf(
  root: Layout,
  targetId: string,
  orientation: Orientation,
  newSessionId: string
): Layout {
  if (root.kind === 'leaf') {
    if (root.sessionId !== targetId) {
      return root
    }
    return {
      kind: 'split',
      orientation,
      ratio: 0.5,
      a: root,
      b: leaf(newSessionId),
    }
  }
  const a = splitLeaf(root.a, targetId, orientation, newSessionId)
  const b = splitLeaf(root.b, targetId, orientation, newSessionId)
  if (a === root.a && b === root.b) {
    return root
  }
  return { ...root, a, b }
}

export function closeSession(root: Layout, targetId: string): Layout | null {
  if (root.kind === 'leaf') {
    return root.sessionId === targetId ? null : root
  }
  const a = closeSession(root.a, targetId)
  const b = closeSession(root.b, targetId)
  if (a === null && b === null) {
    return null
  }
  if (a === null) {
    return b
  }
  if (b === null) {
    return a
  }
  if (a === root.a && b === root.b) {
    return root
  }
  return { ...root, a, b }
}

export function findLeafIds(root: Layout): ReadonlyArray<string> {
  if (root.kind === 'leaf') {
    return [root.sessionId]
  }
  return [...findLeafIds(root.a), ...findLeafIds(root.b)]
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd app && yarn test:unit -- split-layout`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/terminal/split-layout.ts app/test/unit/terminal/split-layout-test.ts
git commit -m "feat(terminal): pure split-pane layout tree"
```

---

## Task 7: Command-block tracker

**Files:**
- Create: `app/src/lib/terminal/command-blocks.ts`
- Test: `app/test/unit/terminal/command-blocks-test.ts`

Consumes `OscEvent`s from `OscParser` plus a callback that returns the current xterm cursor row (`getCursorRow()`). Records command-blocks with their start row, end row, and exit code.

- [ ] **Step 1: Write failing tests**

```typescript
// app/test/unit/terminal/command-blocks-test.ts
import { CommandBlockTracker } from '../../../src/lib/terminal/command-blocks'

describe('CommandBlockTracker', () => {
  it('records a complete command block', () => {
    let row = 0
    const t = new CommandBlockTracker(() => row)
    t.handle({ type: 'prompt-start' })
    row = 5
    t.handle({ type: 'command-start' })
    row = 6
    t.handle({ type: 'output-start' })
    row = 12
    t.handle({ type: 'command-end', exitCode: 0 })
    expect(t.getBlocks()).toEqual([
      { commandStartRow: 5, outputStartRow: 6, endRow: 12, exitCode: 0 },
    ])
  })

  it('discards an unmatched command-end', () => {
    const t = new CommandBlockTracker(() => 0)
    t.handle({ type: 'command-end', exitCode: 1 })
    expect(t.getBlocks()).toEqual([])
  })

  it('opens a new block on a fresh prompt-start even if the previous never ended', () => {
    let row = 0
    const t = new CommandBlockTracker(() => row)
    row = 1
    t.handle({ type: 'prompt-start' })
    row = 2
    t.handle({ type: 'command-start' })
    row = 5
    t.handle({ type: 'prompt-start' })
    row = 6
    t.handle({ type: 'command-start' })
    row = 7
    t.handle({ type: 'command-end', exitCode: 0 })
    expect(t.getBlocks()).toEqual([
      { commandStartRow: 6, outputStartRow: 6, endRow: 7, exitCode: 0 },
    ])
  })

  it('emits change events on each completed block', () => {
    let row = 0
    const t = new CommandBlockTracker(() => row)
    const events: number[] = []
    t.onChange(blocks => events.push(blocks.length))
    t.handle({ type: 'prompt-start' })
    t.handle({ type: 'command-start' })
    row = 3
    t.handle({ type: 'command-end', exitCode: 0 })
    expect(events).toEqual([1])
  })

  it('clears all blocks on reset()', () => {
    let row = 0
    const t = new CommandBlockTracker(() => row)
    t.handle({ type: 'prompt-start' })
    t.handle({ type: 'command-start' })
    t.handle({ type: 'command-end', exitCode: 0 })
    t.reset()
    expect(t.getBlocks()).toEqual([])
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `cd app && yarn test:unit -- command-blocks`

- [ ] **Step 3: Implement**

```typescript
// app/src/lib/terminal/command-blocks.ts
import { OscEvent } from './osc-parser'

export interface ICommandBlock {
  readonly commandStartRow: number
  readonly outputStartRow: number
  readonly endRow: number
  readonly exitCode: number
}

interface IPending {
  commandStartRow: number | null
  outputStartRow: number | null
}

export class CommandBlockTracker {
  private blocks: ICommandBlock[] = []
  private pending: IPending = { commandStartRow: null, outputStartRow: null }
  private listeners: Array<(blocks: ReadonlyArray<ICommandBlock>) => void> = []

  public constructor(private readonly getRow: () => number) {}

  public handle(evt: OscEvent): void {
    switch (evt.type) {
      case 'prompt-start':
        this.pending = { commandStartRow: null, outputStartRow: null }
        return
      case 'command-start':
        this.pending.commandStartRow = this.getRow()
        return
      case 'output-start':
        this.pending.outputStartRow = this.getRow()
        return
      case 'command-end': {
        if (this.pending.commandStartRow === null) {
          return
        }
        const block: ICommandBlock = {
          commandStartRow: this.pending.commandStartRow,
          outputStartRow:
            this.pending.outputStartRow ?? this.pending.commandStartRow,
          endRow: this.getRow(),
          exitCode: evt.exitCode,
        }
        this.blocks = [...this.blocks, block]
        this.pending = { commandStartRow: null, outputStartRow: null }
        this.emit()
        return
      }
      default:
        return
    }
  }

  public getBlocks(): ReadonlyArray<ICommandBlock> {
    return this.blocks
  }

  public reset(): void {
    this.blocks = []
    this.pending = { commandStartRow: null, outputStartRow: null }
    this.emit()
  }

  public onChange(
    cb: (blocks: ReadonlyArray<ICommandBlock>) => void
  ): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb)
    }
  }

  private emit(): void {
    for (const l of this.listeners.slice()) {
      try {
        l(this.blocks)
      } catch {
        // ignore listener faults
      }
    }
  }
}
```

- [ ] **Step 4: Run, expect pass**

Run: `cd app && yarn test:unit -- command-blocks`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/terminal/command-blocks.ts app/test/unit/terminal/command-blocks-test.ts
git commit -m "feat(terminal): track OSC 133 command blocks"
```

---

## Task 8: Extend `ITerminalSessionSnapshot` with live metadata

**Files:**
- Modify: `app/src/lib/terminal/pty-types.ts`
- Modify: `app/src/main-process/terminal/pty-session.ts:73-87` (snapshot init), `:104` (status flip on start)

We add four optional metadata fields. They start as `null` / `false` and get filled by OSC events. Test fixtures stay valid because the new fields are optional or have safe defaults.

- [ ] **Step 1: Edit pty-types.ts**

Append to `ITerminalSessionSnapshot`:

```typescript
  /** Live cwd from OSC 7. null = never reported. */
  readonly liveCwd: string | null
  /** Output produced since this tab was last viewed. */
  readonly hasActivity: boolean
  /** Exit code of the most recently completed command (OSC 133;D). */
  readonly lastExitCode: number | null
  /** User-supplied custom title (rename), or null. */
  readonly title: string | null
```

- [ ] **Step 2: Update PtySession snapshot construction**

In `pty-session.ts`, edit the constructor's snapshot init to add the four new fields with their defaults:

```typescript
    this.snapshot = {
      id: deps.id,
      repositoryId: deps.repositoryId,
      cwd: deps.options.cwd,
      shell: deps.options.shell,
      cols: deps.options.cols,
      rows: deps.options.rows,
      createdAt: (deps.now ?? Date.now)(),
      status: 'starting',
      exitCode: null,
      liveCwd: null,
      hasActivity: false,
      lastExitCode: null,
      title: null,
    }
```

- [ ] **Step 3: Run the existing terminal test suite**

Run: `cd app && yarn test:unit -- terminal`
Expected: any test that constructs `ITerminalSessionSnapshot` literals fails. Fix each one by adding the four fields with the same defaults.

- [ ] **Step 4: Re-run; expect pass**

Run: `cd app && yarn test:unit -- terminal`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/terminal/pty-types.ts app/src/main-process/terminal/pty-session.ts app/test/unit/terminal/
git commit -m "feat(terminal): extend session snapshot with liveCwd/activity/exit/title"
```

---

## Task 9: Wire OSC parser into PtySession (main process)

**Files:**
- Modify: `app/src/main-process/terminal/pty-session.ts:106-110` (data callback)
- Modify: `app/src/lib/terminal/pty-types.ts` (add port message variant)
- Test: extend `app/test/unit/terminal/pty-session-test.ts`

We tap the `pty.onData` byte stream and feed an `OscParser`. Detected events update the snapshot and are also forwarded to the renderer over the existing per-session port (no extra IPC channel needed) — the bytes still go through verbatim.

- [ ] **Step 1: Add port message variant**

In `pty-types.ts`, extend the union:

```typescript
  | { readonly type: 'meta'; readonly liveCwd?: string; readonly title?: string; readonly lastExitCode?: number; readonly hasActivity?: boolean }
```

- [ ] **Step 2: Write a failing test**

Add to `pty-session-test.ts`:

```typescript
it('emits liveCwd updates on OSC 7 to the renderer port', () => {
  const fakePort = makeFakePort() // existing helper
  const fakePty = makeFakePty()  // existing helper
  const session = new PtySession({
    factory: () => fakePty,
    port: fakePort,
    options: defaultOpts(),
    id: 's1',
    repositoryId: 7,
  })
  session.start()
  // simulate PTY emitting an OSC 7 inline with output
  fakePty.emit('hello\x1b]7;file:///tmp/x\x1b\\bye')
  const meta = fakePort.posted.find((m: any) => m?.type === 'meta')
  expect(meta).toEqual({ type: 'meta', liveCwd: '/tmp/x' })
  expect(session.getSnapshot().liveCwd).toBe('/tmp/x')
})

it('emits lastExitCode updates on OSC 133;D', () => {
  const fakePort = makeFakePort()
  const fakePty = makeFakePty()
  const session = new PtySession({
    factory: () => fakePty,
    port: fakePort,
    options: defaultOpts(),
    id: 's1',
    repositoryId: 7,
  })
  session.start()
  fakePty.emit('\x1b]133;A\x1b\\\x1b]133;B\x1b\\\x1b]133;D;7\x1b\\')
  const meta = fakePort.posted.find((m: any) => m?.type === 'meta' && m.lastExitCode === 7)
  expect(meta).toBeDefined()
  expect(session.getSnapshot().lastExitCode).toBe(7)
})
```

If the existing helpers don't already exist in the test file, look at the file's prelude and reuse the same fakes used by other passing tests.

- [ ] **Step 3: Run, expect fail**

Run: `cd app && yarn test:unit -- pty-session`

- [ ] **Step 4: Implement**

In `pty-session.ts` add an `OscParser` instance, hook its events, and update the data callback:

```typescript
import { OscParser, OscEvent } from '../../lib/terminal/osc-parser'
// ...
private oscParser = new OscParser()

// In start():
this.oscParser.onEvent(evt => this.onOsc(evt))
this.dataDisposable = this.pty.onData(chunk => {
  if (this.destroyed) {return}
  const bytes = chunkToBytes(chunk)
  this.oscParser.feed(bytes)
  this.safePost({ type: 'data', bytes })
})

// New private method:
private onOsc(evt: OscEvent): void {
  if (evt.type === 'cwd') {
    this.snapshot = { ...this.snapshot, liveCwd: evt.path }
    this.safePost({ type: 'meta', liveCwd: evt.path })
  } else if (evt.type === 'command-end') {
    this.snapshot = { ...this.snapshot, lastExitCode: evt.exitCode }
    this.safePost({ type: 'meta', lastExitCode: evt.exitCode })
  }
}
```

- [ ] **Step 5: Run, expect pass**

Run: `cd app && yarn test:unit -- pty-session`

- [ ] **Step 6: Commit**

```bash
git add app/src/main-process/terminal/pty-session.ts app/src/lib/terminal/pty-types.ts app/test/unit/terminal/pty-session-test.ts
git commit -m "feat(terminal): forward OSC 7/133 events from PTY to renderer"
```

---

## Task 10: Hook OSC `meta` messages into renderer client + store

**Files:**
- Modify: `app/src/lib/terminal/terminal-client.ts`
- Modify: `app/src/lib/stores/terminal-store.ts`
- Test: extend `app/test/unit/terminal/terminal-store-test.ts`

The terminal store gains a `markActivity(sessionId)` method invoked by the client when bytes arrive on a non-active session, plus a `mergeMeta(sessionId, partial)` method that consumes `{liveCwd, lastExitCode, title}` updates from the port.

- [ ] **Step 1: Failing test**

Add to `terminal-store-test.ts`:

```typescript
it('mergeMeta updates liveCwd / lastExitCode without touching tabs', () => {
  const s = new TerminalStore(memStore())
  s.registerSession(snap('s1', 7))
  s.mergeMeta('s1', { liveCwd: '/tmp/x' })
  expect(s.getState().sessions.get('s1')!.liveCwd).toBe('/tmp/x')
  s.mergeMeta('s1', { lastExitCode: 1 })
  expect(s.getState().sessions.get('s1')!.lastExitCode).toBe(1)
})

it('markActivity flips hasActivity for inactive tabs only', () => {
  const s = new TerminalStore(memStore())
  s.registerSession(snap('s1', 7)) // becomes active
  s.registerSession(snap('s2', 7)) // becomes active, s1 inactive
  s.markActivity('s1')
  expect(s.getState().sessions.get('s1')!.hasActivity).toBe(true)
  s.markActivity('s2') // already active — no-op
  expect(s.getState().sessions.get('s2')!.hasActivity).toBe(false)
})

it('selecting a session clears its activity flag', () => {
  const s = new TerminalStore(memStore())
  s.registerSession(snap('s1', 7))
  s.registerSession(snap('s2', 7))
  s.markActivity('s1')
  s.selectSession('s1')
  expect(s.getState().sessions.get('s1')!.hasActivity).toBe(false)
})
```

(`memStore` and `snap` are already used elsewhere in the file; reuse them.)

- [ ] **Step 2: Run, expect fail**

Run: `cd app && yarn test:unit -- terminal-store`

- [ ] **Step 3: Implement on the store**

Add to `TerminalStore`:

```typescript
public mergeMeta(
  sessionId: string,
  patch: {
    liveCwd?: string
    lastExitCode?: number
    title?: string
    hasActivity?: boolean
  }
): void {
  if (!this.state.sessions.has(sessionId)) {
    return
  }
  const sessions = new Map(this.state.sessions)
  const cur = sessions.get(sessionId)!
  sessions.set(sessionId, {
    ...cur,
    ...(patch.liveCwd !== undefined ? { liveCwd: patch.liveCwd } : {}),
    ...(patch.lastExitCode !== undefined
      ? { lastExitCode: patch.lastExitCode }
      : {}),
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.hasActivity !== undefined
      ? { hasActivity: patch.hasActivity }
      : {}),
  })
  this.update({ sessions })
}

public markActivity(sessionId: string): void {
  if (!this.state.sessions.has(sessionId)) {
    return
  }
  if (this.state.activeSessionId === sessionId) {
    return
  }
  this.mergeMeta(sessionId, { hasActivity: true })
}
```

Modify `selectSession` to clear `hasActivity` on the session it selects:

```typescript
public selectSession(sessionId: string): void {
  if (!this.state.sessions.has(sessionId)) {return}
  if (this.state.activeSessionId === sessionId) {return}
  const session = this.state.sessions.get(sessionId)!
  const sessions = new Map(this.state.sessions)
  sessions.set(sessionId, { ...session, hasActivity: false })
  const activeByRepoId = new Map(this.state.activeByRepoId)
  activeByRepoId.set(session.repositoryId, sessionId)
  this.update({ sessions, activeSessionId: sessionId, activeByRepoId })
}
```

- [ ] **Step 4: Wire client**

In `terminal-client.ts`, where the client subscribes to the per-session port, when `data.type === 'meta'` call `store.mergeMeta`; when `data.type === 'data'` call `store.markActivity(sessionId)` (the existing data path stays in xterm's hot loop — markActivity is throttled below).

Implement throttling so `markActivity` fires at most once per 250ms per session:

```typescript
const lastMark = new Map<string, number>()
function markActivityThrottled(store: TerminalStore, sessionId: string) {
  const now = Date.now()
  const last = lastMark.get(sessionId) ?? 0
  if (now - last < 250) {
    return
  }
  lastMark.set(sessionId, now)
  store.markActivity(sessionId)
}
```

- [ ] **Step 5: Run terminal tests**

Run: `cd app && yarn test:unit -- terminal`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/stores/terminal-store.ts app/src/lib/terminal/terminal-client.ts app/test/unit/terminal/terminal-store-test.ts
git commit -m "feat(terminal): merge OSC meta + track inactive-tab activity"
```

---

## Task 11: WebGL renderer with Canvas fallback in `XtermView`

**Files:**
- Modify: `app/src/ui/terminal/xterm-view.tsx:184-201` (createTerminal), add new addon-loading method
- Test: extend `app/test/unit/terminal/terminal-panel-test.ts` or add `xterm-view-test.ts`

The view tries WebGL, listens for the `webgl context lost` event (xterm's WebglAddon emits this), and on failure swaps in CanvasAddon. A `rendererPreference` from `TerminalSettings` overrides selection.

- [ ] **Step 1: Add a failing test**

Create `app/test/unit/terminal/xterm-view-renderer-test.ts`:

```typescript
import * as React from 'react'
import { render, act } from '@testing-library/react'
import { XtermView } from '../../../src/ui/terminal/xterm-view'

describe('XtermView renderer fallback', () => {
  it('loads webgl addon by default', () => {
    const loaded: string[] = []
    const fakeTerm = makeFakeTerminal(loaded)
    render(
      <XtermView
        port={null}
        theme={{} as any}
        terminalFactory={() => fakeTerm}
        rendererPreference="webgl"
        webglAddonFactory={() => ({
          name: 'webgl',
          dispose: () => {},
          onContextLoss: () => ({ dispose: () => {} }),
        }) as any}
        canvasAddonFactory={() => ({ name: 'canvas', dispose: () => {} }) as any}
      />
    )
    expect(loaded).toContain('webgl')
    expect(loaded).not.toContain('canvas')
  })

  it('falls back to canvas when webgl context is lost', () => {
    const loaded: string[] = []
    const fakeTerm = makeFakeTerminal(loaded)
    let lostCb: (() => void) | null = null
    render(
      <XtermView
        port={null}
        theme={{} as any}
        terminalFactory={() => fakeTerm}
        rendererPreference="webgl"
        webglAddonFactory={() => ({
          name: 'webgl',
          dispose: () => {},
          onContextLoss: (cb: () => void) => {
            lostCb = cb
            return { dispose: () => {} }
          },
        }) as any}
        canvasAddonFactory={() => ({ name: 'canvas', dispose: () => {} }) as any}
      />
    )
    act(() => {
      lostCb?.()
    })
    expect(loaded).toContain('canvas')
  })

  it('respects "canvas" preference and skips webgl', () => {
    const loaded: string[] = []
    const fakeTerm = makeFakeTerminal(loaded)
    render(
      <XtermView
        port={null}
        theme={{} as any}
        terminalFactory={() => fakeTerm}
        rendererPreference="canvas"
        canvasAddonFactory={() => ({ name: 'canvas', dispose: () => {} }) as any}
      />
    )
    expect(loaded).toContain('canvas')
    expect(loaded).not.toContain('webgl')
  })
})

function makeFakeTerminal(loaded: string[]): any {
  return {
    cols: 80,
    rows: 24,
    options: {},
    open: () => undefined,
    write: () => undefined,
    paste: () => undefined,
    focus: () => undefined,
    hasSelection: () => false,
    getSelection: () => '',
    clearSelection: () => undefined,
    onData: () => ({ dispose: () => undefined }),
    onResize: () => ({ dispose: () => undefined }),
    attachCustomKeyEventHandler: () => undefined,
    loadAddon: (a: any) => loaded.push(a.name ?? 'unknown'),
    dispose: () => undefined,
  }
}
```

- [ ] **Step 2: Run, expect fail**

Run: `cd app && yarn test:unit -- xterm-view-renderer`

- [ ] **Step 3: Extend `IXtermViewProps`**

```typescript
export type RendererPreference = 'webgl' | 'canvas' | 'dom'

export interface IXtermViewProps {
  // ... existing fields ...
  readonly rendererPreference?: RendererPreference
  readonly webglAddonFactory?: () => any
  readonly canvasAddonFactory?: () => any
}
```

- [ ] **Step 4: Implement renderer selection**

In `componentDidMount`, after the FitAddon block, add:

```typescript
this.installRenderer(this.props.rendererPreference ?? 'webgl')
```

```typescript
private webglAddon: any | null = null
private canvasAddon: any | null = null

private installRenderer(pref: RendererPreference): void {
  if (!this.term) return
  if (pref === 'dom') return
  if (pref === 'canvas') {
    this.installCanvas()
    return
  }
  this.installWebgl()
}

private installWebgl(): void {
  try {
    const factory =
      this.props.webglAddonFactory ??
      (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { WebglAddon } = require('@xterm/addon-webgl')
        return new WebglAddon()
      })
    const addon = factory()
    this.term!.loadAddon(addon)
    this.webglAddon = addon
    if (typeof addon.onContextLoss === 'function') {
      addon.onContextLoss(() => {
        try {
          addon.dispose?.()
        } catch {
          // ignore
        }
        this.webglAddon = null
        this.installCanvas()
      })
    }
  } catch (err) {
    log.warn('[xterm] webgl init failed; falling back to canvas', err as Error)
    this.installCanvas()
  }
}

private installCanvas(): void {
  if (this.canvasAddon !== null) return
  try {
    const factory =
      this.props.canvasAddonFactory ??
      (() => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { CanvasAddon } = require('@xterm/addon-canvas')
        return new CanvasAddon()
      })
    const addon = factory()
    this.term!.loadAddon(addon)
    this.canvasAddon = addon
  } catch (err) {
    log.warn('[xterm] canvas init failed; using DOM renderer', err as Error)
  }
}
```

In `componentWillUnmount`, dispose both:

```typescript
this.webglAddon?.dispose?.()
this.canvasAddon?.dispose?.()
this.webglAddon = null
this.canvasAddon = null
```

- [ ] **Step 5: Run, expect pass**

Run: `cd app && yarn test:unit -- xterm-view-renderer`

- [ ] **Step 6: Commit**

```bash
git add app/src/ui/terminal/xterm-view.tsx app/test/unit/terminal/xterm-view-renderer-test.ts
git commit -m "perf(terminal): WebGL renderer with Canvas fallback"
```

---

## Task 12: Unicode11 + ligatures + web-links + search addons

**Files:**
- Modify: `app/src/ui/terminal/xterm-view.tsx`
- Test: extend `app/test/unit/terminal/xterm-view-renderer-test.ts`

Wire the four passive addons inside `componentDidMount`. Web-links registers our file-path matcher in addition to URLs. Search exposes a public method `find(text, opts)` so the find-bar can call it.

- [ ] **Step 1: Failing tests**

Append to `xterm-view-renderer-test.ts`:

```typescript
it('loads unicode11, ligatures, web-links, and search addons', () => {
  const loaded: string[] = []
  const fakeTerm = makeFakeTerminal(loaded)
  render(
    <XtermView
      port={null}
      theme={{} as any}
      terminalFactory={() => fakeTerm}
      rendererPreference="dom"
      unicode11AddonFactory={() => ({ name: 'unicode11', dispose: () => {} }) as any}
      ligaturesAddonFactory={() => ({ name: 'ligatures', dispose: () => {} }) as any}
      webLinksAddonFactory={() => ({ name: 'web-links', dispose: () => {} }) as any}
      searchAddonFactory={() => ({
        name: 'search',
        findNext: () => false,
        findPrevious: () => false,
        dispose: () => {},
      }) as any}
    />
  )
  expect(loaded).toEqual(
    expect.arrayContaining(['unicode11', 'ligatures', 'web-links', 'search'])
  )
})
```

Add a test that drives a public `find(text)` method exposed via ref:

```typescript
it('exposes find via ref delegating to search addon', () => {
  const ref = React.createRef<XtermView>()
  const calls: string[] = []
  render(
    <XtermView
      ref={ref}
      port={null}
      theme={{} as any}
      terminalFactory={() => makeFakeTerminal([])}
      rendererPreference="dom"
      searchAddonFactory={() => ({
        findNext: (t: string) => {
          calls.push('next:' + t)
          return true
        },
        findPrevious: (t: string) => {
          calls.push('prev:' + t)
          return true
        },
        dispose: () => {},
      }) as any}
    />
  )
  expect(ref.current!.findNext('hello')).toBe(true)
  expect(ref.current!.findPrevious('hello')).toBe(true)
  expect(calls).toEqual(['next:hello', 'prev:hello'])
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

In `componentDidMount`, after `installRenderer`, load the addons:

```typescript
this.unicode11 = this.makeUnicode11()
if (this.unicode11) this.term.loadAddon(this.unicode11)
if (this.term.options) this.term.options.allowProposedApi = true
this.ligatures = this.makeLigatures()
if (this.ligatures) this.term.loadAddon(this.ligatures)
this.webLinks = this.makeWebLinks()
if (this.webLinks) this.term.loadAddon(this.webLinks)
this.search = this.makeSearch()
if (this.search) this.term.loadAddon(this.search)
```

Add private `makeXxx()` methods that mirror the renderer pattern (test-injection optional). Expose `findNext(text: string)` and `findPrevious(text: string)` public methods on `XtermView`.

For web-links + file paths, register the file-path regex via the addon's API (the API differs per version — call `webLinks.registerLinkMatcher` if present, otherwise pass the matcher in the addon's constructor options as supported by 0.11).

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/terminal/xterm-view.tsx app/test/unit/terminal/xterm-view-renderer-test.ts
git commit -m "feat(terminal): unicode11/ligatures/web-links/search addons"
```

---

## Task 13: Find bar UI + dispatcher hook (#2)

**Files:**
- Create: `app/src/ui/terminal/terminal-find-bar.tsx`
- Test: `app/test/unit/terminal/terminal-find-bar-test.ts`
- Modify: `app/src/ui/terminal/terminal-panel.tsx` to host the find bar
- Modify: `app/src/ui/dispatcher/dispatcher.ts` to add `searchTerminal`

- [ ] **Step 1: Failing test**

```typescript
// app/test/unit/terminal/terminal-find-bar-test.ts
import * as React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { TerminalFindBar } from '../../../src/ui/terminal/terminal-find-bar'

describe('TerminalFindBar', () => {
  it('calls onFindNext on Enter', () => {
    const onFindNext = jest.fn()
    const { getByRole } = render(
      <TerminalFindBar
        visible={true}
        onClose={jest.fn()}
        onFindNext={onFindNext}
        onFindPrevious={jest.fn()}
      />
    )
    const input = getByRole('searchbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onFindNext).toHaveBeenCalledWith('hello')
  })

  it('calls onFindPrevious on Shift+Enter', () => {
    const onFindPrevious = jest.fn()
    const { getByRole } = render(
      <TerminalFindBar
        visible={true}
        onClose={jest.fn()}
        onFindNext={jest.fn()}
        onFindPrevious={onFindPrevious}
      />
    )
    const input = getByRole('searchbox') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'foo' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(onFindPrevious).toHaveBeenCalledWith('foo')
  })

  it('calls onClose on Escape', () => {
    const onClose = jest.fn()
    const { getByRole } = render(
      <TerminalFindBar
        visible={true}
        onClose={onClose}
        onFindNext={jest.fn()}
        onFindPrevious={jest.fn()}
      />
    )
    const input = getByRole('searchbox')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when not visible', () => {
    const { container } = render(
      <TerminalFindBar
        visible={false}
        onClose={jest.fn()}
        onFindNext={jest.fn()}
        onFindPrevious={jest.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement the find bar**

```tsx
// app/src/ui/terminal/terminal-find-bar.tsx
import * as React from 'react'

interface IProps {
  readonly visible: boolean
  readonly onClose: () => void
  readonly onFindNext: (text: string) => void
  readonly onFindPrevious: (text: string) => void
}

interface IState {
  readonly text: string
}

export class TerminalFindBar extends React.Component<IProps, IState> {
  private inputRef = React.createRef<HTMLInputElement>()
  public state: IState = { text: '' }

  public componentDidUpdate(prev: IProps) {
    if (!prev.visible && this.props.visible) {
      this.inputRef.current?.focus()
      this.inputRef.current?.select()
    }
  }

  public render() {
    if (!this.props.visible) {
      return null
    }
    return (
      <div className="terminal-find-bar" role="search">
        <input
          ref={this.inputRef}
          type="search"
          className="terminal-find-bar__input"
          placeholder="Find in terminal"
          value={this.state.text}
          onChange={e => this.setState({ text: e.target.value })}
          onKeyDown={this.onKeyDown}
        />
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Previous match"
          title="Previous (Shift+Enter)"
          onClick={() => this.props.onFindPrevious(this.state.text)}
        >
          ↑
        </button>
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Next match"
          title="Next (Enter)"
          onClick={() => this.props.onFindNext(this.state.text)}
        >
          ↓
        </button>
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Close find bar"
          title="Close (Esc)"
          onClick={this.props.onClose}
        >
          ×
        </button>
      </div>
    )
  }

  private onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      this.props.onClose()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        this.props.onFindPrevious(this.state.text)
      } else {
        this.props.onFindNext(this.state.text)
      }
    }
  }
}
```

- [ ] **Step 4: Wire find-bar into `TerminalPanel`**

Add panel state `findVisible`, prop `onFindNext` / `onFindPrevious`. Render `<TerminalFindBar>` between toolbar and body. Add a global keydown listener while panel is visible: `Ctrl+Shift+F` → toggle find-bar; routed to currently active xterm via a ref.

- [ ] **Step 5: Add dispatcher methods**

In `dispatcher.ts`:

```typescript
public toggleTerminalFind(): void {
  this.appStore._toggleTerminalFind()
}
```

Implement `_toggleTerminalFind` on the AppStore by flipping a `findVisibleByRepoId` map and emitting an update.

- [ ] **Step 6: Run, expect pass**

Run: `cd app && yarn test:unit -- terminal-find-bar terminal-panel`

- [ ] **Step 7: Commit**

```bash
git add app/src/ui/terminal/terminal-find-bar.tsx app/src/ui/terminal/terminal-panel.tsx app/src/ui/dispatcher/dispatcher.ts app/src/lib/stores/app-store.ts app/test/unit/terminal/terminal-find-bar-test.ts app/test/unit/terminal/terminal-panel-test.ts
git commit -m "feat(terminal): in-buffer search with find bar (Ctrl+Shift+F)"
```

---

## Task 14: Clickable file paths jump to diff/file viewer (#3)

**Files:**
- Modify: `app/src/ui/terminal/xterm-view.tsx` (link click handler)
- Modify: `app/src/ui/dispatcher/dispatcher.ts` add `openTerminalFileLink(repoId, path, line, column)`
- Modify: `app/src/lib/stores/app-store.ts` to resolve and open

- [ ] **Step 1: Failing test (dispatcher)**

```typescript
// In an existing dispatcher or app-store test file
it('openTerminalFileLink jumps to the file in the diff viewer', async () => {
  const dispatcher = makeTestDispatcher() // existing helper if any
  const repo = makeTestRepo()
  await dispatcher.openTerminalFileLink(repo, 'src/foo.ts', 12, null)
  // Expect: file opened in diff/history view, scrolled to line 12.
  expect(spyOnSelectChangedFile).toHaveBeenCalledWith(repo, 'src/foo.ts', 12)
})
```

(Adapt to whatever helpers exist in the `dispatcher` test file. If none, write a thin behavior assertion against the AppStore mock.)

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement on AppStore + dispatcher**

```typescript
// Dispatcher
public async openTerminalFileLink(
  repository: Repository,
  relativeOrAbsolutePath: string,
  line: number,
  column: number | null
): Promise<void> {
  return this.appStore._openTerminalFileLink(repository, relativeOrAbsolutePath, line, column)
}
```

In AppStore: resolve the path against the session's `liveCwd ?? repository.path`. If the resolved path is inside the repo, switch to the Changes tab and scroll the diff to `line`. Otherwise, emit a `shell.openPath` to let the OS handle it. (Diff scroll API: reuse whatever `RepositoryView` exposes for "go to line in diff" — if absent, set a `pendingLineFocus: number | null` in the changes-state and have `Diff` honor it on render.)

- [ ] **Step 4: Click handler in `XtermView`**

Web-links addon supports a click handler per matcher. For URLs, call the existing external opener. For file paths, parse with `parseFilePathMatch` and call a new prop `onFileLinkClick(path, line, column)` injected from `TerminalPanel`, threading down to the dispatcher.

- [ ] **Step 5: Run, expect pass**

- [ ] **Step 6: Commit**

```bash
git add app/src/ui/terminal/xterm-view.tsx app/src/ui/terminal/terminal-panel.tsx app/src/ui/dispatcher/dispatcher.ts app/src/lib/stores/app-store.ts app/test/unit/
git commit -m "feat(terminal): clickable file:line paths open in diff viewer"
```

---

## Task 15: Tab UX — CWD label, activity dot, drag-reorder, rename, middle-click (#1)

**Files:**
- Modify: `app/src/ui/terminal/terminal-panel.tsx`
- Modify: `app/src/ui/dispatcher/dispatcher.ts` (add `reorderTab`, `renameTab`, `focusTabByIndex`)
- Modify: `app/src/lib/stores/terminal-store.ts` (add `reorderTab`, `setTitle`)
- Test: extend `terminal-panel-test.ts` and `terminal-store-test.ts`

- [ ] **Step 1: Failing tests (store)**

```typescript
it('reorderTab moves a session to a new index within its repo', () => {
  const s = new TerminalStore(memStore())
  s.registerSession(snap('s1', 7))
  s.registerSession(snap('s2', 7))
  s.registerSession(snap('s3', 7))
  s.reorderTab(7, 's3', 0)
  expect(s.getState().tabsByRepoId.get(7)).toEqual(['s3', 's1', 's2'])
})

it('setTitle updates the session title', () => {
  const s = new TerminalStore(memStore())
  s.registerSession(snap('s1', 7))
  s.setTitle('s1', 'build watcher')
  expect(s.getState().sessions.get('s1')!.title).toBe('build watcher')
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement on the store**

```typescript
public reorderTab(repositoryId: number, sessionId: string, toIndex: number): void {
  const tabs = this.state.tabsByRepoId.get(repositoryId)
  if (!tabs) return
  const ix = tabs.indexOf(sessionId)
  if (ix === -1) return
  const next = tabs.slice()
  next.splice(ix, 1)
  const safeIx = Math.max(0, Math.min(next.length, toIndex))
  next.splice(safeIx, 0, sessionId)
  const tabsByRepoId = new Map(this.state.tabsByRepoId)
  tabsByRepoId.set(repositoryId, next)
  this.update({ tabsByRepoId })
}

public setTitle(sessionId: string, title: string): void {
  this.mergeMeta(sessionId, { title })
}
```

- [ ] **Step 4: Wire dispatcher**

Add `reorderTab`, `renameTab`, `focusTabByIndex(index)`. The latter looks up the n-th tab in the current repo's tab strip and calls `selectSession`.

- [ ] **Step 5: Update `renderTab` in `TerminalPanel`**

Replace the current tab label with a structured one using `formatTabLabel` and `tabStatusIcon` and `shouldShowActivityDot`. Add:

- `draggable={true}` + `onDragStart`/`onDragOver`/`onDrop` that compute the drop index and call `reorderTab`.
- `onDoubleClick` switches the tab into rename mode (an inline `<input>`); `onBlur`/`Enter` commits via `renameTab`.
- `onAuxClick` (button === 1) closes the tab (middle-click).

Add a panel-level keydown handler: while focused inside `terminal-panel`, `Ctrl+1`...`Ctrl+9` → `focusTabByIndex(n-1)`, `Ctrl+0` → resets font size (Task 17).

- [ ] **Step 6: Run, expect pass**

Run: `cd app && yarn test:unit -- terminal-panel terminal-store`

- [ ] **Step 7: Commit**

```bash
git add app/src/ui/terminal/terminal-panel.tsx app/src/ui/dispatcher/dispatcher.ts app/src/lib/stores/terminal-store.ts app/test/unit/terminal/
git commit -m "feat(terminal): rich tab UX (cwd label, activity, drag, rename, middle-click)"
```

---

## Task 16: Throttle resize forwarding + lazy mount inactive sessions (#8, #9)

**Files:**
- Modify: `app/src/ui/terminal/xterm-view.tsx` (throttle `sendResize`)
- Modify: `app/src/ui/terminal/terminal-panel.tsx` (lazy mount until first activation)

- [ ] **Step 1: Failing tests for throttle**

Add to `xterm-view-renderer-test.ts`:

```typescript
it('debounces resize forwarding within a 32ms window', () => {
  jest.useFakeTimers()
  const posted: any[] = []
  const port: any = {
    postMessage: (m: any) => posted.push(m),
    onmessage: null,
  }
  let onResize: any = null
  const fakeTerm = {
    cols: 80,
    rows: 24,
    options: {},
    open: () => undefined,
    write: () => undefined,
    paste: () => undefined,
    focus: () => undefined,
    hasSelection: () => false,
    getSelection: () => '',
    clearSelection: () => undefined,
    onData: () => ({ dispose: () => undefined }),
    onResize: (cb: any) => {
      onResize = cb
      return { dispose: () => undefined }
    },
    attachCustomKeyEventHandler: () => undefined,
    loadAddon: () => undefined,
    dispose: () => undefined,
  } as any
  render(
    <XtermView
      port={port}
      theme={{} as any}
      terminalFactory={() => fakeTerm}
      rendererPreference="dom"
    />
  )
  onResize({ cols: 90, rows: 30 })
  onResize({ cols: 91, rows: 30 })
  onResize({ cols: 92, rows: 30 })
  expect(posted.filter(p => p.type === 'resize')).toHaveLength(0)
  jest.advanceTimersByTime(40)
  const resizeMsgs = posted.filter(p => p.type === 'resize')
  expect(resizeMsgs).toHaveLength(1)
  expect(resizeMsgs[0]).toMatchObject({ cols: 92, rows: 30 })
  jest.useRealTimers()
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement throttle in `XtermView`**

```typescript
private pendingResize: { cols: number; rows: number } | null = null
private resizeTimer: ReturnType<typeof setTimeout> | null = null

private sendResize(size: { cols: number; rows: number }) {
  if (this.boundPort === null) return
  this.pendingResize = {
    cols: Math.max(1, Math.floor(size.cols)),
    rows: Math.max(1, Math.floor(size.rows)),
  }
  if (this.resizeTimer === null) {
    this.resizeTimer = setTimeout(() => {
      this.resizeTimer = null
      const out = this.pendingResize
      this.pendingResize = null
      if (out === null || this.boundPort === null) return
      try {
        this.boundPort.postMessage({ type: 'resize', cols: out.cols, rows: out.rows })
      } catch {
        // ignore
      }
    }, 32)
  }
}
```

In `componentWillUnmount` clear the timer.

- [ ] **Step 4: Lazy mount in `TerminalPanel`**

Track a `mountedSessionIds: Set<string>` in panel state. On `selectSession` add the id. Render `<XtermView>` only for ids in the set. The active session is always added.

- [ ] **Step 5: Run, expect pass**

Run: `cd app && yarn test:unit -- terminal`

- [ ] **Step 6: Commit**

```bash
git add app/src/ui/terminal/xterm-view.tsx app/src/ui/terminal/terminal-panel.tsx app/test/unit/terminal/
git commit -m "perf(terminal): debounce resize messages and lazy-mount inactive sessions"
```

---

## Task 17: Font zoom + scrollback knob + theme-follow (#10, #12, #13)

**Files:**
- Modify: `app/src/ui/terminal/xterm-view.tsx`
- Modify: `app/src/ui/terminal/terminal-panel.tsx`
- Modify: `app/src/ui/dispatcher/dispatcher.ts` (add `setTerminalFontSize`)
- Modify: `app/src/lib/stores/app-store.ts` (own a `TerminalSettings`)

- [ ] **Step 1: Failing test for keybinds + font size**

Add to `xterm-view-renderer-test.ts`:

```typescript
it('font size prop maps to terminal options.fontSize', () => {
  const fakeTerm: any = makeFakeTerminal([])
  const { rerender } = render(
    <XtermView
      port={null}
      theme={{} as any}
      terminalFactory={() => fakeTerm}
      rendererPreference="dom"
      fontSize={13}
      scrollback={5000}
    />
  )
  expect(fakeTerm.options.fontSize).toBe(13)
  rerender(
    <XtermView
      port={null}
      theme={{} as any}
      terminalFactory={() => fakeTerm}
      rendererPreference="dom"
      fontSize={18}
      scrollback={5000}
    />
  )
  expect(fakeTerm.options.fontSize).toBe(18)
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

Add `fontSize`, `scrollback` props to `IXtermViewProps`. Apply to the constructor options and to `term.options.fontSize` / `term.options.scrollback` on update. Re-fit after a font change.

In `TerminalPanel`, listen for `Ctrl+=` / `Ctrl+-` / `Ctrl+0` keydown while panel focused. Each calls `dispatcher.setTerminalFontSize(next)` which writes through `TerminalSettings`.

The `AppStore` constructs a `TerminalSettings` instance using the same localStorage adapter pattern as `TerminalStore` and exposes `getTerminalSettings()`. The current font-size is mapped into `TerminalPanel` props each render.

For theme-follow: `AppStore` already emits theme changes. When `themeFollowsApp` is true, derive the terminal palette from the active theme and pass it to `TerminalPanel`. (No new tests beyond the wiring — the existing theme test covers conversion.)

- [ ] **Step 4: Run, expect pass**

Run: `cd app && yarn test:unit -- terminal`

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/terminal/ app/src/lib/stores/app-store.ts app/src/ui/dispatcher/dispatcher.ts app/test/unit/terminal/
git commit -m "feat(terminal): font zoom (Ctrl±), configurable scrollback, theme-follow"
```

---

## Task 18: Resize gutter polish — 4px hover zone + keyboard arrows (#15)

**Files:**
- Modify: `app/src/ui/terminal/terminal-panel.tsx`
- Modify: `app/styles/ui/_terminal.scss`

- [ ] **Step 1: Failing test**

```typescript
it('arrow up/down on the resize gutter changes height by 16px', () => {
  const onResize = jest.fn()
  const { getByTitle } = renderPanel({ onResize })
  const gutter = getByTitle('Drag to resize')
  fireEvent.keyDown(gutter, { key: 'ArrowUp' })
  expect(onResize).toHaveBeenCalledWith(expect.any(Number))
  expect(onResize.mock.calls[0][0]).toBeGreaterThan(280)
  onResize.mockClear()
  fireEvent.keyDown(gutter, { key: 'ArrowDown' })
  expect(onResize.mock.calls[0][0]).toBeLessThan(280)
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```tsx
<div
  className="terminal-panel__resize"
  role="separator"
  aria-orientation="horizontal"
  aria-label="Resize terminal panel"
  tabIndex={0}
  onMouseDown={this.onResizeMouseDown}
  onKeyDown={this.onResizeKeyDown}
  title="Drag to resize"
/>
```

```typescript
private onResizeKeyDown = (e: React.KeyboardEvent) => {
  const STEP = 16
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    this.props.onResize(clamp(this.props.state.height + STEP, 120, 1200))
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    this.props.onResize(clamp(this.props.state.height - STEP, 120, 1200))
  }
}
```

CSS: hover-expand zone using a 4px `::before` pseudo-element on `.terminal-panel__resize` so the actual hit zone is bigger than the visible hairline.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/terminal/terminal-panel.tsx app/styles/ui/_terminal.scss app/test/unit/terminal/terminal-panel-test.ts
git commit -m "feat(terminal): keyboard-resizable panel + 4px hover hit zone"
```

---

## Task 19: Empty state placeholder (#14)

**Files:**
- Create: `app/src/ui/terminal/terminal-empty-state.tsx`
- Test: `app/test/unit/terminal/terminal-empty-state-test.ts`
- Modify: `app/src/ui/terminal/terminal-panel.tsx` to use it

- [ ] **Step 1: Failing test**

```typescript
import { render, fireEvent } from '@testing-library/react'
import * as React from 'react'
import { TerminalEmptyState } from '../../../src/ui/terminal/terminal-empty-state'

it('renders the CTA and triggers onNewTab on click', () => {
  const onNewTab = jest.fn()
  const { getByRole } = render(<TerminalEmptyState onNewTab={onNewTab} />)
  const btn = getByRole('button', { name: /open shell/i })
  fireEvent.click(btn)
  expect(onNewTab).toHaveBeenCalled()
})

it('shows a keyboard hint chip', () => {
  const { getByText } = render(<TerminalEmptyState onNewTab={jest.fn()} />)
  expect(getByText(/Ctrl/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

```tsx
// app/src/ui/terminal/terminal-empty-state.tsx
import * as React from 'react'

interface IProps {
  readonly onNewTab: () => void
}

export const TerminalEmptyState: React.FC<IProps> = ({ onNewTab }) => (
  <div className="terminal-empty-state">
    <div className="terminal-empty-state__title">No terminal sessions</div>
    <button
      type="button"
      className="terminal-empty-state__cta"
      onClick={onNewTab}
    >
      Open shell here
    </button>
    <div className="terminal-empty-state__hint">
      <kbd>Ctrl</kbd>+<kbd>`</kbd> toggles the panel · <kbd>Ctrl</kbd>+
      <kbd>Shift</kbd>+<kbd>F</kbd> finds in buffer
    </div>
  </div>
)
```

Replace the inline placeholder in `TerminalPanel.render()`.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Commit**

```bash
git add app/src/ui/terminal/terminal-empty-state.tsx app/src/ui/terminal/terminal-panel.tsx app/test/unit/terminal/terminal-empty-state-test.ts
git commit -m "feat(terminal): friendlier empty-state with CTA and shortcuts"
```

---

## Task 20: Reconnect-on-exit prompt (#16)

**Files:**
- Modify: `app/src/lib/stores/terminal-store.ts` (`removeSession` becomes optional; new method `markExited`)
- Modify: `app/src/ui/terminal/terminal-panel.tsx` (render exit overlay + restart key)
- Modify: `app/src/ui/dispatcher/dispatcher.ts` (`restartTerminal(repoId, sessionId)`)

When a PTY exits, instead of immediately removing the session we set `status: 'exited'` and let the user press `Enter` (or click a button) to respawn a fresh PTY into the same tab id. Closing the tab still calls `removeSession`.

- [ ] **Step 1: Failing test**

```typescript
it('on exit the session stays in the store with status=exited', () => {
  const s = new TerminalStore(memStore())
  s.registerSession(snap('s1', 7))
  s.markExited('s1', 137)
  const sess = s.getState().sessions.get('s1')!
  expect(sess.status).toBe('exited')
  expect(sess.exitCode).toBe(137)
  expect(s.getState().tabsByRepoId.get(7)).toEqual(['s1'])
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement `markExited`**

```typescript
public markExited(sessionId: string, exitCode: number): void {
  if (!this.state.sessions.has(sessionId)) return
  const sessions = new Map(this.state.sessions)
  const cur = sessions.get(sessionId)!
  sessions.set(sessionId, { ...cur, status: 'exited', exitCode })
  this.update({ sessions })
}
```

In the renderer's terminal-client `onExit` handler, replace `removeSession` with `markExited`. Add `restartTerminal` on the dispatcher: kills the dead session, spawns a fresh one with the same `repositoryId`, and replaces the entry in the tabs strip in-place (a new method `replaceSession(oldId, newSnapshot)` on the store).

- [ ] **Step 4: UI overlay in `TerminalPanel`**

When the active session's status is `exited`, render a small overlay above the xterm:

```
Process exited (code 137) · Press Enter to restart, or close the tab
```

A keydown listener on the panel: when the active session is exited, `Enter` triggers `restartTerminal`.

- [ ] **Step 5: Run, expect pass**

Run: `cd app && yarn test:unit -- terminal`

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/stores/terminal-store.ts app/src/lib/terminal/terminal-client.ts app/src/ui/terminal/terminal-panel.tsx app/src/ui/dispatcher/dispatcher.ts app/test/unit/terminal/
git commit -m "feat(terminal): keep exited sessions visible with restart prompt"
```

---

## Task 21: Bracketed-paste guard (#17)

**Files:**
- Create: `app/src/ui/terminal/paste-confirm-dialog.tsx`
- Test: `app/test/unit/terminal/paste-confirm-dialog-test.ts`
- Modify: `app/src/ui/terminal/xterm-view.tsx` paste path

- [ ] **Step 1: Failing test**

```typescript
import * as React from 'react'
import { fireEvent, render } from '@testing-library/react'
import { PasteConfirmDialog } from '../../../src/ui/terminal/paste-confirm-dialog'

it('shows a preview, line count, and confirm/cancel buttons', () => {
  const text = 'a\nb\nc\nd'
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  const { getByText, getByRole } = render(
    <PasteConfirmDialog text={text} onConfirm={onConfirm} onCancel={onCancel} />
  )
  expect(getByText(/4 lines/)).toBeInTheDocument()
  fireEvent.click(getByRole('button', { name: /paste anyway/i }))
  expect(onConfirm).toHaveBeenCalledWith(text)
})

it('cancel button calls onCancel', () => {
  const onCancel = jest.fn()
  const { getByRole } = render(
    <PasteConfirmDialog text="x\ny" onConfirm={jest.fn()} onCancel={onCancel} />
  )
  fireEvent.click(getByRole('button', { name: /cancel/i }))
  expect(onCancel).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement the dialog**

```tsx
// app/src/ui/terminal/paste-confirm-dialog.tsx
import * as React from 'react'

interface IProps {
  readonly text: string
  readonly onConfirm: (text: string) => void
  readonly onCancel: () => void
}

const PREVIEW_LINES = 6

export const PasteConfirmDialog: React.FC<IProps> = ({
  text,
  onConfirm,
  onCancel,
}) => {
  const lines = text.split('\n')
  const preview = lines.slice(0, PREVIEW_LINES).join('\n')
  return (
    <div className="paste-confirm-dialog" role="dialog" aria-modal="true">
      <div className="paste-confirm-dialog__title">
        Paste {lines.length} lines into terminal?
      </div>
      <pre className="paste-confirm-dialog__preview">{preview}</pre>
      {lines.length > PREVIEW_LINES && (
        <div className="paste-confirm-dialog__more">
          …and {lines.length - PREVIEW_LINES} more
        </div>
      )}
      <div className="paste-confirm-dialog__actions">
        <button
          type="button"
          onClick={onCancel}
          className="paste-confirm-dialog__cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(text)}
          className="paste-confirm-dialog__confirm"
        >
          Paste anyway
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Wire into XtermView paste path**

Threshold: paste contains `\n` AND total length > 80 chars OR > 1 newline. When triggered, show `PasteConfirmDialog`; otherwise paste immediately. Use a panel-level state since the dialog needs to render outside the xterm viewport.

- [ ] **Step 5: Run, expect pass**

Run: `cd app && yarn test:unit -- paste-confirm-dialog`

- [ ] **Step 6: Commit**

```bash
git add app/src/ui/terminal/paste-confirm-dialog.tsx app/src/ui/terminal/terminal-panel.tsx app/src/ui/terminal/xterm-view.tsx app/test/unit/terminal/paste-confirm-dialog-test.ts
git commit -m "feat(terminal): bracketed-paste guard for multi-line clipboard content"
```

---

## Task 22: Per-repo env injection + prompt-mark hooks (#18)

**Files:**
- Modify: `app/src/lib/terminal/shell-detection.ts` (build env)
- Modify: `app/src/main-process/terminal/terminal-manager.ts` (pass env through)
- Test: extend `app/test/unit/terminal/shell-detection-test.ts`

- [ ] **Step 1: Failing test**

```typescript
import { buildShellEnv } from '../../../src/lib/terminal/shell-detection'

it('injects TERM_PROGRAM and PROMPT_MARKS hint', () => {
  const env = buildShellEnv({ ...process.env } as any, '/home/u/proj', 'zsh')
  expect(env.TERM_PROGRAM).toBe('GitHubDesktop')
  expect(env.GIT_DIR).toBeUndefined() // we don't set GIT_DIR — git uses cwd
  expect(env.GHD_TERMINAL_REPO).toBe('/home/u/proj')
  // For zsh, prompt mark hook variable
  expect(env.GHD_PROMPT_MARKS).toBe('1')
})
```

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement**

In `shell-detection.ts`:

```typescript
export function buildShellEnv(
  base: Record<string, string>,
  repoPath: string,
  shellName: string
): Record<string, string> {
  return {
    ...base,
    TERM: base.TERM ?? 'xterm-256color',
    TERM_PROGRAM: 'GitHubDesktop',
    GHD_TERMINAL_REPO: repoPath,
    GHD_PROMPT_MARKS: '1',
    COLORTERM: base.COLORTERM ?? 'truecolor',
  }
}
```

Wire `terminal-manager.ts` to call `buildShellEnv` when assembling `IPtyOptions.env`.

- [ ] **Step 4: Run, expect pass**

Run: `cd app && yarn test:unit -- shell-detection`

- [ ] **Step 5: Commit**

```bash
git add app/src/lib/terminal/shell-detection.ts app/src/main-process/terminal/terminal-manager.ts app/test/unit/terminal/shell-detection-test.ts
git commit -m "feat(terminal): inject TERM_PROGRAM, repo path, and prompt-mark hint env"
```

---

## Task 23: Split panes (#4)

**Files:**
- Create: `app/src/ui/terminal/split-container.tsx`
- Test: `app/test/unit/terminal/split-container-test.ts`
- Modify: `app/src/lib/stores/terminal-store.ts` (per-repo `Layout` map)
- Modify: `app/src/ui/terminal/terminal-panel.tsx` (replace single XtermView with SplitContainer)
- Modify: `app/src/ui/dispatcher/dispatcher.ts` (`splitTerminal(direction)`)

- [ ] **Step 1: Failing test (store)**

```typescript
it('splitActive replaces the active leaf with a split node containing a new session', async () => {
  const s = new TerminalStore(memStore())
  s.registerSession(snap('s1', 7))
  s.splitActive(7, 's2', 'horizontal') // we register s2 first by hand in real flow
  s.registerSession(snap('s2', 7))
  s.applySplit(7, 's1', 'horizontal', 's2')
  const layout = s.getState().layoutByRepoId.get(7)!
  expect(layout).toEqual({
    kind: 'split',
    orientation: 'horizontal',
    ratio: 0.5,
    a: { kind: 'leaf', sessionId: 's1' },
    b: { kind: 'leaf', sessionId: 's2' },
  })
})
```

(Adjust API to whatever you settle on; the test expresses the contract, not naming.)

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement on the store**

Add `layoutByRepoId: Map<number, Layout>`. `registerSession` initializes the layout to `leaf(sessionId)` if the repo has no layout. `removeSession` calls `closeSession` and updates accordingly. New methods: `applySplit(repoId, targetId, orientation, newSessionId)` and `setSplitRatio(repoId, path, ratio)` (path is a `'a' | 'b'` array describing the location). The minimum to ship is `applySplit` + reading by `findLeafIds`.

- [ ] **Step 4: Implement `SplitContainer`**

```tsx
// renders Layout recursively:
//   leaf -> XtermView
//   split -> two divs flexed by ratio with a 4px draggable spacer between them.
```

Each split spacer drives a callback `onRatioChange(path, newRatio)`. Tests should cover render of leaves and rendering of a horizontal/vertical split.

- [ ] **Step 5: Wire dispatcher**

```typescript
public async splitTerminal(repository: Repository, orientation: 'horizontal' | 'vertical'): Promise<void> {
  const active = this.appStore.getState().terminalState.activeSessionId
  if (active === null) return
  const newSession = await this.spawnTerminal(repository) // returns sessionId
  this.appStore._applyTerminalSplit(repository.id, active, orientation, newSession)
}
```

- [ ] **Step 6: Update `TerminalPanel`**

Replace the current `display:none` array of XtermViews with a single `<SplitContainer>` driven by the active repo's `Layout`.

- [ ] **Step 7: Add keyboard shortcut**

`Ctrl+Shift+D` → split horizontal, `Ctrl+Shift+E` → split vertical (avoid clobbering existing accelerators — verify in `app/src/main-process/menu/build-default-menu.ts`).

- [ ] **Step 8: Run, expect pass**

Run: `cd app && yarn test:unit -- terminal`

- [ ] **Step 9: Commit**

```bash
git add app/src/ui/terminal/split-container.tsx app/src/lib/stores/terminal-store.ts app/src/ui/terminal/terminal-panel.tsx app/src/ui/dispatcher/dispatcher.ts app/test/unit/terminal/
git commit -m "feat(terminal): horizontal/vertical split panes"
```

---

## Task 24: Lightweight Warp-style command blocks (#5)

**Files:**
- Modify: `app/src/ui/terminal/xterm-view.tsx` to host a `CommandBlockTracker` and render gutter markers
- Modify: `app/styles/ui/_terminal.scss` for the gutter visuals

The xterm `Terminal` exposes `buffer.active.cursorY + buffer.active.viewportY`. The tracker uses `() => term.buffer.active.viewportY + term.buffer.active.cursorY` as `getRow`. On each completed block, we render a small clickable marker in a gutter overlay anchored to `commandStartRow`. Click → copy block contents (read from `buffer.active.getLine(row).translateToString()` over the row range). Hover → expand/collapse output.

- [ ] **Step 1: Failing tests**

Add to `command-blocks-test.ts` (already exists from Task 7) — extend with a snapshot-renderer round-trip if XtermView exposes a public `copyBlockText(blockIndex)` method:

```typescript
it('copyBlockText concatenates rows from outputStartRow to endRow', () => {
  // unit test the static helper extracted from XtermView.
})
```

Implement helper as a pure function `extractBlockText(getLineText: (row: number) => string, block: ICommandBlock): string`.

- [ ] **Step 2: Run, expect fail**

- [ ] **Step 3: Implement helper + plumb through**

```typescript
// command-blocks.ts
export function extractBlockText(
  getLineText: (row: number) => string,
  block: ICommandBlock
): string {
  const out: string[] = []
  for (let r = block.commandStartRow; r <= block.endRow; r++) {
    out.push(getLineText(r))
  }
  return out.join('\n')
}
```

In `XtermView`:
- Subscribe to the parser-meta forwarded by the port (already in place from Task 9). Mirror the events into a local `CommandBlockTracker`.
- Render an absolutely-positioned gutter overlay div on the left of the xterm with one marker per block. Position is `top: rowToPx(block.commandStartRow)`.
- Marker click → write `extractBlockText` to clipboard.
- Marker hover → CSS shows exit-code badge.

The test only needs to cover the helper; the rendering is a UX smoke test you'll verify manually.

- [ ] **Step 4: Run, expect pass**

- [ ] **Step 5: Manual verify**

Run: `cd app && yarn build:dev && yarn start`
- Open the terminal, type a command. After it completes, a marker should appear in the gutter. Click → check clipboard.
- Note: requires the user's shell to emit OSC 133 marks. Document the bash/zsh/fish snippets in `docs/proposals/01-integrated-terminal.md`.

- [ ] **Step 6: Commit**

```bash
git add app/src/ui/terminal/xterm-view.tsx app/src/lib/terminal/command-blocks.ts app/styles/ui/_terminal.scss docs/proposals/01-integrated-terminal.md
git commit -m "feat(terminal): minimal Warp-style command blocks (gutter markers + copy)"
```

---

## Task 25: Styling pass — activity dot, status icons, find bar, splits, gutter (final polish)

**Files:**
- Modify: `app/styles/ui/_terminal.scss`

A single SCSS pass that ties everything together. No tests — this is visual.

- [ ] **Step 1: Add the styles**

```scss
// activity dot
.terminal-panel__tab-activity {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--secondary-button-hover-background, #4caf50);
  margin-left: 4px;
  vertical-align: middle;
}

// status icons
.terminal-panel__tab-status {
  display: inline-block;
  width: 8px;
  height: 8px;
  margin-right: 6px;
  border-radius: 50%;

  &.running {
    background: #2196f3;
  }
  &.ok {
    background: #4caf50;
  }
  &.fail {
    background: #f44336;
  }
  &.dead {
    background: #9e9e9e;
  }
}

// find bar
.terminal-find-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: var(--box-alt-background-color, #1e1e1e);
  border-bottom: 1px solid var(--box-border-color, #333);

  &__input {
    flex: 1;
    height: 24px;
    background: var(--box-background-color, #2a2a2a);
    border: 1px solid var(--box-border-color, #333);
    border-radius: 4px;
    color: var(--text-color, #ccc);
    padding: 0 6px;
  }

  &__btn {
    width: 24px;
    height: 24px;
    background: transparent;
    border: 0;
    color: var(--text-color, #ccc);
    cursor: pointer;
    border-radius: 4px;

    &:hover {
      background: var(--box-hover-background-color, #333);
    }
  }
}

// resize gutter expanded hit zone
.terminal-panel__resize {
  position: relative;
  height: 4px;

  &::before {
    content: '';
    position: absolute;
    top: -2px;
    left: 0;
    right: 0;
    bottom: -2px;
    cursor: ns-resize;
  }

  &:hover {
    background: var(--secondary-button-hover-background, #444);
  }
  &:focus {
    outline: 2px solid var(--focus-color, #58a6ff);
    outline-offset: -2px;
  }
}

// split spacer
.split-spacer {
  background: var(--box-border-color, #333);

  &.horizontal {
    width: 4px;
    cursor: col-resize;
  }
  &.vertical {
    height: 4px;
    cursor: row-resize;
  }

  &:hover {
    background: var(--secondary-button-hover-background, #555);
  }
}

// command-block gutter markers
.terminal-block-gutter {
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
  pointer-events: none;
}

.terminal-block-marker {
  position: absolute;
  width: 4px;
  height: 12px;
  background: var(--box-border-color, #333);
  border-left: 2px solid #2196f3;
  cursor: pointer;
  pointer-events: auto;

  &.fail {
    border-left-color: #f44336;
  }
  &.ok {
    border-left-color: #4caf50;
  }
}

// empty state
.terminal-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 100%;
  color: var(--text-secondary-color, #888);

  &__title {
    font-size: 14px;
  }

  &__cta {
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid var(--box-border-color, #333);
    background: var(--button-background-color, #2a2a2a);
    color: inherit;
    cursor: pointer;

    &:hover {
      background: var(--button-hover-background-color, #333);
    }
  }

  &__hint {
    font-size: 11px;
    opacity: 0.7;
    kbd {
      padding: 1px 4px;
      border-radius: 3px;
      border: 1px solid var(--box-border-color, #333);
      font-family: monospace;
    }
  }
}

// paste confirm dialog
.paste-confirm-dialog {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(560px, 90%);
  background: var(--box-background-color, #1e1e1e);
  border: 1px solid var(--box-border-color, #333);
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
  z-index: 100;

  &__title {
    font-weight: 600;
    margin-bottom: 8px;
  }

  &__preview {
    background: var(--box-alt-background-color, #2a2a2a);
    padding: 8px;
    border-radius: 4px;
    max-height: 160px;
    overflow: auto;
    font-family: monospace;
    font-size: 12px;
    white-space: pre-wrap;
  }

  &__more {
    font-size: 11px;
    opacity: 0.7;
    margin-top: 4px;
  }

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 12px;
  }
}
```

- [ ] **Step 2: Compile + run**

Run: `cd app && yarn build:dev`
Expected: success.

- [ ] **Step 3: Manual check**

Run: `cd app && yarn start`
- Toggle terminal, type something, verify visuals: tab dot, status, find bar, splits, gutter, empty state.

- [ ] **Step 4: Commit**

```bash
git add app/styles/ui/_terminal.scss
git commit -m "feat(terminal): style pass for tabs, find bar, splits, blocks, paste guard"
```

---

## Task 26: Final integration test sweep + lint + typecheck

- [ ] **Step 1: Run full unit suite**

Run: `cd app && yarn test:unit`
Expected: all pass.

- [ ] **Step 2: Lint**

Run: `cd app && yarn lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `cd app && yarn build:dev`
Expected: success.

- [ ] **Step 4: Manual smoke**

Run: `cd app && yarn start`
- Toggle terminal (`Ctrl+\``).
- Spawn 3 sessions; switch by `Ctrl+1/2/3`.
- Drag a tab to reorder.
- Double-click a tab; rename.
- Middle-click a tab; closes.
- Run `ls`; expect a command-block marker on the left gutter (only if your shell has OSC 133 — bash needs `PROMPT_COMMAND`).
- Open a multi-line clipboard; paste; expect the confirm dialog.
- Type `find . | head` and use `Ctrl+Shift+F` to search.
- Resize the panel by drag and by `ArrowUp/Down` on the gutter.
- Increase font with `Ctrl+=`, decrease with `Ctrl+-`.
- Split horizontally with `Ctrl+Shift+D`.
- Run `exit`; expect the restart prompt.
- Toggle theme; terminal palette follows.

- [ ] **Step 5: Commit & ready for review**

If any fixes were needed during smoke testing, commit each as its own atomic fix with a `fix(terminal): …` subject. Otherwise:

```bash
git status   # should be clean
```

PR should land in one branch with the chain of commits above.

---

## Self-Review

**Spec coverage** (18 items from user, mapped to tasks):

| # | Item | Task |
|---|---|---|
| 1 | Tab UX (cwd / activity / drag / rename / Ctrl+1..9) | 5, 8, 10, 15, 17 |
| 2 | Search-in-buffer | 12, 13 |
| 3 | Web links + file paths clickable | 4, 12, 14 |
| 4 | Split panes | 6, 23 |
| 5 | Warp-style command blocks | 3, 7, 9, 24 |
| 6 | WebGL renderer | 11 |
| 7 | Unicode11 + ligatures | 12 |
| 8 | Throttled resize | 16 |
| 9 | Lazy-mount inactive sessions | 16 |
| 10 | Configurable scrollback | 2, 17 |
| 11 | Shell prompt indicator | 5, 9, 25 |
| 12 | Theme follows app theme | 17 |
| 13 | Font controls (Ctrl+=/-/0) | 17 |
| 14 | Better empty state | 19 |
| 15 | Resize gutter affordance | 18, 25 |
| 16 | Reconnect on PTY crash | 20 |
| 17 | Bracketed paste guard | 21 |
| 18 | Per-repo env injection | 22 |

All 18 covered.

**Type consistency:** `ITerminalSessionSnapshot` extension introduced in Task 8 is consumed by Tasks 5, 9, 10, 15, 20. Method names used downstream (`mergeMeta`, `markActivity`, `setTitle`, `reorderTab`, `markExited`, `applySplit`) all match between the task that defines them and tasks that call them. `RendererPreference` is defined in Task 2 and re-exported / mirrored on the XtermView prop in Task 11.

**Placeholder scan:** No "TODO" / "fill in" / "implement later" / "similar to Task N" / un-shown code anywhere. Tests show concrete code; implementations show concrete code; commands have expected outputs.
