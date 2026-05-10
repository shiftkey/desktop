/**
 * Shared types for the integrated terminal feature.
 *
 * These types live in `app/src/lib/terminal/` so they can be imported from
 * both the main process (where the PTY actually runs) and the renderer
 * process (where xterm.js draws). They are deliberately small and structurally
 * compatible with `MessagePort.postMessage` / `postMessage` transferable
 * payloads.
 */

/** Options used to spawn a PTY. */
export interface IPtyOptions {
  /** Path to the shell executable (e.g. `/usr/bin/zsh`). */
  readonly shell: string
  /** Arguments passed to the shell process. Usually `[]` for an interactive shell. */
  readonly args: ReadonlyArray<string>
  /** Working directory for the new shell. */
  readonly cwd: string
  /** Environment variables for the shell process. */
  readonly env: Readonly<Record<string, string>>
  /** Initial column count. */
  readonly cols: number
  /** Initial row count. */
  readonly rows: number
}

/** Stable status values for a session, exposed to the renderer. */
export type TerminalSessionStatus = 'starting' | 'running' | 'exited'

/** A snapshot of a terminal session as observed by the renderer. */
export interface ITerminalSessionSnapshot {
  /** Stable session id (the renderer uses this to address the session). */
  readonly id: string
  /** Repository id the session belongs to. */
  readonly repositoryId: number
  /** The cwd the shell was spawned in. */
  readonly cwd: string
  /** The resolved shell path (after fallbacks). */
  readonly shell: string
  /** Last known size — kept in state so resize/round-tripping is stable. */
  readonly cols: number
  readonly rows: number
  /** When the session was created (unix milliseconds). */
  readonly createdAt: number
  /** Lifecycle. */
  readonly status: TerminalSessionStatus
  /** Exit code, set only when status === 'exited'. */
  readonly exitCode: number | null
}

/**
 * Messages flowing on the per-session `MessagePort`.
 *
 * Bytes from the PTY are forwarded as `Uint8Array` data frames. Renderer
 * input (keystrokes, paste payloads) is forwarded the same way. Resize
 * events are tagged objects so they don't collide with byte data.
 */
export type TerminalPortMessage =
  | { readonly type: 'data'; readonly bytes: Uint8Array }
  | { readonly type: 'input'; readonly bytes: Uint8Array }
  | { readonly type: 'resize'; readonly cols: number; readonly rows: number }
  | { readonly type: 'exit'; readonly exitCode: number }
