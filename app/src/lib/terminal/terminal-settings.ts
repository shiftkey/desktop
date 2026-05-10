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
    this.fontSize = loadInt(
      storage.getItem(KEY_FONT_SIZE),
      MIN_FONT_SIZE,
      MAX_FONT_SIZE,
      DEFAULT_FONT_SIZE
    )
    this.scrollback = loadInt(
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
    const next = clampInt(
      String(px),
      MIN_FONT_SIZE,
      MAX_FONT_SIZE,
      this.fontSize
    )
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

function loadInt(
  raw: string | null,
  min: number,
  max: number,
  fallback: number
): number {
  if (raw === null) {
    return fallback
  }
  const n = parseInt(raw, 10)
  if (Number.isNaN(n) || n < min || n > max) {
    return fallback
  }
  return n
}

function parseRenderer(raw: string | null): RendererPreference {
  if (raw === 'canvas' || raw === 'dom' || raw === 'webgl') {
    return raw
  }
  return 'webgl'
}
