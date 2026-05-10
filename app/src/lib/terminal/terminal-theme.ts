/**
 * Map an application theme onto an xterm.js-compatible theme object.
 *
 * Returning a plain `Record<string, string>` instead of importing the actual
 * `ITheme` type keeps this module free of any xterm dependency, which means
 * Phase 1 ships and tests cleanly before we install `@xterm/xterm`.
 */

import { ApplicableTheme, ApplicationTheme } from '../../ui/lib/application-theme'

/** Subset of the keys xterm.js's `ITheme` accepts. */
export interface ITerminalThemeColors {
  readonly foreground: string
  readonly background: string
  readonly cursor: string
  readonly cursorAccent: string
  readonly selectionBackground: string
  readonly selectionForeground: string
  readonly black: string
  readonly red: string
  readonly green: string
  readonly yellow: string
  readonly blue: string
  readonly magenta: string
  readonly cyan: string
  readonly white: string
  readonly brightBlack: string
  readonly brightRed: string
  readonly brightGreen: string
  readonly brightYellow: string
  readonly brightBlue: string
  readonly brightMagenta: string
  readonly brightCyan: string
  readonly brightWhite: string
}

const DARK_THEME: ITerminalThemeColors = {
  foreground: '#d4d4d4',
  background: '#1e1e1e',
  cursor: '#d4d4d4',
  cursorAccent: '#1e1e1e',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
}

const LIGHT_THEME: ITerminalThemeColors = {
  foreground: '#3b3b3b',
  background: '#ffffff',
  cursor: '#3b3b3b',
  cursorAccent: '#ffffff',
  selectionBackground: '#add6ff',
  selectionForeground: '#000000',
  black: '#000000',
  red: '#cd3131',
  green: '#00bc00',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
}

/**
 * Map an `ApplicableTheme` to the terminal palette. `System` is resolved to
 * the closest applicable theme upstream — this function only accepts the
 * resolved values.
 */
export function getTerminalTheme(theme: ApplicableTheme): ITerminalThemeColors {
  return theme === ApplicationTheme.Dark ? DARK_THEME : LIGHT_THEME
}

/** Re-exported for tests and consumers that want the raw palettes. */
export const _palettes = { DARK_THEME, LIGHT_THEME }
