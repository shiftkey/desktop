import { XtermView } from '../../../src/ui/terminal/xterm-view'
import { _palettes } from '../../../src/lib/terminal/terminal-theme'

function makeFakeTerminal(loaded: string[]): any {
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
    terminalFactory: () => makeFakeTerminal(loaded),
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
})
