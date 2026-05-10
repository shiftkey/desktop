import * as React from 'react'

interface IProps {
  readonly visible: boolean
  readonly onClose: () => void
  readonly onFindNext: (text: string) => void
  readonly onFindPrevious: (text: string) => void
}

interface IState {
  readonly text: string
}

/**
 * Inline find bar for the terminal panel. Pure presentational component:
 * owns the search-text input state and dispatches search intents up to
 * the parent, which routes them to the active session's xterm.js search
 * addon.
 */
export class TerminalFindBar extends React.Component<IProps, IState> {
  private inputRef = React.createRef<HTMLInputElement>()
  public state: IState = { text: '' }

  public componentDidUpdate(prevProps: IProps) {
    if (!prevProps.visible && this.props.visible) {
      this.inputRef.current?.focus()
      this.inputRef.current?.select()
    }
  }

  public render() {
    if (!this.props.visible) {
      return null
    }
    return (
      <div className="terminal-find-bar" role="search">
        <input
          ref={this.inputRef}
          type="search"
          className="terminal-find-bar__input"
          placeholder="Find in terminal"
          value={this.state.text}
          onChange={this.onChange}
          onKeyDown={this.onKeyDown}
        />
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Previous match (Shift+Enter)"
          onClick={this.onPrevClick}
        >
          ↑
        </button>
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Next match (Enter)"
          onClick={this.onNextClick}
        >
          ↓
        </button>
        <button
          type="button"
          className="terminal-find-bar__btn"
          aria-label="Close find bar (Esc)"
          onClick={this.props.onClose}
        >
          ×
        </button>
      </div>
    )
  }

  private onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ text: e.target.value })
  }

  private onPrevClick = () => {
    this.props.onFindPrevious(this.state.text)
  }

  private onNextClick = () => {
    this.props.onFindNext(this.state.text)
  }

  private onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      this.props.onClose()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        this.props.onFindPrevious(this.state.text)
      } else {
        this.props.onFindNext(this.state.text)
      }
    }
  }
}
