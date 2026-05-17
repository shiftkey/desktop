import { join } from 'path'
import { pathExists as pathExistsInternal } from 'fs-extra'
import {
  ChildProcess,
  spawn as nodeSpawn,
  SpawnOptionsWithoutStdio,
  SpawnOptions,
} from 'child_process'

export function isFlatpakBuild() {
  return __LINUX__ && process.env.FLATPAK_HOST === '1'
}

/**
 * Convert an executable path to be relative to the flatpak host
 *
 * @param path a path to an executable relative to the root of the filesystem
 */
export function convertToFlatpakPath(path: string) {
  if (!__LINUX__) {
    return path
  }

  if (path.startsWith('/opt/') || path.startsWith('/var/lib/flatpak')) {
    return path
  }

  return join('/var/run/host', path)
}

export function formatWorkingDirectoryForFlatpak(path: string): string {
  return path.replace(/(\s)/, ' ')
}

export function formatPathForFlatpak(path: string): string {
  if (path.startsWith('/var/lib/flatpak/app')) {
    return path.replace('/var/lib/flatpak/app/', '')
  }
  return path
}
/**
 * Checks the file path on disk exists before attempting to launch a specific shell
 *
 * @param path
 *
 * @returns `true` if the path can be resolved, or `false` otherwise
 */
export async function pathExists(path: string): Promise<boolean> {
  if (isFlatpakBuild()) {
    path = convertToFlatpakPath(path)
  }

  try {
    return await pathExistsInternal(path)
  } catch {
    return false
  }
}

/**
 * Dynamic-loader environment variables that, when inherited by a spawned
 * native GUI application, can point its loader at GitHub Desktop's bundled
 * Electron/Chromium libraries instead of the system ones. Inheriting these
 * into an external terminal (e.g. gnome-terminal) on a packaged build
 * (AppImage / Snap) makes it fail to start with symbol-lookup errors —
 * the terminal silently never appears. The integrated terminal already
 * strips the same set (see `sanitizeEnv` in
 * `main-process/terminal/terminal-ipc.ts`); externally launched shells
 * need the same treatment.
 */
const LOADER_ENV_KEYS: ReadonlyArray<string> = [
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
]

/**
 * Build a child environment with loader-hijacking variables removed.
 *
 * Exported for testing; production callers go through `spawn`.
 *
 * @param base environment to clean. Defaults to the current process env.
 */
export function cleanSpawnEnv(
  base: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...base }
  for (const key of LOADER_ENV_KEYS) {
    delete env[key]
  }
  return env
}

/**
 * Spawn a particular shell in a way that works for Flatpak-based usage
 *
 * @param path path to shell, relative to the root of the filesystem
 * @param args arguments to provide to the shell
 * @param options additional options to provide to spawn function
 *
 * @returns a child process to observe and monitor
 */
export function spawn(
  path: string,
  args: ReadonlyArray<string>,
  options?: SpawnOptionsWithoutStdio
): ChildProcess {
  // Strip loader-hijacking env vars so an externally launched terminal
  // loads system libraries rather than GitHub Desktop's bundled ones.
  // A caller that supplies its own `env` is respected as-is.
  const mergedOptions: SpawnOptionsWithoutStdio = {
    env: cleanSpawnEnv(),
    ...options,
  }

  if (isFlatpakBuild()) {
    return nodeSpawn('flatpak-spawn', ['--host', path, ...args], mergedOptions)
  }

  return nodeSpawn(path, args, mergedOptions)
}

/**
 * Spawn a given editor in a way that works for Flatpak-based usage
 *
 * @param path path to editor, relative to the root of the filesystem
 * @param workingDirectory working directory to open initially in editor
 * @param options additional options to provide to spawn function
 */
export function spawnEditor(
  path: string,
  workingDirectory: string,
  options: SpawnOptions
): ChildProcess {
  if (isFlatpakBuild()) {
    const actualPath = formatPathForFlatpak(path)
    const EscapedworkingDirectory =
      formatWorkingDirectoryForFlatpak(workingDirectory)
    return nodeSpawn(
      'flatpak-spawn',
      ['--host', actualPath, EscapedworkingDirectory],
      options
    )
  } else {
    return nodeSpawn(path, [workingDirectory], options)
  }
}
