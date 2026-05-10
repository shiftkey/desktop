import * as React from 'react'
import { ITerminalState } from '../../lib/stores/terminal-store'
import { ITerminalThemeColors } from '../../lib/terminal/terminal-theme'
import { XtermView, IXtermViewPort } from './xterm-view'
import { TerminalFindBar } from './terminal-find-bar'

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
}

interface ITerminalPanelState {
  /** Drag-in-progress height in CSS px; null = not dragging. */
  readonly dragHeight: number | null
  /** Whether the inline find bar is currently visible. */
  readonly findBarVisible: boolean
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
  private dragStartY: number | null = null
  private dragStartHeight: number = 0
  /** Per-session refs to mounted XtermView instances, used to drive search. */
  private xtermRefs = new Map<string, React.RefObject<XtermView>>()

  public constructor(props: ITerminalPanelProps) {
    super(props)
    this.state = { dragHeight: null, findBarVisible: false }
  }

  public componentDidMount(): void {
    window.addEventListener('keydown', this.handleGlobalKeyDown)
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
        <div
          className="terminal-panel__resize"
          onMouseDown={this.onResizeMouseDown}
          aria-hidden={true}
          title="Drag to resize"
        />
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
            <div className="terminal-panel__placeholder">
              No active terminal session. Click + to start one.
            </div>
          )}
          {/*
            Mount one XtermView per session in the entire store, not just
            tabs for the current repo. Switching repos/tabs only flips
            display:block↔none — the React tree (and therefore the
            MessagePort) survives, so the PTY keeps running in the
            background.
          */}
          {Array.from(state.sessions.keys()).map(sid => {
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

  private renderTab(sessionId: string, active: boolean) {
    const session = this.props.state.sessions.get(sessionId)
    const label =
      session === undefined
        ? 'Terminal'
        : session.shell.split('/').pop() ?? session.shell
    return (
      <div
        key={sessionId}
        role="tab"
        aria-selected={active}
        tabIndex={active ? 0 : -1}
        className={`terminal-panel__tab${active ? ' active' : ''}`}
        onClick={() => this.props.onSelectTab(sessionId)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            this.props.onSelectTab(sessionId)
          }
        }}
      >
        <span className="terminal-panel__tab-label">{label}</span>
        <button
          className="terminal-panel__tab-close"
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
    const next = clamp(this.dragStartHeight + delta, 120, 1200)
    this.setState({ dragHeight: next })
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
    if (
      (e.ctrlKey || e.metaKey) &&
      e.shiftKey &&
      (e.key === 'F' || e.key === 'f')
    ) {
      e.preventDefault()
      this.toggleFindBar()
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
