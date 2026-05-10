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
 * Decide which arg list to launch a POSIX shell with. Most are empty (an
 * interactive shell is the default) but a few benefit from explicit flags
 * to avoid sourcing global config files that hang on slow networks.
 */
function posixArgsFor(_path: string): ReadonlyArray<string> {
  // Intentionally empty for v1. Future tweak: detect zsh and pass `-l` only
  // when the user opts in via a setting.
  return []
}
