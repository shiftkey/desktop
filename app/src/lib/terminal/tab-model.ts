/**
 * Pure helpers used by the terminal panel to render tabs.
 *
 * The store holds raw fields (shell path, live cwd from OSC 7, activity
 * flag, exit code, optional user-supplied title); these helpers convert
 * them into the visual label/dot/icon shown on each tab.
 */

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
    if (input.liveCwd === home) {
      cwdPart = '~'
    } else {
      const after = input.liveCwd.slice(home.length + 1) // strip "home/"
      const last = after.split('/').pop() || ''
      cwdPart = last === '' ? '~' : '~/' + last
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
