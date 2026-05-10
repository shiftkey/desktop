import {
  getTerminalTheme,
  _palettes,
} from '../../../src/lib/terminal/terminal-theme'
import { ApplicationTheme } from '../../../src/ui/lib/application-theme'

describe('getTerminalTheme', () => {
  it('returns the dark palette for Dark', () => {
    const t = getTerminalTheme(ApplicationTheme.Dark)
    expect(t).toBe(_palettes.DARK_THEME)
  })

  it('returns the light palette for Light', () => {
    const t = getTerminalTheme(ApplicationTheme.Light)
    expect(t).toBe(_palettes.LIGHT_THEME)
  })

  it('every required color slot is set on the dark palette', () => {
    const required = [
      'foreground',
      'background',
      'cursor',
      'cursorAccent',
      'selectionBackground',
      'selectionForeground',
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite',
    ] as const
    for (const key of required) {
      expect(typeof (_palettes.DARK_THEME as any)[key]).toBe('string')
      expect((_palettes.DARK_THEME as any)[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('every required color slot is set on the light palette', () => {
    const required = [
      'foreground',
      'background',
      'cursor',
      'cursorAccent',
      'selectionBackground',
      'selectionForeground',
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'brightBlack',
      'brightRed',
      'brightGreen',
      'brightYellow',
      'brightBlue',
      'brightMagenta',
      'brightCyan',
      'brightWhite',
    ] as const
    for (const key of required) {
      expect(typeof (_palettes.LIGHT_THEME as any)[key]).toBe('string')
      expect((_palettes.LIGHT_THEME as any)[key]).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('dark and light palettes have different backgrounds (no accidental copy)', () => {
    expect(_palettes.DARK_THEME.background).not.toBe(
      _palettes.LIGHT_THEME.background
    )
  })
})
