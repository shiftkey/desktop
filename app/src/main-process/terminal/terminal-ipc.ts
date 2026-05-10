/**
 * Wire `TerminalManager` to Electron's `ipcMain`.
 *
 * Renderer side calls:
 *   - `terminal/spawn` → returns `{ sessionId }` and transfers the
 *     other end of a `MessageChannelMain` so high-throughput data flows
 *     out of band.
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

  ipcMain.handle(TERMINAL_IPC.SPAWN, async (_event, args) => {
    const { repositoryId, options } = args as {
      repositoryId: number
      options: IPtyOptions
    }
    const port = createPortPair()
    const snapshot = manager.spawn(repositoryId, options, port.main)
    return { sessionId: snapshot.id, port: port.renderer }
  })

  ipcMain.handle(TERMINAL_IPC.KILL, async (_event, sessionId: string) => {
    manager.kill(sessionId)
  })

  ipcMain.handle(
    TERMINAL_IPC.RESIZE,
    async (
      _event,
      args: { sessionId: string; cols: number; rows: number }
    ) => {
      manager.resize(args.sessionId, args.cols, args.rows)
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

function spawnPty(ptyMod: PtyModule, opts: IPtyOptions): IPty {
  return ptyMod.spawn(opts.shell, [...opts.args], {
    name: 'xterm-256color',
    cwd: opts.cwd,
    env: { ...opts.env },
    cols: opts.cols,
    rows: opts.rows,
    encoding: null,
  })
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
