/**
 * Owns every active `PtySession`, exposes spawn / kill / resize against
 * stable session ids, and reaps sessions when the underlying shell exits.
 *
 * The class is renderer-agnostic: callers supply the `MessagePortMain` for
 * each new session (the Electron IPC handler does that on the real path,
 * tests pass a fake). The factory abstraction means real `node-pty` can be
 * swapped for the mock in tests.
 */

import {
  IPtyOptions,
  ITerminalSessionSnapshot,
} from '../../lib/terminal/pty-types'
import { IPty, IPtyPort, PtyFactory, PtySession } from './pty-session'

interface ITerminalManagerDeps {
  readonly factory: PtyFactory
  /** Optional clock override (used by tests). */
  readonly now?: () => number
  /** Optional id generator override (used by tests). */
  readonly newId?: () => string
}

let monotonic = 0
const defaultNewId = () =>
  `term-${Date.now().toString(36)}-${(monotonic++).toString(36)}`

export class TerminalManager {
  private readonly deps: ITerminalManagerDeps
  private readonly sessions: Map<string, PtySession> = new Map()

  public constructor(deps: ITerminalManagerDeps) {
    this.deps = deps
  }

  /**
   * Spawn a new session for the given repository. Returns the snapshot of
   * the freshly started session — callers should keep the id to address it.
   */
  public spawn(
    repositoryId: number,
    options: IPtyOptions,
    port: IPtyPort
  ): ITerminalSessionSnapshot {
    const id = (this.deps.newId ?? defaultNewId)()
    const session = new PtySession({
      factory: this.deps.factory,
      port,
      options,
      id,
      repositoryId,
      now: this.deps.now,
    })
    // Register the session BEFORE start() so that an immediate exit
    // (mock PTY in tests, or a shell that fails on launch) cannot leave a
    // dead entry behind: the onExit handler will find and remove it.
    this.sessions.set(id, session)
    session.onExit(snap => {
      this.sessions.delete(snap.id)
    })
    session.start()
    return session.getSnapshot()
  }

  /** Kill an active session. No-op when the id is unknown. */
  public kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session === undefined) {
      return
    }
    session.kill()
    this.sessions.delete(sessionId)
  }

  /** Resize a session. No-op when the id is unknown. */
  public resize(sessionId: string, cols: number, rows: number): void {
    this.sessions.get(sessionId)?.resize(cols, rows)
  }

  /** Get the snapshot for a session, or `null` if the id is unknown. */
  public getSnapshot(sessionId: string): ITerminalSessionSnapshot | null {
    return this.sessions.get(sessionId)?.getSnapshot() ?? null
  }

  /** Number of active sessions (mostly useful for tests + telemetry). */
  public size(): number {
    return this.sessions.size
  }

  /** Kill every active session and clear the map. */
  public killAll(): void {
    for (const session of this.sessions.values()) {
      session.kill()
    }
    this.sessions.clear()
  }
}

// Re-exported so test helpers don't need to dual-import the IPty contract.
export type { IPty, IPtyPort, PtyFactory }
