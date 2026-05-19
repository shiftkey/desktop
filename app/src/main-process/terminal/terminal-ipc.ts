/**
 * Wire `TerminalManager` to Electron's `ipcMain`.
 *
 * Renderer side calls:
 *   - `terminal/spawn` → returns `{ sessionId }`. The renderer-side
 *     `MessagePort` is transferred out-of-band via
 *     `event.senderFrame.postMessage('terminal/port-transfer', ...)`,
 *     because `MessagePortMain` cannot be structured-cloned as an
 *     `ipcMain.handle` return value.
 *   - `terminal/kill` → ends a session.
 *   - `terminal/resize` → resizes a session.
 *
 * The actual `node-pty` import is wrapped in a small adapter so this file
 * is testable in isolation. The adapter is created lazily; if `node-pty`
 * is unavailable (e.g. native build failed) the wiring still loads but
 * spawn requests reject with a descriptive error rather than crashing the
 * main process.
 */

import { TERMINAL_IPC } from '../../lib/terminal/ipc-channels'
import { IPtyOptions } from '../../lib/terminal/pty-types'
import { buildShellEnv } from '../../lib/terminal/shell-detection'
import { TerminalManager } from './terminal-manager'
import type { IPty } from './pty-session'

/** Subset of `Electron.IpcMain` we use. */
export interface IIpcMain {
  handle(channel: string, handler: (event: any, ...args: any[]) => any): void
  removeHandler(channel: string): void
  on(channel: string, handler: (event: any, ...args: any[]) => void): void
  removeAllListeners(channel: string): void
}

/**
 * Lazy node-pty loader so this module is import-safe even when the native
 * binding fails to build. Returns null on load failure.
 */
export type PtyModule = {
  spawn(file: string, args: ReadonlyArray<string>, opts: any): IPty
}

export type LoadPty = () => PtyModule | null

const defaultLoadPty: LoadPty = () => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('node-pty')
  } catch (err) {
    log.error('[terminal-ipc] node-pty failed to load', err as Error)
    return null
  }
}

/** Factory that creates a paired (main, renderer) port. */
export type PortPairFactory = () => { main: any; renderer: any }

/**
 * Register the terminal IPC handlers. Returns a `dispose()` function for
 * tests / hot-reload; callers can ignore it in production.
 *
 * `loadPty` and `createPortPair` are injectable for tests so the handler
 * can be exercised without loading `node-pty` or `electron` at all.
 */
export function registerTerminalIpc(
  ipcMain: IIpcMain,
  loadPty: LoadPty = defaultLoadPty,
  createPortPair: PortPairFactory = defaultCreatePortPair
): { dispose: () => void; manager: TerminalManager | null } {
  const ptyMod = loadPty()
  if (ptyMod === null) {
    // Register a stub spawn handler that always rejects, so renderer code
    // can show a useful error rather than hanging.
    ipcMain.handle(TERMINAL_IPC.SPAWN, async () => {
      throw new Error(
        'Integrated terminal is unavailable: node-pty failed to load.'
      )
    })
    return {
      dispose: () => ipcMain.removeHandler(TERMINAL_IPC.SPAWN),
      manager: null,
    }
  }

  const manager = new TerminalManager({
    factory: opts => spawnPty(ptyMod, opts),
  })

  ipcMain.handle(TERMINAL_IPC.SPAWN, async (event, args) => {
    const { repositoryId, options } = validateSpawnArgs(args)
    const port = createPortPair()

    let snapshot
    try {
      snapshot = manager.spawn(repositoryId, options, port.main)
    } catch (err) {
      // The PTY failed to launch (missing shell, bad cwd, …). No session
      // was created, so close both ends of the channel ourselves —
      // otherwise the MessageChannelMain leaks for the lifetime of the
      // process. Then reject so the renderer can show the error.
      closePortQuietly(port.main)
      closePortQuietly(port.renderer)
      throw err
    }

    // Transfer the renderer-side port out-of-band. ipcMain.handle return
    // values go through structured clone, which does NOT support
    // MessagePortMain; the only supported path is postMessage with a
    // transfer list.
    try {
      const frame = event?.senderFrame
      if (frame && typeof frame.postMessage === 'function') {
        frame.postMessage(
          TERMINAL_IPC.PORT_TRANSFER,
          { sessionId: snapshot.id },
          [port.renderer]
        )
      } else if (
        event?.sender &&
        typeof event.sender.postMessage === 'function'
      ) {
        event.sender.postMessage(
          TERMINAL_IPC.PORT_TRANSFER,
          { sessionId: snapshot.id },
          [port.renderer]
        )
      } else {
        // No way to transfer the port — kill the session so we don't leak a
        // PTY the renderer can never reach.
        manager.kill(snapshot.id)
        throw new Error(
          'Cannot transfer terminal MessagePort: sender does not support postMessage'
        )
      }
    } catch (err) {
      // `manager.kill` closes the main port via the session's cleanup; the
      // renderer port was never successfully transferred, so close it too.
      manager.kill(snapshot.id)
      closePortQuietly(port.renderer)
      throw err
    }
    return { sessionId: snapshot.id }
  })

  ipcMain.handle(TERMINAL_IPC.KILL, async (_event, sessionId: string) => {
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      return
    }
    manager.kill(sessionId)
  })

  ipcMain.handle(
    TERMINAL_IPC.RESIZE,
    async (_event, args: { sessionId: string; cols: number; rows: number }) => {
      if (
        args === null ||
        typeof args !== 'object' ||
        typeof args.sessionId !== 'string' ||
        args.sessionId.length === 0 ||
        !Number.isFinite(args.cols) ||
        !Number.isFinite(args.rows) ||
        args.cols <= 0 ||
        args.rows <= 0
      ) {
        return
      }
      manager.resize(
        args.sessionId,
        Math.floor(args.cols),
        Math.floor(args.rows)
      )
    }
  )

  return {
    dispose: () => {
      ipcMain.removeHandler(TERMINAL_IPC.SPAWN)
      ipcMain.removeHandler(TERMINAL_IPC.KILL)
      ipcMain.removeHandler(TERMINAL_IPC.RESIZE)
      manager.killAll()
    },
    manager,
  }
}

/**
 * Close a `MessagePortMain` without letting a throw escape. Electron can
 * throw if the port was already closed or never fully constructed; in the
 * cleanup paths here that is never actionable.
 */
function closePortQuietly(
  port: { close?: () => void } | null | undefined
): void {
  try {
    port?.close?.()
  } catch {
    // already closed / not a real port — nothing to do
  }
}

function spawnPty(ptyMod: PtyModule, opts: IPtyOptions): IPty {
  const shellName = opts.shell.split('/').pop() ?? opts.shell
  const env = buildShellEnv(opts.env, opts.cwd, shellName)
  return ptyMod.spawn(opts.shell, [...opts.args], {
    name: 'xterm-256color',
    cwd: opts.cwd,
    env,
    cols: opts.cols,
    rows: opts.rows,
    encoding: null,
  })
}

/**
 * Defense-in-depth validation of the renderer-supplied spawn payload. The
 * trust boundary is the same process tree, but a compromised renderer
 * (e.g. via XSS in markdown content) could otherwise spawn an arbitrary
 * binary with arbitrary args/cwd/env. We reject obviously-malformed
 * payloads and strip dangerous env vars that could change the loader's
 * behavior for the spawned child.
 */
function validateSpawnArgs(raw: unknown): {
  repositoryId: number
  options: IPtyOptions
} {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('Invalid terminal spawn payload')
  }
  const r = raw as { repositoryId?: unknown; options?: unknown }
  if (!Number.isFinite(r.repositoryId)) {
    throw new Error('Invalid terminal spawn payload: repositoryId')
  }
  if (r.options === null || typeof r.options !== 'object') {
    throw new Error('Invalid terminal spawn payload: options')
  }
  const o = r.options as Record<string, unknown>
  const shell = typeof o.shell === 'string' ? o.shell : ''
  const cwd = typeof o.cwd === 'string' ? o.cwd : ''
  if (shell.length === 0 || cwd.length === 0) {
    throw new Error('Invalid terminal spawn payload: shell/cwd')
  }
  const args = Array.isArray(o.args)
    ? o.args.filter((a): a is string => typeof a === 'string')
    : []
  const env = sanitizeEnv(o.env)
  const cols = Math.max(1, Math.floor(Number(o.cols) || 80))
  const rows = Math.max(1, Math.floor(Number(o.rows) || 24))
  return {
    repositoryId: Number(r.repositoryId),
    options: { shell, args, cwd, env, cols, rows },
  }
}

const DANGEROUS_ENV_KEYS = new Set([
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'LD_AUDIT',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'NODE_OPTIONS',
])

function sanitizeEnv(raw: unknown): Record<string, string> {
  if (raw === null || typeof raw !== 'object') {
    return {}
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (DANGEROUS_ENV_KEYS.has(k)) {
      continue
    }
    if (typeof v === 'string') {
      out[k] = v
    }
  }
  return out
}

/**
 * Default port pair: lazy-import Electron's `MessageChannelMain` so this
 * module can be imported in tests without an Electron context.
 */
function defaultCreatePortPair(): { main: any; renderer: any } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { MessageChannelMain } = require('electron')
  const channel = new MessageChannelMain()
  return { main: channel.port1, renderer: channel.port2 }
}
