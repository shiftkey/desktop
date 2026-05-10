import {
  detectShell,
  ShellProbe,
} from '../../../src/lib/terminal/shell-detection'

const ALL = (): ShellProbe => () => true
const NONE = (): ShellProbe => () => false
const ONLY = (paths: ReadonlyArray<string>): ShellProbe => (p: string) =>
  paths.includes(p)

describe('detectShell', () => {
  describe('on win32', () => {
    it('returns COMSPEC when set and the probe succeeds', () => {
      const result = detectShell(
        'win32',
        { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' },
        ALL()
      )
      expect(result.path).toBe('C:\\Windows\\System32\\cmd.exe')
      expect(result.args).toEqual([])
    })

    it('falls back to cmd.exe when COMSPEC is missing', () => {
      const result = detectShell('win32', {}, ALL())
      expect(result.path).toBe('cmd.exe')
    })

    it('falls back to cmd.exe when COMSPEC is empty/whitespace', () => {
      const result = detectShell('win32', { COMSPEC: '   ' }, ALL())
      expect(result.path).toBe('cmd.exe')
    })

    it('falls back to cmd.exe when COMSPEC points at a missing file', () => {
      const result = detectShell(
        'win32',
        { COMSPEC: 'C:\\nope\\cmd.exe' },
        NONE()
      )
      expect(result.path).toBe('cmd.exe')
    })
  })

  describe('on POSIX', () => {
    it('returns $SHELL when set and the probe succeeds', () => {
      const result = detectShell('linux', { SHELL: '/usr/bin/fish' }, ALL())
      expect(result.path).toBe('/usr/bin/fish')
      expect(result.args).toEqual([])
    })

    it('falls back to the first available standard shell when $SHELL is missing', () => {
      // Only /bin/bash exists in this fake fs
      const result = detectShell('linux', {}, ONLY(['/bin/bash']))
      expect(result.path).toBe('/bin/bash')
    })

    it('prefers zsh in standard locations over bash', () => {
      const result = detectShell(
        'linux',
        {},
        ONLY(['/usr/bin/zsh', '/bin/bash'])
      )
      expect(result.path).toBe('/usr/bin/zsh')
    })

    it('uses $SHELL even when standard fallbacks are also available', () => {
      const result = detectShell(
        'linux',
        { SHELL: '/opt/homebrew/bin/zsh' },
        ALL()
      )
      expect(result.path).toBe('/opt/homebrew/bin/zsh')
    })

    it('skips $SHELL when the path does not exist and falls back', () => {
      const result = detectShell(
        'linux',
        { SHELL: '/nonexistent/shell' },
        ONLY(['/bin/bash'])
      )
      expect(result.path).toBe('/bin/bash')
    })

    it('falls back to /bin/sh when nothing on the candidate list exists', () => {
      const result = detectShell('linux', {}, NONE())
      expect(result.path).toBe('/bin/sh')
      expect(result.args).toEqual([])
    })

    it('treats $SHELL with surrounding whitespace as missing', () => {
      const result = detectShell(
        'linux',
        { SHELL: '   ' },
        ONLY(['/bin/bash'])
      )
      expect(result.path).toBe('/bin/bash')
    })

    it('darwin behaves like linux for shell selection', () => {
      const result = detectShell(
        'darwin',
        { SHELL: '/bin/zsh' },
        ONLY(['/bin/zsh'])
      )
      expect(result.path).toBe('/bin/zsh')
    })
  })
})
