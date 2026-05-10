import { BaseStore } from './base-store'
import { ITerminalSessionSnapshot } from '../terminal/pty-types'

/**
 * Renderer-side state for the integrated terminal panel.
 *
 * Visibility, height, and the currently active session (per-repository) live
 * here. Session metadata is mirrored from the main process when a spawn /
 * exit / resize happens; the high-throughput byte stream does NOT pass
 * through this store — it flows directly between the main-process PTY and
 * the xterm.js instance via a `MessagePort`.
 */
export interface ITerminalState {
  readonly visible: boolean
  /** Height in CSS pixels of the panel. Persisted to localStorage. */
  readonly height: number
  /** id of the session currently bound to the visible XtermView, or null. */
  readonly activeSessionId: string | null
  /** Map of every known session keyed by session id. */
  readonly sessions: ReadonlyMap<string, ITerminalSessionSnapshot>
  /** Map of repositoryId → sessionId, so we can switch repos and resume. */
  readonly sessionByRepoId: ReadonlyMap<number, string>
}

const HEIGHT_KEY = 'terminal-panel-height'
const DEFAULT_HEIGHT = 240
const MIN_HEIGHT = 100
const MAX_HEIGHT = 800

const EMPTY_STATE: ITerminalState = Object.freeze({
  visible: false,
  height: DEFAULT_HEIGHT,
  activeSessionId: null,
  sessions: new Map(),
  sessionByRepoId: new Map(),
})

/** Storage adapter for the persisted height — `localStorage`-shaped. */
export interface IHeightStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const noopStore: IHeightStore = {
  getItem: () => null,
  setItem: () => undefined,
}

export class TerminalStore extends BaseStore {
  private state: ITerminalState
  private readonly storage: IHeightStore

  public constructor(storage: IHeightStore = noopStore) {
    super()
    this.storage = storage
    const persistedHeight = parseHeight(storage.getItem(HEIGHT_KEY))
    this.state = {
      ...EMPTY_STATE,
      height: persistedHeight ?? EMPTY_STATE.height,
    }
  }

  public getState(): ITerminalState {
    return this.state
  }

  /** Toggle the panel's visibility. */
  public toggle(): void {
    this.update({ visible: !this.state.visible })
  }

  public show(): void {
    if (this.state.visible) return
    this.update({ visible: true })
  }

  public hide(): void {
    if (!this.state.visible) return
    this.update({ visible: false })
  }

  /**
   * Persist a new panel height (clamped to [MIN_HEIGHT, MAX_HEIGHT]) and
   * write it to storage so the next session starts the same way.
   */
  public setHeight(px: number): void {
    const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.floor(px)))
    if (next === this.state.height) return
    this.storage.setItem(HEIGHT_KEY, String(next))
    this.update({ height: next })
  }

  /** Switch the visible XtermView to the session bound to a repo, or null. */
  public selectRepo(repositoryId: number | null): void {
    if (repositoryId === null) {
      this.update({ activeSessionId: null })
      return
    }
    const sid = this.state.sessionByRepoId.get(repositoryId) ?? null
    this.update({ activeSessionId: sid })
  }

  /** Remember a freshly spawned session and make it the active one. */
  public registerSession(snapshot: ITerminalSessionSnapshot): void {
    const sessions = new Map(this.state.sessions)
    sessions.set(snapshot.id, snapshot)
    const sessionByRepoId = new Map(this.state.sessionByRepoId)
    sessionByRepoId.set(snapshot.repositoryId, snapshot.id)
    this.update({
      sessions,
      sessionByRepoId,
      activeSessionId: snapshot.id,
    })
  }

  /** Update an existing session (resize, status flip). No-op when unknown. */
  public updateSession(snapshot: ITerminalSessionSnapshot): void {
    if (!this.state.sessions.has(snapshot.id)) return
    const sessions = new Map(this.state.sessions)
    sessions.set(snapshot.id, snapshot)
    this.update({ sessions })
  }

  /**
   * Remove a session (process exited, repo removed). Adjusts active session
   * + repo bindings.
   */
  public removeSession(sessionId: string): void {
    if (!this.state.sessions.has(sessionId)) return
    const sessions = new Map(this.state.sessions)
    const removed = sessions.get(sessionId)!
    sessions.delete(sessionId)

    const sessionByRepoId = new Map(this.state.sessionByRepoId)
    if (sessionByRepoId.get(removed.repositoryId) === sessionId) {
      sessionByRepoId.delete(removed.repositoryId)
    }

    const activeSessionId =
      this.state.activeSessionId === sessionId
        ? null
        : this.state.activeSessionId

    this.update({ sessions, sessionByRepoId, activeSessionId })
  }

  private update(patch: Partial<ITerminalState>): void {
    this.state = { ...this.state, ...patch }
    this.emitUpdate()
  }
}

function parseHeight(raw: string | null): number | null {
  if (raw === null) return null
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) return null
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, n))
}

// Exported for tests.
export const _internals = {
  HEIGHT_KEY,
  DEFAULT_HEIGHT,
  MIN_HEIGHT,
  MAX_HEIGHT,
  parseHeight,
}
