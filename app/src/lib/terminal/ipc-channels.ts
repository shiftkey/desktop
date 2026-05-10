/**
 * IPC channel name constants for the integrated terminal.
 *
 * Spawn / kill / resize go through the regular ipcMain channel — they are
 * low-frequency. The high-throughput byte stream is carried over a per-session
 * `MessagePort` that the spawn handler transfers via
 * `event.senderFrame.postMessage`, NOT through these channels.
 */
export const TERMINAL_IPC = {
  /** Renderer → Main: request a new PTY. Reply carries `{ sessionId }`. */
  SPAWN: 'terminal/spawn',
  /** Renderer → Main: kill a PTY by session id. */
  KILL: 'terminal/kill',
  /** Renderer → Main: resize an existing PTY. */
  RESIZE: 'terminal/resize',
  /**
   * Main → Renderer: out-of-band port transfer for a freshly spawned session.
   * The renderer receives `{ sessionId }` plus `event.ports[0]` for byte traffic.
   */
  PORT_TRANSFER: 'terminal/port-transfer',
  /** Main → Renderer: PTY exited (also delivered on the per-session port). */
  EXIT: 'terminal/exit',
} as const

export type TerminalIpcChannel = typeof TERMINAL_IPC[keyof typeof TERMINAL_IPC]
