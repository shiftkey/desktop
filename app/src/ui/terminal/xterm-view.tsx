import * as React from 'react'
import { ITerminalThemeColors } from '../../lib/terminal/terminal-theme'

/**
 * Thin React wrapper that mounts an xterm.js Terminal into a div ref and
 * keeps it bound to a `MessagePort`-shaped object for byte traffic.
 *
 * Important: this component never re-renders on terminal data. The xterm
 * instance owns its DOM. React state changes only flow through here on
 * theme / size / port-binding events.
 */

/** Subset of `MessagePort` used by the view. Tests can pass a fake. */
export interface IXtermViewPort {
  postMessage(message: any, transferables?: any[]): void
  start?(): void
  addEventListener?(
    event: 'message',
    cb: (event: { data: any }) => void
  ): void
  onmessage?: ((event: { data: any }) => void) | null
}

export interface IXtermViewProps {
  /** Active session port; null = render placeholder. */
  readonly port: IXtermViewPort | null
  readonly theme: ITerminalThemeColors
  /** Optional override of the xterm constructor for tests. */
  readonly terminalFactory?: () => IRuntimeTerminal
}

/** Runtime contract for the xterm instance the view manipulates. */
export interface IRuntimeTerminal {
  open(container: HTMLElement): void
  write(data: string | Uint8Array): void
  onData(cb: (data: string) => void): { dispose(): void }
  onResize(cb: (size: { cols: number; rows: number }) => void): {
    dispose(): void
  }
  setOption?(key: string, value: any): void
  options?: Record<string, any>
  cols: number
  rows: number
  dispose(): void
}

interface IXtermViewState {
  readonly mounted: boolean
}

export class XtermView extends React.Component<IXtermViewProps, IXtermViewState> {
  private container = React.createRef<HTMLDivElement>()
  private term: IRuntimeTerminal | null = null
  private dataDispose: { dispose(): void } | null = null
  private boundPort: IXtermViewPort | null = null
  private incomingHandler: ((event: { data: any }) => void) | null = null

  public constructor(props: IXtermViewProps) {
    super(props)
    this.state = { mounted: false }
  }

  public componentDidMount(): void {
    if (this.container.current === null) return
    this.term = this.createTerminal()
    this.term.open(this.container.current)
    this.applyTheme(this.props.theme)
    this.dataDispose = this.term.onData(input => this.sendInput(input))
    this.bindPort(this.props.port)
    this.setState({ mounted: true })
  }

  public componentDidUpdate(prev: IXtermViewProps): void {
    if (prev.port !== this.props.port) {
      this.bindPort(this.props.port)
    }
    if (prev.theme !== this.props.theme && this.term) {
      this.applyTheme(this.props.theme)
    }
  }

  public componentWillUnmount(): void {
    this.dataDispose?.dispose()
    this.dataDispose = null
    this.unbindPort()
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
      />
    )
  }

  // --- helpers (kept package-private for tests via casts) ---

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
      fontFamily:
        '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      scrollback: 5000,
      allowProposedApi: true,
    })
  }

  private applyTheme(theme: ITerminalThemeColors) {
    if (!this.term) return
    if (this.term.options) {
      this.term.options.theme = { ...theme }
    } else if (this.term.setOption) {
      this.term.setOption('theme', { ...theme })
    }
  }

  private bindPort(port: IXtermViewPort | null) {
    this.unbindPort()
    if (port === null) return
    this.boundPort = port
    this.incomingHandler = ({ data }) => {
      if (data === null || typeof data !== 'object') return
      if (data.type === 'data' && this.term) {
        this.term.write(data.bytes)
      }
    }
    if (port.addEventListener) {
      port.addEventListener('message', this.incomingHandler)
    } else {
      port.onmessage = this.incomingHandler
    }
    port.start?.()
  }

  private unbindPort() {
    if (this.boundPort === null) return
    if ((this.boundPort as any).removeEventListener && this.incomingHandler) {
      ;(this.boundPort as any).removeEventListener(
        'message',
        this.incomingHandler
      )
    } else {
      this.boundPort.onmessage = null
    }
    this.boundPort = null
    this.incomingHandler = null
  }

  private sendInput(input: string) {
    if (this.boundPort === null) return
    const buf = Buffer.from(input, 'utf8')
    const bytes = new Uint8Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    this.boundPort.postMessage({ type: 'input', bytes })
  }
}
