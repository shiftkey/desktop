import { BaseStore } from './base-store'
import { ITerminalSessionSnapshot } from '../terminal/pty-types'
import { Layout, leaf, splitLeaf, closeSession } from '../terminal/split-layout'

/**
 * Renderer-side state for the integrated terminal panel.
 *
 * Visibility, height, the per-repo tab list, and the currently active
 * session live here. Session metadata is mirrored from the main process
 * when a spawn / exit / resize happens; the high-throughput byte stream
 * does NOT pass through this store — it flows directly between the
 * main-process PTY and the xterm.js instance via a `MessagePort`.
 *
 * Tab model: every repo can own zero or more sessions. Switching repos
 * remembers which session was active for the new repo (`activeByRepoId`)
 * so the user lands back on what they were doing.
 */
export interface ITerminalState {
  readonly visible: boolean
  /** Height in CSS pixels of the panel. Persisted to localStorage. */
  readonly height: number
  /** id of the session currently bound to the visible XtermView, or null. */
  readonly activeSessionId: string | null
  /** Map of every known session keyed by session id. */
  readonly sessions: ReadonlyMap<string, ITerminalSessionSnapshot>
  /** Per-repo ordered list of session ids (the tab strip). */
  readonly tabsByRepoId: ReadonlyMap<number, ReadonlyArray<string>>
  /** Per-repo last-active session id, used when switching repos. */
  readonly activeByRepoId: ReadonlyMap<number, string>
  /** Per-repo split-pane layout tree. */
  readonly layoutByRepoId: ReadonlyMap<number, Layout>
}

const HEIGHT_KEY = 'terminal-panel-height'
const VISIBLE_KEY = 'terminal-panel-visible'
const DEFAULT_HEIGHT = 280
const MIN_HEIGHT = 120
const MAX_HEIGHT = 1200

const EMPTY_STATE: ITerminalState = Object.freeze({
  // Default to visible so the user sees a working terminal on first
  // launch without having to discover the menu/shortcut. Toggled-off
  // state is persisted so a user who explicitly hid it stays hidden.
  visible: true,
  height: DEFAULT_HEIGHT,
  activeSessionId: null,
  sessions: new Map(),
  tabsByRepoId: new Map(),
  activeByRepoId: new Map(),
  layoutByRepoId: new Map(),
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
    const persistedVisible = parseVisible(storage.getItem(VISIBLE_KEY))
    this.state = {
      ...EMPTY_STATE,
      height: persistedHeight ?? EMPTY_STATE.height,
      visible: persistedVisible ?? EMPTY_STATE.visible,
    }
  }

  public getState(): ITerminalState {
    return this.state
  }

  /** Toggle the panel's visibility. Persists the new value. */
  public toggle(): void {
    const next = !this.state.visible
    this.storage.setItem(VISIBLE_KEY, next ? 'visible' : 'hidden')
    this.update({ visible: next })
  }

  public show(): void {
    if (this.state.visible) {
      return
    }
    this.storage.setItem(VISIBLE_KEY, 'visible')
    this.update({ visible: true })
  }

  public hide(): void {
    if (!this.state.visible) {
      return
    }
    this.storage.setItem(VISIBLE_KEY, 'hidden')
    this.update({ visible: false })
  }

  /**
   * Persist a new panel height (clamped to [MIN_HEIGHT, MAX_HEIGHT]) and
   * write it to storage so the next session starts the same way.
   */
  public setHeight(px: number): void {
    const next = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.floor(px)))
    if (next === this.state.height) {
      return
    }
    this.storage.setItem(HEIGHT_KEY, String(next))
    this.update({ height: next })
  }

  /**
   * The user switched repos. Pick the session that was last active for
   * the new repo (or null if it has no tabs yet).
   */
  public selectRepo(repositoryId: number | null): void {
    if (repositoryId === null) {
      this.update({ activeSessionId: null })
      return
    }
    const sid = this.state.activeByRepoId.get(repositoryId) ?? null
    if (sid !== null && this.state.sessions.has(sid)) {
      this.update({ activeSessionId: sid })
      return
    }
    // Fallback: first tab for that repo, if any.
    const tabs = this.state.tabsByRepoId.get(repositoryId) ?? []
    this.update({ activeSessionId: tabs[0] ?? null })
  }

  /** Make the given session the active one (e.g., user clicked a tab). */
  public selectSession(sessionId: string): void {
    if (!this.state.sessions.has(sessionId)) {
      return
    }
    if (this.state.activeSessionId === sessionId) {
      return
    }
    const session = this.state.sessions.get(sessionId)!
    // Clear the activity dot on the tab the user just looked at.
    const sessions = new Map(this.state.sessions)
    sessions.set(sessionId, { ...session, hasActivity: false })
    const activeByRepoId = new Map(this.state.activeByRepoId)
    activeByRepoId.set(session.repositoryId, sessionId)
    this.update({ sessions, activeSessionId: sessionId, activeByRepoId })
  }

  /**
   * Merge a partial OSC-derived patch into a session snapshot. Only the
   * fields present in `patch` are touched; everything else is preserved.
   * No-op when the session is unknown.
   */
  public mergeMeta(
    sessionId: string,
    patch: {
      liveCwd?: string
      lastExitCode?: number
      title?: string
      hasActivity?: boolean
    }
  ): void {
    if (!this.state.sessions.has(sessionId)) {
      return
    }
    const sessions = new Map(this.state.sessions)
    const cur = sessions.get(sessionId)!
    sessions.set(sessionId, {
      ...cur,
      ...(patch.liveCwd !== undefined ? { liveCwd: patch.liveCwd } : {}),
      ...(patch.lastExitCode !== undefined
        ? { lastExitCode: patch.lastExitCode }
        : {}),
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.hasActivity !== undefined
        ? { hasActivity: patch.hasActivity }
        : {}),
    })
    this.update({ sessions })
  }

  /**
   * Flip `hasActivity` on a non-active session so its tab can show an
   * unread-output indicator. No-op when the session is unknown or is
   * already the active one (the user is looking at it).
   */
  public markActivity(sessionId: string): void {
    if (!this.state.sessions.has(sessionId)) {
      return
    }
    if (this.state.activeSessionId === sessionId) {
      return
    }
    this.mergeMeta(sessionId, { hasActivity: true })
  }

  /** Remember a freshly spawned session and make it the active one. */
  public registerSession(snapshot: ITerminalSessionSnapshot): void {
    const sessions = new Map(this.state.sessions)
    sessions.set(snapshot.id, snapshot)

    const tabsByRepoId = new Map(this.state.tabsByRepoId)
    const existing = tabsByRepoId.get(snapshot.repositoryId) ?? []
    if (!existing.includes(snapshot.id)) {
      tabsByRepoId.set(snapshot.repositoryId, [...existing, snapshot.id])
    }

    const activeByRepoId = new Map(this.state.activeByRepoId)
    activeByRepoId.set(snapshot.repositoryId, snapshot.id)

    // Only set a leaf layout when no layout exists yet for the repo.
    // If a layout already exists (split path via applySplit), leave it alone.
    const layoutByRepoId = new Map(this.state.layoutByRepoId)
    if (!layoutByRepoId.has(snapshot.repositoryId)) {
      layoutByRepoId.set(snapshot.repositoryId, leaf(snapshot.id))
    }

    this.update({
      sessions,
      tabsByRepoId,
      activeByRepoId,
      activeSessionId: snapshot.id,
      layoutByRepoId,
    })
  }

  /** Update an existing session (resize, status flip). No-op when unknown. */
  public updateSession(snapshot: ITerminalSessionSnapshot): void {
    if (!this.state.sessions.has(snapshot.id)) {
      return
    }
    const sessions = new Map(this.state.sessions)
    sessions.set(snapshot.id, snapshot)
    this.update({ sessions })
  }

  /**
   * Mark a session as exited (the underlying PTY died) without removing
   * it from the store. The tab survives so the user can see the exit
   * code and choose to restart. No-op when the session is unknown.
   */
  public markExited(sessionId: string, exitCode: number): void {
    if (!this.state.sessions.has(sessionId)) {
      return
    }
    const sessions = new Map(this.state.sessions)
    const cur = sessions.get(sessionId)!
    sessions.set(sessionId, { ...cur, status: 'exited', exitCode })
    this.update({ sessions })
  }

  /**
   * Swap an exited session out for a fresh one in the same tab slot. The
   * new snapshot inherits the position the old one held in the per-repo
   * tab strip and any active references that pointed at the old id are
   * redirected to the new one. No-op when the old session is unknown.
   */
  public replaceSession(
    oldSessionId: string,
    newSnapshot: ITerminalSessionSnapshot
  ): void {
    const cur = this.state.sessions.get(oldSessionId)
    if (cur === undefined) {
      return
    }
    const sessions = new Map(this.state.sessions)
    sessions.delete(oldSessionId)
    sessions.set(newSnapshot.id, newSnapshot)

    const tabsByRepoId = new Map(this.state.tabsByRepoId)
    const tabs = tabsByRepoId.get(cur.repositoryId) ?? []
    const ix = tabs.indexOf(oldSessionId)
    if (ix !== -1) {
      const next = tabs.slice()
      next[ix] = newSnapshot.id
      tabsByRepoId.set(cur.repositoryId, next)
    }

    const activeByRepoId = new Map(this.state.activeByRepoId)
    if (activeByRepoId.get(cur.repositoryId) === oldSessionId) {
      activeByRepoId.set(cur.repositoryId, newSnapshot.id)
    }
    let activeSessionId = this.state.activeSessionId
    if (activeSessionId === oldSessionId) {
      activeSessionId = newSnapshot.id
    }

    this.update({ sessions, tabsByRepoId, activeByRepoId, activeSessionId })
  }

  /**
   * Remove a session (process exited, user closed the tab). Picks the
   * adjacent tab in the same repo as the new active one when the closed
   * tab was active.
   */
  public removeSession(sessionId: string): void {
    if (!this.state.sessions.has(sessionId)) {
      return
    }
    const removed = this.state.sessions.get(sessionId)!

    const sessions = new Map(this.state.sessions)
    sessions.delete(sessionId)

    const tabsByRepoId = new Map(this.state.tabsByRepoId)
    const repoTabs = (tabsByRepoId.get(removed.repositoryId) ?? []).filter(
      id => id !== sessionId
    )
    if (repoTabs.length > 0) {
      tabsByRepoId.set(removed.repositoryId, repoTabs)
    } else {
      tabsByRepoId.delete(removed.repositoryId)
    }

    const activeByRepoId = new Map(this.state.activeByRepoId)
    if (activeByRepoId.get(removed.repositoryId) === sessionId) {
      const fallback = repoTabs[repoTabs.length - 1] ?? null
      if (fallback !== null) {
        activeByRepoId.set(removed.repositoryId, fallback)
      } else {
        activeByRepoId.delete(removed.repositoryId)
      }
    }

    let activeSessionId = this.state.activeSessionId
    if (activeSessionId === sessionId) {
      activeSessionId = activeByRepoId.get(removed.repositoryId) ?? null
    }

    const layoutByRepoId = new Map(this.state.layoutByRepoId)
    const currentLayout = layoutByRepoId.get(removed.repositoryId)
    if (currentLayout !== undefined) {
      const nextLayout = closeSession(currentLayout, sessionId)
      if (nextLayout === null) {
        layoutByRepoId.delete(removed.repositoryId)
      } else {
        layoutByRepoId.set(removed.repositoryId, nextLayout)
      }
    }

    this.update({ sessions, tabsByRepoId, activeByRepoId, activeSessionId, layoutByRepoId })
  }

  /**
   * Move `sessionId` to position `toIndex` in its repo's tab order.
   * No-op when the session or its repo isn't tracked, or when the
   * resulting order is identical. `toIndex` is clamped to the valid
   * range so callers can pass `Number.MAX_SAFE_INTEGER` for "to end".
   */
  public reorderTab(
    repositoryId: number,
    sessionId: string,
    toIndex: number
  ): void {
    const tabs = this.state.tabsByRepoId.get(repositoryId)
    if (!tabs) {
      return
    }
    const ix = tabs.indexOf(sessionId)
    if (ix === -1) {
      return
    }
    const next = tabs.slice()
    next.splice(ix, 1)
    const safeIx = Math.max(0, Math.min(next.length, toIndex))
    next.splice(safeIx, 0, sessionId)
    if (next.length === tabs.length && next.every((id, i) => id === tabs[i])) {
      return
    }
    const tabsByRepoId = new Map(this.state.tabsByRepoId)
    tabsByRepoId.set(repositoryId, next)
    this.update({ tabsByRepoId })
  }

  /** Set a user-visible title on the given session. */
  public setTitle(sessionId: string, title: string): void {
    this.mergeMeta(sessionId, { title })
  }

  /**
   * Split the leaf containing `targetLeafId` and add `newSessionId` as the
   * new pane. No-op when the repo has no layout or the leaf isn't found.
   */
  public applySplit(
    repoId: number,
    targetLeafId: string,
    orientation: 'horizontal' | 'vertical',
    newSessionId: string
  ): void {
    const layout = this.state.layoutByRepoId.get(repoId) ?? leaf(targetLeafId)
    const next = splitLeaf(layout, targetLeafId, orientation, newSessionId)
    if (next === layout) {
      return
    }
    const layoutByRepoId = new Map(this.state.layoutByRepoId)
    layoutByRepoId.set(repoId, next)
    this.update({ layoutByRepoId })
  }

  /**
   * Update the split ratio at the given path within the repo's layout tree.
   * No-op when the repo has no layout or the path doesn't lead to a split node.
   */
  public setSplitRatio(
    repoId: number,
    path: ReadonlyArray<'a' | 'b'>,
    ratio: number
  ): void {
    const layout = this.state.layoutByRepoId.get(repoId)
    if (!layout) {
      return
    }
    const next = updateRatioAtPath(layout, path, ratio)
    if (next === layout) {
      return
    }
    const layoutByRepoId = new Map(this.state.layoutByRepoId)
    layoutByRepoId.set(repoId, next)
    this.update({ layoutByRepoId })
  }

  private update(patch: Partial<ITerminalState>): void {
    this.state = { ...this.state, ...patch }
    this.emitUpdate()
  }
}

function updateRatioAtPath(
  node: Layout,
  path: ReadonlyArray<'a' | 'b'>,
  ratio: number
): Layout {
  if (path.length === 0) {
    if (node.kind !== 'split') {
      return node
    }
    return { ...node, ratio }
  }
  if (node.kind !== 'split') {
    return node
  }
  const [head, ...rest] = path
  const updated = updateRatioAtPath(node[head], rest, ratio)
  if (updated === node[head]) {
    return node
  }
  return { ...node, [head]: updated }
}

function parseHeight(raw: string | null): number | null {
  if (raw === null) {
    return null
  }
  const n = parseInt(raw, 10)
  if (Number.isNaN(n)) {
    return null
  }
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, n))
}

function parseVisible(raw: string | null): boolean | null {
  if (raw === null) {
    return null
  }
  if (raw === 'visible') {
    return true
  }
  if (raw === 'hidden') {
    return false
  }
  return null
}

// Exported for tests.
export const _internals = {
  HEIGHT_KEY,
  VISIBLE_KEY,
  DEFAULT_HEIGHT,
  MIN_HEIGHT,
  MAX_HEIGHT,
  parseHeight,
  parseVisible,
}
