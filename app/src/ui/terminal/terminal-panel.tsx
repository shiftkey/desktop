import * as React from 'react'
import { ITerminalState } from '../../lib/stores/terminal-store'
import { ITerminalThemeColors } from '../../lib/terminal/terminal-theme'
import { XtermView, IXtermViewPort } from './xterm-view'
import { TerminalFindBar } from './terminal-find-bar'
import { TerminalEmptyState } from './terminal-empty-state'
import {
  formatTabLabel,
  shouldShowActivityDot,
  tabStatusIcon,
} from '../../lib/terminal/tab-model'

interface ITerminalPanelProps {
  readonly state: ITerminalState
  /** Repository whose tabs are shown. null => terminal is unavailable. */
  readonly repositoryId: number | null
  readonly theme: ITerminalThemeColors
  /** Per-session port lookup (held outside the store; ports aren't serializable). */
  readonly portFor: (sessionId: string) => IXtermViewPort | null
  readonly onResize: (heightPx: number) => void
  readonly onCloseClick: () => void
  readonly onNewTab: () => void
  readonly onSelectTab: (sessionId: string) => void
  readonly onCloseTab: (sessionId: string) => void
  /**
   * Click handler for diagnostic-style file paths (`src/foo.ts:42:7`)
   * detected in the terminal output. Receives the originating
   * repository + session ids so the resolver can pick the right cwd
   * when the path is relative.
   */
  readonly onFilePathClick?: (
    repositoryId: number | null,
    sessionId: string,
    path: string,
    line: number,
    column: number | null
  ) => void
  /** Drag-to-reorder a tab within the current repo. */
  readonly onReorderTab?: (
    repositoryId: number,
    sessionId: string,
    toIndex: number
  ) => void
  /** Commit a user-supplied tab label. */
  readonly onRenameTab?: (sessionId: string, title: string) => void
  /** Quick-switch by index (Ctrl+1..9). */
  readonly onFocusTabByIndex?: (repositoryId: number, index: number) => void
  /** Cell font size in CSS px, forwarded to every mounted XtermView. */
  readonly fontSize: number
  /** Scrollback line cap, forwarded to every mounted XtermView. */
  readonly scrollback: number
  /**
   * Increment/decrement the font size (positive grows, negative shrinks).
   * Wired to Ctrl+= / Ctrl+-.
   */
  readonly onAdjustFontSize?: (delta: number) => void
  /** Reset the font size to the default. Wired to Ctrl+0. */
  readonly onResetFontSize?: () => void
  /**
   * Restart an exited terminal session — spawns a fresh PTY in the same
   * tab slot. Wired to the exit-overlay button and to window-level Enter
   * when the active session has `status === 'exited'`.
   */
  readonly onRestartTerminal?: (sessionId: string) => void
}

interface ITerminalPanelState {
  /** Drag-in-progress height in CSS px; null = not dragging. */
  readonly dragHeight: number | null
  /** Whether the inline find bar is currently visible. */
  readonly findBarVisible: boolean
  /** Session id whose tab is in inline-rename mode, or null. */
  readonly renamingSessionId: string | null
  /** Current draft text for the inline rename input. */
  readonly renameDraft: string
  /**
   * Set of session ids whose XtermView has been mounted at least once.
   * A session is added here the first time it becomes active, and stays
   * mounted until the session is removed from the store. Inactive
   * sessions that the user never visited do not pay the xterm DOM init
   * cost.
   */
  readonly mountedSessionIds: ReadonlySet<string>
}

/**
 * The slide-up terminal panel.
 *
 * Renders a tab strip across the top showing every session for the
 * currently selected repository, and one `XtermView` per session. Only
 * the active session's xterm is visible — the others are kept mounted
 * (hidden via CSS) so switching tabs preserves scrollback and live
 * processes.
 *
 * The top edge is a resize gutter — drag it to grow/shrink the panel;
 * the final height is reported via `onResize` so the store can persist
 * it across launches.
 */
export class TerminalPanel extends React.Component<
  ITerminalPanelProps,
  ITerminalPanelState
> {
  private static readonly RESIZE_KEY_STEP = 16
  private static readonly RESIZE_MIN = 120
  private static readonly RESIZE_MAX = 1200

  private dragStartY: number | null = null
  private dragStartHeight: number = 0
  /** Per-session refs to mounted XtermView instances, used to drive search. */
  private xtermRefs = new Map<string, React.RefObject<XtermView>>()
  /** Session id of the tab currently being drag-reordered, or null. */
  private dragSessionId: string | null = null

  public constructor(props: ITerminalPanelProps) {
    super(props)
    this.state = {
      dragHeight: null,
      findBarVisible: false,
      renamingSessionId: null,
      renameDraft: '',
      mountedSessionIds:
        props.state.activeSessionId !== null
          ? new Set([props.state.activeSessionId])
          : new Set(),
    }
  }

  public componentDidMount(): void {
    window.addEventListener('keydown', this.handleGlobalKeyDown)
  }

  public componentDidUpdate(_prev: ITerminalPanelProps): void {
    const active = this.props.state.activeSessionId
    const sessions = this.props.state.sessions
    const current = this.state.mountedSessionIds
    const needsAdd = active !== null && !current.has(active)
    const stale = Array.from(current).filter(id => !sessions.has(id))
    if (!needsAdd && stale.length === 0) {
      return
    }
    const next = new Set(current)
    if (needsAdd) {
      next.add(active!)
    }
    for (const id of stale) {
      next.delete(id)
    }
    this.setState({ mountedSessionIds: next })
  }

  public componentWillUnmount(): void {
    this.detachDragListeners()
    window.removeEventListener('keydown', this.handleGlobalKeyDown)
  }

  public render() {
    const { state } = this.props
    if (!state.visible) {
      return null
    }

    const tabIds = this.tabsForCurrentRepo()
    const activeId = state.activeSessionId
    const height = this.state.dragHeight ?? state.height

    return (
      <div
        className="terminal-panel"
        style={{ height }}
        role="region"
        aria-label="Terminal"
      >
        {/*
          The resize gutter has role="separator" + tabIndex=0 + key/mouse
          handlers so it's both keyboard-focusable and drag-resizable.
          ESLint's a11y rules flag interactive listeners on <div>, but the
          element is intentionally interactive via its ARIA role.
        */}
        {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
        <div
          className="terminal-panel__resize"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize terminal panel"
          tabIndex={0}
          onMouseDown={this.onResizeMouseDown}
          onKeyDown={this.onResizeKeyDown}
          title="Drag to resize"
        />
        {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
        <div className="terminal-panel__toolbar">
          <div className="terminal-panel__tabs" role="tablist">
            {tabIds.map(sid => this.renderTab(sid, sid === activeId))}
            <button
              className="terminal-panel__new-tab"
              onClick={this.props.onNewTab}
              aria-label="New terminal"
              title="New terminal"
            >
              +
            </button>
          </div>
          <button
            className="terminal-panel__close"
            onClick={this.props.onCloseClick}
            aria-label="Close terminal"
            title="Close panel"
          >
            ×
          </button>
        </div>
        <TerminalFindBar
          visible={this.state.findBarVisible}
          onClose={this.closeFindBar}
          onFindNext={this.findNextInActive}
          onFindPrevious={this.findPreviousInActive}
        />
        <div className="terminal-panel__body">
          {tabIds.length === 0 && (
            <TerminalEmptyState onNewTab={this.props.onNewTab} />
          )}
          {/*
            Mount one XtermView per session in the entire store, not just
            tabs for the current repo. Switching repos/tabs only flips
            display:block↔none — the React tree (and therefore the
            MessagePort) survives, so the PTY keeps running in the
            background.

            Lazy-mount: only sessions that have been activated at least
            once are rendered. This skips the xterm.js DOM/WebGL init
            cost for tabs the user never visits in a session.
          */}
          {this.renderExitOverlay()}
          {Array.from(state.sessions.keys())
            .filter(sid => this.state.mountedSessionIds.has(sid))
            .map(sid => {
              const ref = this.refForSession(sid)
              return (
                <div
                  key={sid}
                  className="terminal-panel__view"
                  style={{
                    display: sid === activeId ? 'block' : 'none',
                    height: '100%',
                  }}
                >
                  <XtermView
                    ref={ref}
                    port={this.props.portFor(sid)}
                    theme={this.props.theme}
                    fontSize={this.props.fontSize}
                    scrollback={this.props.scrollback}
                    // eslint-disable-next-line react/jsx-no-bind
                    onFilePathClick={
                      this.props.onFilePathClick
                        ? (path, line, col) =>
                            this.props.onFilePathClick!(
                              this.props.repositoryId,
                              sid,
                              path,
                              line,
                              col
                            )
                        : undefined
                    }
                  />
                </div>
              )
            })}
        </div>
      </div>
    )
  }

  private renderExitOverlay() {
    const sid = this.props.state.activeSessionId
    if (sid === null) {
      return null
    }
    const session = this.props.state.sessions.get(sid)
    if (session === undefined || session.status !== 'exited') {
      return null
    }
    return (
      <div
        className="terminal-panel__exit-overlay"
        role="alert"
        key="exit-overlay"
      >
        <span className="terminal-panel__exit-overlay-text">
          Process exited (code {session.exitCode ?? 0}) · Press Enter to restart
        </span>
        {this.props.onRestartTerminal && (
          <button
            type="button"
            className="terminal-panel__exit-overlay-btn"
            onClick={this.onRestartActiveSession}
          >
            Restart
          </button>
        )}
      </div>
    )
  }

  private onRestartActiveSession = () => {
    const sid = this.props.state.activeSessionId
    if (sid === null) {
      return
    }
    this.props.onRestartTerminal?.(sid)
  }

  private renderTab(sessionId: string, active: boolean) {
    const session = this.props.state.sessions.get(sessionId)
    if (session === undefined) {
      return null
    }
    const label = formatTabLabel({
      shell: session.shell,
      liveCwd: session.liveCwd,
      homedir: this.getHomedir(),
      title: session.title,
    })
    const showDot = shouldShowActivityDot({
      active,
      hasActivity: session.hasActivity,
    })
    const icon = tabStatusIcon({
      status: session.status,
      lastExitCode: session.lastExitCode,
      isCommand: false,
    })
    const isRenaming = this.state.renamingSessionId === sessionId

    return (
      <div
        key={sessionId}
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        className={`terminal-panel__tab${active ? ' active' : ''}`}
        draggable={!isRenaming}
        // eslint-disable-next-line react/jsx-no-bind
        onClick={() => this.props.onSelectTab(sessionId)}
        // Middle-click closes — `onAuxClick` isn't in @types/react@16,
        // so we listen on mousedown and gate on `button === 1`.
        // eslint-disable-next-line react/jsx-no-bind
        onMouseDown={e => {
          if (e.button === 1) {
            e.preventDefault()
            this.props.onCloseTab(sessionId)
          }
        }}
        // eslint-disable-next-line react/jsx-no-bind
        onDoubleClick={() =>
          this.beginRename(
            sessionId,
            session.title ?? this.shellOnly(session.shell)
          )
        }
        // eslint-disable-next-line react/jsx-no-bind
        onDragStart={e => this.onTabDragStart(e, sessionId)}
        onDragOver={this.onTabDragOver}
        // eslint-disable-next-line react/jsx-no-bind
        onDrop={e => this.onTabDrop(e, sessionId)}
        // eslint-disable-next-line react/jsx-no-bind
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            this.props.onSelectTab(sessionId)
          }
        }}
      >
        <span
          className={`terminal-panel__tab-status ${icon}`}
          aria-hidden={true}
        />
        {isRenaming ? (
          <input
            autoFocus={true}
            className="terminal-panel__tab-rename"
            value={this.state.renameDraft}
            // eslint-disable-next-line react/jsx-no-bind
            onChange={e => this.setState({ renameDraft: e.target.value })}
            // eslint-disable-next-line react/jsx-no-bind
            onBlur={() => this.commitRename(sessionId)}
            // eslint-disable-next-line react/jsx-no-bind
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault()
                this.commitRename(sessionId)
              } else if (e.key === 'Escape') {
                e.preventDefault()
                this.cancelRename()
              }
            }}
          />
        ) : (
          <span className="terminal-panel__tab-label">{label}</span>
        )}
        {showDot && (
          <span className="terminal-panel__tab-activity" aria-hidden={true} />
        )}
        <button
          className="terminal-panel__tab-close"
          // eslint-disable-next-line react/jsx-no-bind
          onClick={e => {
            e.stopPropagation()
            this.props.onCloseTab(sessionId)
          }}
          aria-label={`Close ${label}`}
          title="Close tab"
        >
          ×
        </button>
      </div>
    )
  }

  private beginRename(sessionId: string, draft: string): void {
    this.setState({ renamingSessionId: sessionId, renameDraft: draft })
  }

  private cancelRename = (): void => {
    this.setState({ renamingSessionId: null, renameDraft: '' })
  }

  private commitRename(sessionId: string): void {
    const trimmed = this.state.renameDraft.trim()
    if (trimmed.length > 0) {
      this.props.onRenameTab?.(sessionId, trimmed)
    }
    this.cancelRename()
  }

  private getHomedir(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const os = require('os') as typeof import('os')
      return os.homedir()
    } catch {
      return ''
    }
  }

  private shellOnly(shellPath: string): string {
    const ix = shellPath.lastIndexOf('/')
    return ix === -1 ? shellPath : shellPath.slice(ix + 1)
  }

  private onTabDragStart = (
    e: React.DragEvent<HTMLDivElement>,
    sessionId: string
  ): void => {
    this.dragSessionId = sessionId
    e.dataTransfer.effectAllowed = 'move'
  }

  private onTabDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (this.dragSessionId === null) {
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  private onTabDrop = (
    e: React.DragEvent<HTMLDivElement>,
    targetSessionId: string
  ): void => {
    e.preventDefault()
    const source = this.dragSessionId
    this.dragSessionId = null
    if (source === null || source === targetSessionId) {
      return
    }
    const repoId = this.props.repositoryId
    if (repoId === null) {
      return
    }
    const tabs = this.props.state.tabsByRepoId.get(repoId) ?? []
    const targetIx = tabs.indexOf(targetSessionId)
    if (targetIx === -1) {
      return
    }
    this.props.onReorderTab?.(repoId, source, targetIx)
  }

  /** Tabs for the currently selected repo, in declaration order. */
  private tabsForCurrentRepo(): ReadonlyArray<string> {
    const repoId = this.props.repositoryId
    if (repoId === null) {
      return []
    }
    return this.props.state.tabsByRepoId.get(repoId) ?? []
  }

  // --- resize gutter ---

  private onResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    this.dragStartY = e.clientY
    this.dragStartHeight = this.props.state.height
    this.setState({ dragHeight: this.dragStartHeight })
    window.addEventListener('mousemove', this.onResizeMove)
    window.addEventListener('mouseup', this.onResizeEnd)
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
  }

  private onResizeMove = (e: MouseEvent) => {
    if (this.dragStartY === null) {
      return
    }
    // Dragging up (smaller clientY) grows the panel — bottom-anchored.
    const delta = this.dragStartY - e.clientY
    const next = clamp(
      this.dragStartHeight + delta,
      TerminalPanel.RESIZE_MIN,
      TerminalPanel.RESIZE_MAX
    )
    this.setState({ dragHeight: next })
  }

  private onResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const STEP = TerminalPanel.RESIZE_KEY_STEP
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.props.onResize(
        clamp(
          this.props.state.height + STEP,
          TerminalPanel.RESIZE_MIN,
          TerminalPanel.RESIZE_MAX
        )
      )
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.props.onResize(
        clamp(
          this.props.state.height - STEP,
          TerminalPanel.RESIZE_MIN,
          TerminalPanel.RESIZE_MAX
        )
      )
    }
  }

  private onResizeEnd = (_e: MouseEvent) => {
    const final = this.state.dragHeight
    this.detachDragListeners()
    this.setState({ dragHeight: null })
    if (final !== null && final !== this.props.state.height) {
      this.props.onResize(final)
    }
  }

  private detachDragListeners(): void {
    window.removeEventListener('mousemove', this.onResizeMove)
    window.removeEventListener('mouseup', this.onResizeEnd)
    if (typeof document !== 'undefined') {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    this.dragStartY = null
  }

  // --- find bar ---

  private refForSession(sid: string): React.RefObject<XtermView> {
    let ref = this.xtermRefs.get(sid)
    if (ref === undefined) {
      ref = React.createRef<XtermView>()
      this.xtermRefs.set(sid, ref)
    }
    return ref
  }

  private toggleFindBar = () => {
    this.setState(s => ({ findBarVisible: !s.findBarVisible }))
  }

  private closeFindBar = () => {
    this.setState({ findBarVisible: false })
  }

  private findNextInActive = (text: string) => {
    const sid = this.props.state.activeSessionId
    if (sid === null) {
      return
    }
    const ref = this.xtermRefs.get(sid)
    ref?.current?.findNext(text)
  }

  private findPreviousInActive = (text: string) => {
    const sid = this.props.state.activeSessionId
    if (sid === null) {
      return
    }
    const ref = this.xtermRefs.get(sid)
    ref?.current?.findPrevious(text)
  }

  private handleGlobalKeyDown = (e: KeyboardEvent) => {
    // Only react when the terminal panel is visible (otherwise we'd
    // intercept the same shortcut elsewhere in the app).
    if (!this.props.state.visible) {
      return
    }
    // Enter on an exited tab triggers a restart. Crucially, we ONLY
    // intercept Enter when the active session is exited — otherwise
    // Enter must reach the xterm so user typing isn't blocked.
    if (
      e.key === 'Enter' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.shiftKey &&
      !e.altKey
    ) {
      const sid = this.props.state.activeSessionId
      if (sid !== null) {
        const session = this.props.state.sessions.get(sid)
        if (
          session !== undefined &&
          session.status === 'exited' &&
          this.props.onRestartTerminal
        ) {
          e.preventDefault()
          this.props.onRestartTerminal(sid)
          return
        }
      }
    }
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      (e.key === 'F' || e.key === 'f')
    ) {
      e.preventDefault()
      this.toggleFindBar()
      return
    }
    // Ctrl+1..9 (no Shift, no Alt) → quick-switch tab inside the
    // current repo. Ctrl+0 / Ctrl+= / Ctrl+- handle font zoom (Task 17).
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1
        const repoId = this.props.repositoryId
        if (repoId !== null && this.props.onFocusTabByIndex) {
          e.preventDefault()
          this.props.onFocusTabByIndex(repoId, idx)
        }
        return
      }
      // Font zoom in: Ctrl+= and Ctrl++ (the unshifted and shifted glyph
      // on the same physical key — different keyboard layouts emit one
      // or the other).
      if (e.key === '=' || e.key === '+') {
        if (this.props.onAdjustFontSize) {
          e.preventDefault()
          this.props.onAdjustFontSize(1)
        }
        return
      }
      // Font zoom out: Ctrl+- (and Ctrl+_ on layouts that send the
      // shifted glyph despite shiftKey being false somehow — defensive).
      if (e.key === '-' || e.key === '_') {
        if (this.props.onAdjustFontSize) {
          e.preventDefault()
          this.props.onAdjustFontSize(-1)
        }
        return
      }
      // Font zoom reset.
      if (e.key === '0') {
        if (this.props.onResetFontSize) {
          e.preventDefault()
          this.props.onResetFontSize()
        }
        return
      }
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
