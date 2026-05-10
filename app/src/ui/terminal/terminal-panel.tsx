import * as React from 'react'
import { ITerminalState } from '../../lib/stores/terminal-store'
import { ITerminalThemeColors } from '../../lib/terminal/terminal-theme'
import { XtermView, IXtermViewPort } from './xterm-view'

interface ITerminalPanelProps {
  readonly state: ITerminalState
  readonly theme: ITerminalThemeColors
  /** Per-session port lookup (held outside the store; ports aren't serializable). */
  readonly portFor: (sessionId: string) => IXtermViewPort | null
  readonly onResize: (heightPx: number) => void
  readonly onCloseClick: () => void
}

/**
 * The slide-up terminal panel. Renders the XtermView for the active session
 * and a small toolbar. The panel is mounted (height: 0) when invisible so
 * the xterm instance survives toggles.
 */
export class TerminalPanel extends React.Component<ITerminalPanelProps> {
  public render() {
    const { state, theme, portFor } = this.props
    if (!state.visible) return null

    const port = state.activeSessionId === null
      ? null
      : portFor(state.activeSessionId)

    return (
      <div
        className="terminal-panel"
        style={{ height: state.height }}
        role="region"
        aria-label="Terminal"
      >
        <div className="terminal-panel__toolbar">
          <span className="terminal-panel__title">
            {this.renderTitle()}
          </span>
          <button
            className="terminal-panel__close"
            onClick={this.props.onCloseClick}
            aria-label="Close terminal"
          >
            ×
          </button>
        </div>
        <div className="terminal-panel__body">
          {port === null ? (
            <div className="terminal-panel__placeholder">
              No active terminal session.
            </div>
          ) : (
            <XtermView port={port} theme={theme} />
          )}
        </div>
      </div>
    )
  }

  private renderTitle(): string {
    const { state } = this.props
    if (state.activeSessionId === null) return 'Terminal'
    const session = state.sessions.get(state.activeSessionId)
    if (!session) return 'Terminal'
    return `Terminal — ${session.shell.split('/').pop() ?? session.shell}`
  }
}
