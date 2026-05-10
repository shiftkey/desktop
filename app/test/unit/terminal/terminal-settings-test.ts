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
