import * as React from 'react'
import { ITerminalThemeColors } from '../../lib/terminal/terminal-theme'

/**
 * Thin React wrapper that mounts an xterm.js Terminal into a div ref and
 * keeps it bound to a `MessagePort`-shaped object for byte traffic.
 *
 * Important: this component never re-renders on terminal data. The xterm
 * instance owns its DOM. React state changes only flow through here on
 * theme / size / port-binding events.
 *
 * The view also handles:
 *   - FitAddon: continuously sizes xterm to its container so the prompt
 *     fills the panel width and `clear` doesn't leave dead space.
 *   - Resize forwarding: when the container changes size, the new
 *     cols/rows are posted to the PTY over the message port.
 *   - Clipboard: Ctrl+Shift+C copies the selection, Ctrl+Shift+V pastes
 *     from the system clipboard. Right-click also copies/pastes.
 */

/** Subset of `MessagePort` used by the view. Tests can pass a fake. */
export interface IXtermViewPort {
  onmessage?: ((event: { data: any }) => void) | null
  postMessage(message: any, transferables?: any[]): void
  start?(): void
  addEventListener?(event: 'message', cb: (event: { data: any }) => void): void
}

export interface IXtermViewProps {
  /** Active session port; null = render placeholder. */
  readonly port: IXtermViewPort | null
  readonly theme: ITerminalThemeColors
  /** Optional override of the xterm constructor for tests. */
  readonly terminalFactory?: () => IRuntimeTerminal
  /**
   * Optional override of the FitAddon factory for tests. Default loads
   * the real `@xterm/addon-fit`.
   */
  readonly fitAddonFactory?: () => IRuntimeFitAddon
  /**
   * Optional override of the clipboard adapter for tests. Default uses
   * Electron's native `clipboard` module.
   */
  readonly clipboard?: IClipboard
}

/** Runtime contract for the xterm instance the view manipulates. */
export interface IRuntimeTerminal {
  options?: Record<string, any>
  cols: number
  rows: number
  open(container: HTMLElement): void
  write(data: string | Uint8Array): void
  paste(data: string): void
  focus(): void
  hasSelection(): boolean
  getSelection(): string
  clearSelection(): void
  onData(cb: (data: string) => void): { dispose(): void }
  onResize(cb: (size: { cols: number; rows: number }) => void): {
    dispose(): void
  }
  attachCustomKeyEventHandler(handler: (e: KeyboardEvent) => boolean): void
  loadAddon(addon: any): void
  setOption?(key: string, value: any): void
  dispose(): void
}

export interface IRuntimeFitAddon {
  fit(): void
  dispose?(): void
}

export interface IClipboard {
  readText(): string
  writeText(text: string): void
}

const defaultClipboard: IClipboard = {
  readText: () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { clipboard } = require('electron')
      return clipboard.readText()
    } catch {
      return ''
    }
  },
  writeText: (text: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { clipboard } = require('electron')
      clipboard.writeText(text)
    } catch {
      // ignore — fall through to xterm's native bridge if any
    }
  },
}

export class XtermView extends React.Component<IXtermViewProps> {
  private container = React.createRef<HTMLDivElement>()
  private term: IRuntimeTerminal | null = null
  private fitAddon: IRuntimeFitAddon | null = null
  private dataDispose: { dispose(): void } | null = null
  private resizeDispose: { dispose(): void } | null = null
  private resizeObserver: ResizeObserver | null = null
  private boundPort: IXtermViewPort | null = null
  private incomingHandler: ((event: { data: any }) => void) | null = null
  private boundUsedAddEventListener = false
  private clipboard: IClipboard

  public constructor(props: IXtermViewProps) {
    super(props)
    this.clipboard = props.clipboard ?? defaultClipboard
  }

  public componentDidMount(): void {
    if (this.container.current === null) {
      return
    }
    this.term = this.createTerminal()
    this.fitAddon = this.createFitAddon()
    if (this.fitAddon !== null) {
      this.term.loadAddon(this.fitAddon)
    }
    this.term.attachCustomKeyEventHandler(this.handleKeyEvent)
    this.term.open(this.container.current)
    this.applyTheme(this.props.theme)
    this.dataDispose = this.term.onData(input => this.sendInput(input))
    this.resizeDispose = this.term.onResize(size => this.sendResize(size))
    // Initial fit + resize forwarding.
    this.fitNow()
    // Observe container size changes so xterm tracks the panel as the
    // user drags the resize gutter, the window resizes, or the parent
    // layout shifts.
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.fitNow())
      this.resizeObserver.observe(this.container.current)
    }
    this.bindPort(this.props.port)
  }

  public componentDidUpdate(prevProps: IXtermViewProps): void {
    if (prevProps.port !== this.props.port) {
      this.bindPort(this.props.port)
      // Re-fit when a new port binds — the container may have changed
      // between display:none and display:block, and xterm's geometry
      // numbers go stale while hidden.
      this.fitNow()
    }
    if (prevProps.theme !== this.props.theme && this.term) {
      this.applyTheme(this.props.theme)
    }
  }

  public componentWillUnmount(): void {
    this.dataDispose?.dispose()
    this.dataDispose = null
    this.resizeDispose?.dispose()
    this.resizeDispose = null
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.unbindPort()
    this.fitAddon?.dispose?.()
    this.fitAddon = null
    this.term?.dispose()
    this.term = null
  }

  public render() {
    return (
      <div
        ref={this.container}
        className="xterm-view"
        role="application"
        aria-label="Integrated terminal"
        onContextMenu={this.onContextMenu}
      />
    )
  }

  // --- helpers ---

  private createTerminal(): IRuntimeTerminal {
    if (this.props.terminalFactory) {
      return this.props.terminalFactory()
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Terminal } = require('@xterm/xterm') as {
      Terminal: new (opts?: any) => IRuntimeTerminal
    }
    return new Terminal({
      fontSize: 13,
      fontFamily: '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      scrollback: 5000,
      allowProposedApi: true,
      cursorBlink: true,
      // Keep selection visible after copy so the user can reselect.
      // (Manually cleared by Ctrl+Shift+C in the key handler if desired.)
    })
  }

  private createFitAddon(): IRuntimeFitAddon | null {
    if (this.props.fitAddonFactory) {
      return this.props.fitAddonFactory()
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { FitAddon } = require('@xterm/addon-fit') as {
        FitAddon: new () => IRuntimeFitAddon
      }
      return new FitAddon()
    } catch {
      // FitAddon is a dep but its native binding fallback is best-effort.
      return null
    }
  }

  private applyTheme(theme: ITerminalThemeColors) {
    if (!this.term) {
      return
    }
    if (this.term.options) {
      this.term.options.theme = { ...theme }
    } else if (this.term.setOption) {
      this.term.setOption('theme', { ...theme })
    }
  }

  private fitNow(): void {
    if (this.term === null || this.fitAddon === null) {
      return
    }
    if (this.container.current === null) {
      return
    }
    // The container might be display:none (inactive tab); fit() throws
    // or no-ops on a 0×0 container. Skip silently.
    const rect = this.container.current.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return
    }
    try {
      this.fitAddon.fit()
    } catch {
      // FitAddon throws on extremely small containers; ignore.
    }
  }

  private bindPort(port: IXtermViewPort | null) {
    this.unbindPort()
    if (port === null) {
      return
    }
    this.boundPort = port
    this.incomingHandler = ({ data }) => {
      if (data === null || typeof data !== 'object') {
        return
      }
      if (data.type === 'data' && this.term) {
        this.term.write(data.bytes)
      }
    }
    if (typeof port.addEventListener === 'function') {
      port.addEventListener('message', this.incomingHandler)
      this.boundUsedAddEventListener = true
    } else {
      port.onmessage = this.incomingHandler
      this.boundUsedAddEventListener = false
    }
    port.start?.()
    // After binding, send the current size so the PTY lines up with what
    // xterm has rendered (avoids the "random text on launch" symptom that
    // happens when the shell prints at default 80x24 into a much wider
    // panel).
    if (this.term) {
      this.sendResize({ cols: this.term.cols, rows: this.term.rows })
    }
  }

  private unbindPort() {
    if (this.boundPort === null) {
      return
    }
    const port: any = this.boundPort
    if (this.boundUsedAddEventListener) {
      if (
        typeof port.removeEventListener === 'function' &&
        this.incomingHandler !== null
      ) {
        port.removeEventListener('message', this.incomingHandler)
      }
    } else {
      port.onmessage = null
    }
    this.boundPort = null
    this.incomingHandler = null
    this.boundUsedAddEventListener = false
  }

  private sendInput(input: string) {
    if (this.boundPort === null) {
      return
    }
    const buf = Buffer.from(input, 'utf8')
    const bytes = new Uint8Array(buf)
    this.boundPort.postMessage({ type: 'input', bytes })
  }

  private sendResize(size: { cols: number; rows: number }) {
    if (this.boundPort === null) {
      return
    }
    const cols = Math.max(1, Math.floor(size.cols))
    const rows = Math.max(1, Math.floor(size.rows))
    try {
      this.boundPort.postMessage({ type: 'resize', cols, rows })
    } catch {
      // Port may have closed between checks; not actionable.
    }
  }

  /**
   * Custom key handler.
   *
   * Returning `false` prevents xterm from consuming the event so the
   * browser default fires — useful for letting a paste land via xterm's
   * internal paste pipeline (which we do here explicitly via `paste()`
   * instead, returning false to swallow the original key).
   */
  private handleKeyEvent = (e: KeyboardEvent): boolean => {
    if (e.type !== 'keydown') {
      return true
    }
    const ctrl = e.ctrlKey || e.metaKey
    if (!ctrl || !e.shiftKey) {
      return true
    }
    if (e.key === 'C' || e.key === 'c') {
      if (this.term && this.term.hasSelection()) {
        const sel = this.term.getSelection()
        if (sel.length > 0) {
          this.clipboard.writeText(sel)
          // Don't clear the selection — let the user re-select if they
          // want to copy more lines.
          return false
        }
      }
      return true
    }
    if (e.key === 'V' || e.key === 'v') {
      const text = this.clipboard.readText()
      if (text.length > 0 && this.term) {
        this.term.paste(text)
      }
      return false
    }
    return true
  }

  /**
   * Right-click: if the user has selected text, copy it; otherwise, paste
   * from the clipboard. Mirrors the convention from PuTTY/Windows
   * Terminal/GNOME Terminal.
   */
  private onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!this.term) {
      return
    }
    if (this.term.hasSelection()) {
      const sel = this.term.getSelection()
      if (sel.length > 0) {
        this.clipboard.writeText(sel)
        this.term.clearSelection()
      }
      return
    }
    const text = this.clipboard.readText()
    if (text.length > 0) {
      this.term.paste(text)
    }
  }
}
