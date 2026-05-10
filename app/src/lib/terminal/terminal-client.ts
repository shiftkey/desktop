/**
 * Renderer-side wrapper around the terminal IPC channels.
 *
 * Wraps `ipcRenderer.invoke` so callers can `await spawn(...)` and get a
 * MessagePort + sessionId back. The MessagePort cannot be returned from
 * `ipcMain.handle` (structured clone does not support `MessagePortMain`),
 * so the main process transfers it out-of-band via
 * `event.senderFrame.postMessage('terminal/port-transfer', ...)`. This
 * client correlates the asynchronous port-transfer message back to the
 * sessionId returned by the spawn invoke.
 *
 * The Electron import is lazy + injectable so this module can be unit-tested
 * without an Electron context.
 */

import { TERMINAL_IPC } from './ipc-channels'
import { IPtyOptions, ITerminalSessionSnapshot } from './pty-types'

export interface IIpcRenderer {
  invoke(channel: string, ...args: any[]): Promise<any>
  on(channel: string, listener: (event: any, ...args: any[]) => void): void
  removeListener?(
    channel: string,
    listener: (event: any, ...args: any[]) => void
  ): void
}

let cachedIpc: IIpcRenderer | null = null

function getIpcRenderer(): IIpcRenderer {
  if (cachedIpc !== null) {return cachedIpc}
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { ipcRenderer } = require('electron')
  cachedIpc = ipcRenderer as IIpcRenderer
  return cachedIpc
}

/** Test seam: replace the renderer's IPC stub. */
export function _setIpcRenderer(ipc: IIpcRenderer | null) {
  cachedIpc = ipc
  portListenerInstalled = null
  pendingPorts.clear()
  arrivedPorts.clear()
}

/** Per-IPC-instance flag so tests with a fresh stub re-install. */
let portListenerInstalled: IIpcRenderer | null = null
const pendingPorts = new Map<string, (port: any) => void>()
const arrivedPorts = new Map<string, any>()

function ensurePortListener(ipc: IIpcRenderer): void {
  if (portListenerInstalled === ipc) {return}
  portListenerInstalled = ipc
  ipc.on(TERMINAL_IPC.PORT_TRANSFER, (event: any, payload: any) => {
    if (
      payload === null ||
      typeof payload !== 'object' ||
      typeof payload.sessionId !== 'string'
    ) {
      return
    }
    const port = Array.isArray(event?.ports) ? event.ports[0] : null
    if (port === null || port === undefined) {return}
    const sid: string = payload.sessionId
    const cb = pendingPorts.get(sid)
    if (cb !== undefined) {
      pendingPorts.delete(sid)
      cb(port)
    } else {
      arrivedPorts.set(sid, port)
    }
  })
}

export async function spawnTerminal(
  repositoryId: number,
  options: IPtyOptions,
  ipc: IIpcRenderer = getIpcRenderer()
): Promise<{ sessionId: string; port: any }> {
  ensurePortListener(ipc)
  const result = (await ipc.invoke(TERMINAL_IPC.SPAWN, {
    repositoryId,
    options,
  })) as { sessionId: string }
  if (
    result === null ||
    typeof result !== 'object' ||
    typeof result.sessionId !== 'string'
  ) {
    throw new Error('Terminal spawn returned an invalid response')
  }
  const sid = result.sessionId
  const arrived = arrivedPorts.get(sid)
  if (arrived !== undefined) {
    arrivedPorts.delete(sid)
    return { sessionId: sid, port: arrived }
  }
  const port: any = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingPorts.delete(sid)
      reject(new Error(`Timed out waiting for terminal port (${sid})`))
    }, 5_000)
    pendingPorts.set(sid, p => {
      clearTimeout(timer)
      resolve(p)
    })
  })
  return { sessionId: sid, port }
}

export async function killTerminal(
  sessionId: string,
  ipc: IIpcRenderer = getIpcRenderer()
): Promise<void> {
  await ipc.invoke(TERMINAL_IPC.KILL, sessionId)
  arrivedPorts.delete(sessionId)
  pendingPorts.delete(sessionId)
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
    liveCwd: null,
    hasActivity: false,
    lastExitCode: null,
    title: null,
  }
}
