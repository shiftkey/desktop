/**
 * Renderer-side wrapper around the terminal IPC channels.
 *
 * Wraps `ipcRenderer.invoke` so callers can `await spawn(...)` and get a
 * MessagePort + sessionId back. The MessagePort is what high-throughput
 * byte traffic flows over — never via these RPC calls.
 *
 * The Electron import is lazy + injectable so this module can be unit-tested
 * without an Electron context.
 */

import { TERMINAL_IPC } from './ipc-channels'
import { IPtyOptions, ITerminalSessionSnapshot } from './pty-types'

export interface IIpcRenderer {
  invoke(channel: string, ...args: any[]): Promise<any>
}

let cachedIpc: IIpcRenderer | null = null

function getIpcRenderer(): IIpcRenderer {
  if (cachedIpc !== null) return cachedIpc
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ipcRenderer } = require('electron')
  cachedIpc = ipcRenderer as IIpcRenderer
  return cachedIpc
}

/** Test seam: replace the renderer's IPC stub. */
export function _setIpcRenderer(ipc: IIpcRenderer | null) {
  cachedIpc = ipc
}

export async function spawnTerminal(
  repositoryId: number,
  options: IPtyOptions,
  ipc: IIpcRenderer = getIpcRenderer()
): Promise<{ sessionId: string; port: any }> {
  const result = await ipc.invoke(TERMINAL_IPC.SPAWN, {
    repositoryId,
    options,
  })
  return result as { sessionId: string; port: any }
}

export async function killTerminal(
  sessionId: string,
  ipc: IIpcRenderer = getIpcRenderer()
): Promise<void> {
  await ipc.invoke(TERMINAL_IPC.KILL, sessionId)
}

export async function resizeTerminal(
  sessionId: string,
  cols: number,
  rows: number,
  ipc: IIpcRenderer = getIpcRenderer()
): Promise<void> {
  await ipc.invoke(TERMINAL_IPC.RESIZE, { sessionId, cols, rows })
}

/** Convenience: build a snapshot stub from spawn args before main returns. */
export function makePendingSnapshot(
  sessionId: string,
  repositoryId: number,
  options: IPtyOptions,
  now: number = Date.now()
): ITerminalSessionSnapshot {
  return {
    id: sessionId,
    repositoryId,
    cwd: options.cwd,
    shell: options.shell,
    cols: options.cols,
    rows: options.rows,
    createdAt: now,
    status: 'running',
    exitCode: null,
  }
}
