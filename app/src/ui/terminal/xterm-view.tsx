import * as React from 'react'
import { ITerminalThemeColors } from '../../lib/terminal/terminal-theme'
import {
  filePathRegex,
  parseFilePathMatch,
} from '../../lib/terminal/link-matchers'
import { OscParser } from '../../lib/terminal/osc-parser'
import {
  CommandBlockTracker,
  ICommandBlock,
  extractBlockText,
} from '../../lib/terminal/command-blocks'

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

/** Renderer backend selection for the xterm.js view. */
export type RendererPreference = 'webgl' | 'canvas' | 'dom'

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
  /**
   * Renderer preference. Default `'webgl'` with auto-fallback to canvas
   * on WebGL context loss or load failure. `'canvas'` skips WebGL and
   * loads the canvas addon directly. `'dom'` loads neither, leaving
   * xterm's built-in DOM renderer in place.
   */
  readonly rendererPreference?: RendererPreference
  /** Test injection: produce a WebGL addon. */
  readonly webglAddonFactory?: () => any
  /** Test injection: produce a Canvas addon. */
  readonly canvasAddonFactory?: () => any
  /** Test injection: produce a Unicode11 addon. */
  readonly unicode11AddonFactory?: () => any
  /** Test injection: produce a Ligatures addon. */
  readonly ligaturesAddonFactory?: () => any
  /** Test injection: produce a WebLinks addon. */
  readonly webLinksAddonFactory?: () => any
  /** Test injection: produce a Search addon. */
  readonly searchAddonFactory?: () => any
  /**
   * Cell font size in CSS px. Applied to xterm options on mount and
   * re-applied (with a re-fit) when the prop changes. Defaults to 13.
   */
  readonly fontSize?: number
  /**
   * Maximum scrollback line count retained by xterm. Applied on mount
   * and on prop change. Defaults to 5000.
   */
  readonly scrollback?: number
  /**
   * Click handler for clickable diagnostic-style file paths printed by
   * the shell (e.g. `src/foo.ts:42:7`). Invoked with the parsed path,
   * line, and column. When unset the matcher is not registered.
   */
  readonly onFilePathClick?: (
    path: string,
    line: number,
    column: number | null
  ) => void
  /**
   * Called instead of a direct paste when the pasted text meets the
   * multi-line / long-line threshold. The caller is expected to show a
   * confirmation dialog and, if confirmed, call `this.terminal.paste(text)`
   * or send the text via the session port.
   */
  readonly onPasteConfirmRequired?: (text: string) => void
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
  private static readonly RESIZE_THROTTLE_MS = 32

  private container = React.createRef<HTMLDivElement>()
  private term: IRuntimeTerminal | null = null
  private fitAddon: IRuntimeFitAddon | null = null
  private webglAddon: any | null = null
  private canvasAddon: any | null = null
  private unicode11Addon: any | null = null
  private ligaturesAddon: any | null = null
  private webLinksAddon: any | null = null
  private searchAddon: any | null = null
  private fileLinkMatcherId: number | null = null
  private dataDispose: { dispose(): void } | null = null
  private resizeDispose: { dispose(): void } | null = null
  private resizeObserver: ResizeObserver | null = null
  private boundPort: IXtermViewPort | null = null
  private incomingHandler: ((event: { data: any }) => void) | null = null
  private boundUsedAddEventListener = false
  private clipboard: IClipboard
  private pendingResize: { cols: number; rows: number } | null = null
  private resizeTimer: ReturnType<typeof setTimeout> | null = null
  private pasteHandler: ((e: ClipboardEvent) => void) | null = null
  /** Cached element to which `pasteHandler` was attached. Avoids a null-ref at detach time. */
  private pasteTarget: HTMLDivElement | null = null

  /** OSC sequence parser — feeds command-block boundary events. */
  private oscParser = new OscParser()
  /** Tracks completed Warp-style command blocks from OSC 133 events. */
  private blockTracker = new CommandBlockTracker(
    () => (this.term as any)?.buffer?.active?.cursorY ?? 0
  )
  /** Snapshot of completed blocks used by renderGutter(). */
  private commandBlocks: ReadonlyArray<ICommandBlock> = []

  public constructor(props: IXtermViewProps) {
    super(props)
    this.clipboard = props.clipboard ?? defaultClipboard
    this.oscParser.onEvent(evt => {
      this.blockTracker.handle(evt)
      if (evt.type === 'command-end') {
        this.commandBlocks = this.blockTracker.getBlocks()
        this.forceUpdate()
      }
    })
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
    this.installRenderer(this.props.rendererPreference ?? 'webgl')
    this.installPassiveAddons()
    this.installFileLinkMatcher()
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
    this.attachPasteInterceptor()
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
    if (this.term) {
      if (
        prevProps.fontSize !== this.props.fontSize &&
        this.props.fontSize !== undefined
      ) {
        if (this.term.options) {
          this.term.options.fontSize = this.props.fontSize
        } else if (this.term.setOption) {
          this.term.setOption('fontSize', this.props.fontSize)
        }
        // Re-fit so cell math updates after the font size change.
        this.fitNow()
      }
      if (
        prevProps.scrollback !== this.props.scrollback &&
        this.props.scrollback !== undefined
      ) {
        if (this.term.options) {
          this.term.options.scrollback = this.props.scrollback
        } else if (this.term.setOption) {
          this.term.setOption('scrollback', this.props.scrollback)
        }
      }
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
    this.webglAddon?.dispose?.()
    this.canvasAddon?.dispose?.()
    this.webglAddon = null
    this.canvasAddon = null
    this.unicode11Addon?.dispose?.()
    this.ligaturesAddon?.dispose?.()
    this.webLinksAddon?.dispose?.()
    this.searchAddon?.dispose?.()
    this.unicode11Addon = null
    this.ligaturesAddon = null
    this.webLinksAddon = null
    this.searchAddon = null
    this.deregisterFileLinkMatcher()
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer)
      this.resizeTimer = null
    }
    this.pendingResize = null
    this.detachPasteInterceptor()
    this.term?.dispose()
    this.term = null
  }

  /**
   * Paste `text` directly into the terminal (bypasses the paste-guard).
   * Used by TerminalPanel after the user confirms a bracketed-paste dialog
   * when no session port is available.
   */
  public pasteText(text: string): void {
    this.term?.paste(text)
  }

  /**
   * Focus the terminal so keystrokes reach the PTY.
   *
   * xterm.js routes keyboard input through a hidden helper `<textarea>`;
   * until that textarea is focused, typing goes to the rest of the app
   * and the terminal looks unresponsive. `TerminalPanel` calls this when
   * the panel becomes visible or the active tab changes so the user can
   * type immediately without first clicking into the view. No-op before
   * mount.
   */
  public focus(): void {
    this.term?.focus()
  }

  /**
   * Find the next occurrence of `text` in the terminal buffer. Returns
   * `false` when the search addon failed to load or threw.
   */
  public findNext(text: string): boolean {
    if (this.searchAddon === null) {
      return false
    }
    try {
      return Boolean(this.searchAddon.findNext(text))
    } catch {
      return false
    }
  }

  /**
   * Find the previous occurrence of `text` in the terminal buffer. Returns
   * `false` when the search addon failed to load or threw.
   */
  public findPrevious(text: string): boolean {
    if (this.searchAddon === null) {
      return false
    }
    try {
      return Boolean(this.searchAddon.findPrevious(text))
    } catch {
      return false
    }
  }

  public render() {
    return (
      <div className="xterm-view-wrapper">
        {this.renderGutter()}
        <div
          ref={this.container}
          className="xterm-view"
          role="application"
          aria-label="Integrated terminal"
          onContextMenu={this.onContextMenu}
        />
      </div>
    )
  }

  private renderGutter(): JSX.Element | null {
    if (this.commandBlocks.length === 0) {
      return null
    }
    return (
      <div className="xterm-gutter" aria-hidden="true">
        {this.commandBlocks.map((block, i) => (
          <button
            key={i}
            className={`xterm-block-marker ${
              block.exitCode === 0 ? 'success' : 'failure'
            }`}
            aria-label="Copy block output"
            // eslint-disable-next-line react/jsx-no-bind
            onClick={() => this.copyBlock(block)}
          />
        ))}
      </div>
    )
  }

  private copyBlock(block: ICommandBlock): void {
    if (!this.term) {
      return
    }
    const term = this.term as any
    const getLineText = (row: number): string => {
      try {
        return term.buffer?.active?.getLine(row)?.translateToString(true) ?? ''
      } catch {
        return ''
      }
    }
    const text = extractBlockText(getLineText, block)
    navigator.clipboard.writeText(text).catch(() => {
      // fall back to Electron clipboard
      this.clipboard.writeText(text)
    })
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
      fontSize: this.props.fontSize ?? 13,
      fontFamily: '"SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
      scrollback: this.props.scrollback ?? 5000,
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

  private installRenderer(pref: RendererPreference): void {
    if (!this.term) {
      return
    }
    if (pref === 'dom') {
      return
    }
    if (pref === 'canvas') {
      this.installCanvas()
      return
    }
    this.installWebgl()
  }

  private installWebgl(): void {
    try {
      const factory =
        this.props.webglAddonFactory ??
        (() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { WebglAddon } = require('@xterm/addon-webgl')
          return new WebglAddon()
        })
      const addon = factory()
      this.term!.loadAddon(addon)
      this.webglAddon = addon
      if (typeof addon.onContextLoss === 'function') {
        addon.onContextLoss(() => {
          try {
            addon.dispose?.()
          } catch {
            // ignore
          }
          this.webglAddon = null
          this.installCanvas()
        })
      }
    } catch (err) {
      log.warn(
        '[xterm] webgl init failed; falling back to canvas',
        err as Error
      )
      this.installCanvas()
    }
  }

  private installCanvas(): void {
    if (this.canvasAddon !== null) {
      return
    }
    try {
      const factory =
        this.props.canvasAddonFactory ??
        (() => {
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { CanvasAddon } = require('@xterm/addon-canvas')
          return new CanvasAddon()
        })
      const addon = factory()
      this.term!.loadAddon(addon)
      this.canvasAddon = addon
    } catch (err) {
      log.warn('[xterm] canvas init failed; using DOM renderer', err as Error)
    }
  }

  private installPassiveAddons(): void {
    if (!this.term) {
      return
    }
    this.unicode11Addon = this.makePassiveAddon(
      'unicode11',
      this.props.unicode11AddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Unicode11Addon } = require('@xterm/addon-unicode11')
        return new Unicode11Addon()
      }
    )
    if (this.unicode11Addon !== null) {
      // Activate Unicode 11 width tables on the terminal so emoji and CJK
      // glyphs measure correctly.
      try {
        const t = this.term as any
        if (t.unicode) {
          t.unicode.activeVersion = '11'
        }
      } catch {
        // older xterm builds may not expose .unicode — non-fatal
      }
    }
    this.ligaturesAddon = this.makePassiveAddon(
      'ligatures',
      this.props.ligaturesAddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { LigaturesAddon } = require('@xterm/addon-ligatures')
        return new LigaturesAddon()
      }
    )
    this.webLinksAddon = this.makePassiveAddon(
      'web-links',
      this.props.webLinksAddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { WebLinksAddon } = require('@xterm/addon-web-links')
        return new WebLinksAddon()
      }
    )
    this.searchAddon = this.makePassiveAddon(
      'search',
      this.props.searchAddonFactory,
      () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { SearchAddon } = require('@xterm/addon-search')
        return new SearchAddon()
      }
    )
  }

  private makePassiveAddon(
    label: string,
    injected: (() => any) | undefined,
    defaultFactory: () => any
  ): any | null {
    if (!this.term) {
      return null
    }
    try {
      const factory = injected ?? defaultFactory
      const addon = factory()
      this.term.loadAddon(addon)
      return addon
    } catch (err) {
      log.warn(`[xterm] ${label} addon failed`, err as Error)
      return null
    }
  }

  /**
   * Register a custom link matcher for diagnostic-style file paths
   * (e.g. `src/foo.ts:42:7`). Routes matches to `onFilePathClick`.
   *
   * Uses xterm's older `registerLinkMatcher` API. Newer xterm versions
   * removed this in favor of `registerLinkProvider`; if the API isn't
   * available we silently no-op — file paths just won't be clickable
   * until the link-provider migration lands.
   */
  private installFileLinkMatcher(): void {
    if (this.term === null || this.props.onFilePathClick === undefined) {
      return
    }
    const handler = this.props.onFilePathClick
    try {
      const t = this.term as any
      if (typeof t.registerLinkMatcher !== 'function') {
        log.debug(
          '[xterm] registerLinkMatcher unavailable; file-path links disabled'
        )
        return
      }
      // Per-instance regex (no shared `g` state across calls).
      const regex = new RegExp(filePathRegex.source, 'g')
      this.fileLinkMatcherId = t.registerLinkMatcher(
        regex,
        (_event: MouseEvent, matched: string) => {
          const m = parseFilePathMatch(matched)
          if (m === null) {
            return
          }
          handler(m.path, m.line, m.column)
        }
      )
    } catch (err) {
      log.warn('[xterm] file-link matcher failed', err as Error)
    }
  }

  private deregisterFileLinkMatcher(): void {
    if (this.term === null || this.fileLinkMatcherId === null) {
      this.fileLinkMatcherId = null
      return
    }
    try {
      const t = this.term as any
      if (typeof t.deregisterLinkMatcher === 'function') {
        t.deregisterLinkMatcher(this.fileLinkMatcherId)
      }
    } catch {
      // best-effort
    }
    this.fileLinkMatcherId = null
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
        if (data.bytes instanceof Uint8Array) {
          this.oscParser.feed(data.bytes)
        }
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
    this.pendingResize = {
      cols: Math.max(1, Math.floor(size.cols)),
      rows: Math.max(1, Math.floor(size.rows)),
    }
    if (this.resizeTimer === null) {
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null
        const out = this.pendingResize
        this.pendingResize = null
        if (out === null || this.boundPort === null) {
          return
        }
        try {
          this.boundPort.postMessage({
            type: 'resize',
            cols: out.cols,
            rows: out.rows,
          })
        } catch {
          // port can close between schedule and fire — not actionable
        }
      }, XtermView.RESIZE_THROTTLE_MS)
    }
  }

  /**
   * Returns true when `text` exceeds the bracketed-paste guard threshold:
   * any paste with more than one newline, or a single-newline paste whose
   * total character count exceeds 80.
   */
  // eslint-disable-next-line @typescript-eslint/member-ordering
  private static needsPasteConfirm(text: string): boolean {
    if (!text.includes('\n')) {
      return false
    }
    const newlineCount = (text.match(/\n/g) ?? []).length
    return newlineCount > 1 || text.length > 80
  }

  private attachPasteInterceptor(): void {
    const el = this.container.current
    if (el === null || this.pasteHandler !== null) {
      return
    }
    this.pasteTarget = el
    this.pasteHandler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') ?? ''
      if (text.length === 0) {
        return
      }
      if (
        XtermView.needsPasteConfirm(text) &&
        this.props.onPasteConfirmRequired
      ) {
        e.preventDefault()
        e.stopPropagation()
        this.props.onPasteConfirmRequired(text)
      }
      // Otherwise let the event fall through to xterm's own paste handling.
    }
    el.addEventListener('paste', this.pasteHandler)
  }

  private detachPasteInterceptor(): void {
    if (this.pasteHandler === null) {
      return
    }
    this.pasteTarget?.removeEventListener('paste', this.pasteHandler)
    this.pasteTarget = null
    this.pasteHandler = null
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
        if (
          XtermView.needsPasteConfirm(text) &&
          this.props.onPasteConfirmRequired
        ) {
          this.props.onPasteConfirmRequired(text)
        } else {
          this.term.paste(text)
        }
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
      if (
        XtermView.needsPasteConfirm(text) &&
        this.props.onPasteConfirmRequired
      ) {
        this.props.onPasteConfirmRequired(text)
      } else {
        this.term.paste(text)
      }
    }
  }
}
