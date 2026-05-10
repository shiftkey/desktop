/**
 * Detect the user's preferred login shell.
 *
 * Strategy:
 *   1. macOS / Linux  → `process.env.SHELL` if it points at an existing executable.
 *   2. macOS / Linux  → fall back through `zsh`, `bash`, `sh` in standard `PATH` locations.
 *   3. Windows        → `process.env.COMSPEC` if set, otherwise `cmd.exe`.
 *
 * The result includes a stable `args` array so callers can spawn it directly
 * without having to know which shell was selected.
 */

export interface IDetectedShell {
  readonly path: string
  readonly args: ReadonlyArray<string>
}

/**
 * Filesystem probe contract used during detection. Defaulted to a thin wrapper
 * over `fs.existsSync`, but parameterized so tests can supply a deterministic
 * lookup without touching the disk.
 */
export type ShellProbe = (candidate: string) => boolean

/**
 * Environment shape sufficient for detection. Only the keys we read are
 * declared so tests don't have to mock `process.env`.
 */
export interface IShellDetectEnv {
  readonly SHELL?: string
  readonly COMSPEC?: string
}

const POSIX_FALLBACKS: ReadonlyArray<string> = [
  '/usr/bin/zsh',
  '/bin/zsh',
  '/usr/bin/bash',
  '/bin/bash',
  '/usr/bin/sh',
  '/bin/sh',
]

/**
 * Detect a shell suitable for the integrated terminal.
 *
 * @param platform   `process.platform`-compatible string. Anything not
 *                   `'win32'` is treated as POSIX.
 * @param env        Environment to read `SHELL` / `COMSPEC` from.
 * @param probe      Predicate returning true when a candidate exists on disk.
 *                   Defaulted to `fs.existsSync` by callers; tests should pass
 *                   a fake.
 * @returns          Resolved shell + args. Never returns null — falls back to
 *                   `/bin/sh` (or `cmd.exe` on Windows) as the last resort.
 */
export function detectShell(
  platform: NodeJS.Platform | string,
  env: IShellDetectEnv,
  probe: ShellProbe
): IDetectedShell {
  if (platform === 'win32') {
    const fromEnv = env.COMSPEC?.trim()
    if (fromEnv && fromEnv.length > 0 && probe(fromEnv)) {
      return { path: fromEnv, args: [] }
    }
    return { path: 'cmd.exe', args: [] }
  }

  // POSIX
  const fromEnv = env.SHELL?.trim()
  if (fromEnv && fromEnv.length > 0 && probe(fromEnv)) {
    return { path: fromEnv, args: posixArgsFor(fromEnv) }
  }

  for (const candidate of POSIX_FALLBACKS) {
    if (probe(candidate)) {
      return { path: candidate, args: posixArgsFor(candidate) }
    }
  }

  // Last resort — POSIX guarantees /bin/sh.
  return { path: '/bin/sh', args: [] }
}

/**
 * Build the environment for a new terminal session. Extends `base` (usually
 * `process.env`) with GHD-specific variables:
 *  - `TERM`          — set to `xterm-256color` if unset (many tools check this)
 *  - `TERM_PROGRAM`  — identifies the terminal as GitHub Desktop
 *  - `GHD_TERMINAL_REPO` — absolute path to the repository root
 *  - `GHD_PROMPT_MARKS`  — `'1'` to signal that the shell should emit OSC 133
 *  - `COLORTERM`     — set to `truecolor` if unset (enables 24-bit colour)
 */
export function buildShellEnv(
  base: Record<string, string>,
  repoPath: string,
  _shellName: string
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

/**
 * Decide which arg list to launch a POSIX shell with.
 *
 * For bash/zsh we pass `-l` so the user's profile (.bash_profile,
 * .profile, .zprofile, .zshrc) is sourced — without this, tools the user
 * installed under `~/.local/bin`, asdf-managed runtimes, nvm shims, etc.
 * are missing from PATH and commands like `claude` silently hang or
 * "command not found" out. node-pty already attaches a TTY so the shell
 * is interactive without `-i`.
 */
function posixArgsFor(path: string): ReadonlyArray<string> {
  const name = path.split('/').pop() ?? ''
  if (name === 'bash' || name === 'zsh') {
    return ['-l']
  }
  return []
}
