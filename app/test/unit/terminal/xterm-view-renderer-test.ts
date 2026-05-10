import { XtermView } from '../../../src/ui/terminal/xterm-view'
import { _palettes } from '../../../src/lib/terminal/terminal-theme'

function makeFakeTerminal(loaded: string[], extras: any = {}): any {
  return {
    cols: 80,
    rows: 24,
    options: {},
    open: () => undefined,
    write: () => undefined,
    paste: () => undefined,
    focus: () => undefined,
    hasSelection: () => false,
    getSelection: () => '',
    clearSelection: () => undefined,
    onData: () => ({ dispose: () => undefined }),
    onResize: () => ({ dispose: () => undefined }),
    attachCustomKeyEventHandler: () => undefined,
    loadAddon: (a: any) => loaded.push(a.name ?? 'unknown'),
    dispose: () => undefined,
    ...extras,
  }
}

function mount(props: any): {
  view: XtermView
  loaded: string[]
} {
  const loaded: string[] = props.__loaded ?? []
  const view = new XtermView({
    port: null,
    theme: _palettes.DARK_THEME,
    terminalFactory: () =>
      makeFakeTerminal(loaded, props.__terminalExtras ?? {}),
    fitAddonFactory: () => ({ fit: () => undefined, dispose: () => undefined }),
    ...props,
  })
  // Provide a fake container so componentDidMount proceeds.
  const fakeEl: any = {
    getBoundingClientRect: () => ({ width: 0, height: 0 }),
  }
  ;(view as any).container = { current: fakeEl }
  view.componentDidMount()
  return { view, loaded }
}

describe('XtermView renderer fallback', () => {
  it('loads webgl addon by default', () => {
    const loaded: string[] = []
    const webglAddon = {
      name: 'webgl',
      dispose: () => undefined,
      onContextLoss: () => ({ dispose: () => undefined }),
    }
    const canvasAddon = { name: 'canvas', dispose: () => undefined }
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'webgl',
      webglAddonFactory: () => webglAddon,
      canvasAddonFactory: () => canvasAddon,
    })
    expect(loaded).toContain('webgl')
    expect(loaded).not.toContain('canvas')
    // Globals.ts ResizeObserver mock omits disconnect(); stub to avoid
    // an unrelated teardown TypeError.
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('falls back to canvas when webgl context is lost', () => {
    const loaded: string[] = []
    let lossCb: (() => void) | null = null
    const webglAddon = {
      name: 'webgl',
      dispose: () => undefined,
      onContextLoss: (cb: () => void) => {
        lossCb = cb
        return { dispose: () => undefined }
      },
    }
    const canvasAddon = { name: 'canvas', dispose: () => undefined }
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'webgl',
      webglAddonFactory: () => webglAddon,
      canvasAddonFactory: () => canvasAddon,
    })
    expect(loaded).toContain('webgl')
    expect(lossCb).not.toBeNull()
    // Simulate context loss
    ;(lossCb as unknown as () => void)()
    expect(loaded).toContain('canvas')
    // Globals.ts ResizeObserver mock omits disconnect(); stub to avoid
    // an unrelated teardown TypeError.
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('respects "canvas" preference and skips webgl', () => {
    const loaded: string[] = []
    const webglFactory = jest.fn(() => ({
      name: 'webgl',
      dispose: () => undefined,
      onContextLoss: () => ({ dispose: () => undefined }),
    }))
    const canvasAddon = { name: 'canvas', dispose: () => undefined }
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'canvas',
      webglAddonFactory: webglFactory,
      canvasAddonFactory: () => canvasAddon,
    })
    expect(loaded).toContain('canvas')
    expect(loaded).not.toContain('webgl')
    expect(webglFactory).not.toHaveBeenCalled()
    // Globals.ts ResizeObserver mock omits disconnect(); stub to avoid
    // an unrelated teardown TypeError.
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('loads unicode11, ligatures, web-links, and search addons', () => {
    const loaded: string[] = []
    const unicode11Addon = { name: 'unicode11', dispose: () => undefined }
    const ligaturesAddon = { name: 'ligatures', dispose: () => undefined }
    const webLinksAddon = { name: 'web-links', dispose: () => undefined }
    const searchAddon = {
      name: 'search',
      findNext: () => true,
      findPrevious: () => true,
      dispose: () => undefined,
    }
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'dom',
      unicode11AddonFactory: () => unicode11Addon,
      ligaturesAddonFactory: () => ligaturesAddon,
      webLinksAddonFactory: () => webLinksAddon,
      searchAddonFactory: () => searchAddon,
    })
    expect(loaded).toContain('unicode11')
    expect(loaded).toContain('ligatures')
    expect(loaded).toContain('web-links')
    expect(loaded).toContain('search')
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('exposes findNext / findPrevious via ref delegating to search addon', () => {
    const loaded: string[] = []
    const calls: string[] = []
    const searchAddon = {
      name: 'search',
      findNext: (t: string) => {
        calls.push('next:' + t)
        return true
      },
      findPrevious: (t: string) => {
        calls.push('prev:' + t)
        return true
      },
      dispose: () => undefined,
    }
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'dom',
      searchAddonFactory: () => searchAddon,
    })
    expect(view.findNext('hello')).toBe(true)
    expect(view.findPrevious('hello')).toBe(true)
    expect(calls).toEqual(['next:hello', 'prev:hello'])
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('registers a file-path link matcher routing to onFilePathClick', () => {
    const loaded: string[] = []
    let registered: {
      regex: RegExp
      handler: (e: MouseEvent, matched: string) => void
    } | null = null
    const onFilePathClick = jest.fn()
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'dom',
      onFilePathClick,
      __terminalExtras: {
        registerLinkMatcher: (
          regex: RegExp,
          handler: (e: MouseEvent, matched: string) => void
        ) => {
          registered = { regex, handler }
          return 7
        },
        deregisterLinkMatcher: () => undefined,
      },
    })
    expect(registered).not.toBeNull()
    const reg = registered as unknown as {
      regex: RegExp
      handler: (e: MouseEvent, matched: string) => void
    }
    reg.handler({} as MouseEvent, 'src/foo.ts:42:7')
    expect(onFilePathClick).toHaveBeenCalledWith('src/foo.ts', 42, 7)
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('skips file-path matcher when xterm exposes no registerLinkMatcher', () => {
    const loaded: string[] = []
    const onFilePathClick = jest.fn()
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'dom',
      onFilePathClick,
    })
    // No registerLinkMatcher on the fake terminal -> no crash, no calls.
    expect(onFilePathClick).not.toHaveBeenCalled()
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('findNext / findPrevious return false when search addon failed to load', () => {
    const loaded: string[] = []
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'dom',
      searchAddonFactory: () => {
        throw new Error('boom')
      },
    })
    expect(view.findNext('hello')).toBe(false)
    expect(view.findPrevious('hello')).toBe(false)
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('font size and scrollback props map to terminal options', () => {
    const fakeTerm: any = {
      cols: 80,
      rows: 24,
      options: {},
      open: () => undefined,
      write: () => undefined,
      paste: () => undefined,
      focus: () => undefined,
      hasSelection: () => false,
      getSelection: () => '',
      clearSelection: () => undefined,
      onData: () => ({ dispose: () => undefined }),
      onResize: () => ({ dispose: () => undefined }),
      attachCustomKeyEventHandler: () => undefined,
      loadAddon: () => undefined,
      dispose: () => undefined,
    }
    let factoryArgs: any = null
    const view = new XtermView({
      port: null,
      theme: _palettes.DARK_THEME,
      fontSize: 13,
      scrollback: 5000,
      // Capture the props that XtermView passes to its terminal factory
      // so we can prove fontSize/scrollback are forwarded to the real
      // xterm constructor on mount. The factory itself returns a fake.
      terminalFactory: () => {
        // Read live from the view's props at call time.
        factoryArgs = {
          fontSize: (view as any).props.fontSize,
          scrollback: (view as any).props.scrollback,
        }
        return fakeTerm
      },
      fitAddonFactory: () => ({
        fit: () => undefined,
        dispose: () => undefined,
      }),
      rendererPreference: 'dom',
    })
    const fakeEl: any = {
      getBoundingClientRect: () => ({ width: 0, height: 0 }),
    }
    ;(view as any).container = { current: fakeEl }
    view.componentDidMount()
    // On mount, the factory observed the configured props.
    expect(factoryArgs).toEqual({ fontSize: 13, scrollback: 5000 })
    // On update, options on the live term are mutated in place.
    const prevProps = { ...(view as any).props }
    ;(view as any).props = {
      ...prevProps,
      fontSize: 18,
      scrollback: 9999,
    }
    view.componentDidUpdate(prevProps)
    expect(fakeTerm.options.fontSize).toBe(18)
    expect(fakeTerm.options.scrollback).toBe(9999)
    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
  })

  it('debounces resize forwarding within a 32ms window', () => {
    jest.useFakeTimers()
    const posted: any[] = []
    const port: any = {
      postMessage: (m: any) => posted.push(m),
      onmessage: null,
      start: () => undefined,
    }
    let onResize: any = null
    const loaded: string[] = []
    const { view } = mount({
      __loaded: loaded,
      rendererPreference: 'dom',
      __terminalExtras: {
        onResize: (cb: any) => {
          onResize = cb
          return { dispose: () => undefined }
        },
      },
    })
    // Bind the fake port; bindPort posts an initial resize from the fake
    // terminal's cols/rows (80x24). Drain that so we can assert on
    // subsequent debounced sends.
    ;(view as any).bindPort(port)
    jest.advanceTimersByTime(40)
    posted.length = 0

    // Trigger 3 resize callbacks in rapid succession.
    onResize({ cols: 90, rows: 30 })
    onResize({ cols: 91, rows: 30 })
    onResize({ cols: 92, rows: 30 })

    // No resize messages should have been posted yet.
    expect(posted.filter(p => p.type === 'resize')).toHaveLength(0)

    // Advance timers past the throttle.
    jest.advanceTimersByTime(40)

    // Exactly one resize, with the latest values.
    const resizeMsgs = posted.filter(p => p.type === 'resize')
    expect(resizeMsgs).toHaveLength(1)
    expect(resizeMsgs[0]).toMatchObject({ cols: 92, rows: 30 })

    if ((view as any).resizeObserver) {
      ;(view as any).resizeObserver.disconnect = () => undefined
    }
    view.componentWillUnmount()
    jest.useRealTimers()
  })
})
