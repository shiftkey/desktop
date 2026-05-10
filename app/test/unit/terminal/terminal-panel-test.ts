import { TerminalPanel } from '../../../src/ui/terminal/terminal-panel'
import { ITerminalState } from '../../../src/lib/stores/terminal-store'
import { _palettes } from '../../../src/lib/terminal/terminal-theme'
import { ITerminalSessionSnapshot } from '../../../src/lib/terminal/pty-types'

const baseState: ITerminalState = {
  visible: true,
  height: 240,
  activeSessionId: null,
  sessions: new Map(),
  tabsByRepoId: new Map(),
  activeByRepoId: new Map(),
}

const snap = (
  over: Partial<ITerminalSessionSnapshot> = {}
): ITerminalSessionSnapshot => ({
  id: 'a',
  repositoryId: 1,
  cwd: '/tmp',
  shell: '/usr/bin/zsh',
  cols: 80,
  rows: 24,
  createdAt: 0,
  status: 'running',
  exitCode: null,
  liveCwd: null,
  hasActivity: false,
  lastExitCode: null,
  title: null,
  ...over,
})

function makePanel(state: ITerminalState, repositoryId: number | null = 1) {
  const onResize = jest.fn()
  const onCloseClick = jest.fn()
  const onNewTab = jest.fn()
  const onSelectTab = jest.fn()
  const onCloseTab = jest.fn()
  const portFor: jest.Mock<any, [string]> = jest.fn(
    (_sessionId: string) => null
  )
  const panel = new TerminalPanel({
    state,
    repositoryId,
    theme: _palettes.DARK_THEME,
    portFor,
    onResize,
    onCloseClick,
    onNewTab,
    onSelectTab,
    onCloseTab,
  })
  return {
    panel,
    onResize,
    onCloseClick,
    onNewTab,
    onSelectTab,
    onCloseTab,
    portFor,
  }
}

describe('TerminalPanel', () => {
  it('renders nothing when not visible', () => {
    const { panel } = makePanel({ ...baseState, visible: false })
    expect(panel.render()).toBeNull()
  })

  it('renders the panel container with the supplied height', () => {
    const { panel } = makePanel({ ...baseState, height: 320 })
    const tree: any = panel.render()
    expect(tree.props.style.height).toBe(320)
    expect(tree.props.className).toBe('terminal-panel')
    expect(tree.props['aria-label']).toBe('Terminal')
  })

  it('shows a placeholder body when the current repo has no tabs', () => {
    const { panel } = makePanel(baseState)
    const tree: any = panel.render()
    // root children: [resize, toolbar, findBar, body]
    const body = tree.props.children[3]
    // body children: [placeholder?, viewWrappers]. With no tabs the
    // placeholder is at index 0 and the wrappers array is empty.
    const placeholder = body.props.children[0]
    expect(placeholder.props.className).toBe('terminal-panel__placeholder')
  })

  it('renders one tab per session in the current repo', () => {
    const a = snap({ id: 'a' })
    const b = snap({ id: 'b' })
    const sessions = new Map([
      [a.id, a],
      [b.id, b],
    ])
    const tabsByRepoId = new Map([[1, ['a', 'b']]])
    const { panel } = makePanel({
      ...baseState,
      activeSessionId: 'a',
      sessions,
      tabsByRepoId,
    })
    const tree: any = panel.render()
    const tabStrip = tree.props.children[1].props.children[0]
    // tabs + the new-tab button
    expect(tabStrip.props.children).toHaveLength(2)
    const tabs = tabStrip.props.children[0]
    expect(tabs).toHaveLength(2)
    expect(tabs[0].props['aria-selected']).toBe(true)
    expect(tabs[1].props['aria-selected']).toBe(false)
  })

  it('clicking a tab fires onSelectTab', () => {
    const a = snap({ id: 'a' })
    const b = snap({ id: 'b' })
    const { panel, onSelectTab } = makePanel({
      ...baseState,
      activeSessionId: 'a',
      sessions: new Map([
        [a.id, a],
        [b.id, b],
      ]),
      tabsByRepoId: new Map([[1, ['a', 'b']]]),
    })
    const tree: any = panel.render()
    const tabs = tree.props.children[1].props.children[0].props.children[0]
    tabs[1].props.onClick()
    expect(onSelectTab).toHaveBeenCalledWith('b')
  })

  it('clicking the per-tab close fires onCloseTab and stops propagation', () => {
    const a = snap({ id: 'a' })
    const { panel, onCloseTab, onSelectTab } = makePanel({
      ...baseState,
      activeSessionId: 'a',
      sessions: new Map([[a.id, a]]),
      tabsByRepoId: new Map([[1, ['a']]]),
    })
    const tree: any = panel.render()
    const tab = tree.props.children[1].props.children[0].props.children[0][0]
    const closeBtn = tab.props.children[1]
    const stopProp = jest.fn()
    closeBtn.props.onClick({ stopPropagation: stopProp })
    expect(stopProp).toHaveBeenCalled()
    expect(onCloseTab).toHaveBeenCalledWith('a')
    expect(onSelectTab).not.toHaveBeenCalled()
  })

  it('clicking the + new-tab button fires onNewTab', () => {
    const { panel, onNewTab } = makePanel(baseState)
    const tree: any = panel.render()
    const newTab = tree.props.children[1].props.children[0].props.children[1]
    newTab.props.onClick()
    expect(onNewTab).toHaveBeenCalledTimes(1)
  })

  it('renders one XtermView per tab; only the active one is visible', () => {
    const a = snap({ id: 'a' })
    const b = snap({ id: 'b' })
    const fakePortA = { postMessage: jest.fn(), start: jest.fn() }
    const fakePortB = { postMessage: jest.fn(), start: jest.fn() }
    const { panel, portFor } = makePanel({
      ...baseState,
      activeSessionId: 'b',
      sessions: new Map([
        [a.id, a],
        [b.id, b],
      ]),
      tabsByRepoId: new Map([[1, ['a', 'b']]]),
    })
    portFor.mockImplementation((sid: string) =>
      sid === 'a' ? (fakePortA as any) : (fakePortB as any)
    )
    const tree: any = panel.render()
    // root children: [resize, toolbar, findBar, body]
    const body = tree.props.children[3]
    // body children: [placeholder?, viewWrappers]. When tabs are present
    // the placeholder is `false` (JSX short-circuit) and the wrappers are
    // the array at index 1.
    const wrappers = body.props.children[1] as any[]
    expect(wrappers).toHaveLength(2)
    // First (id=a) is hidden, second (id=b) is visible.
    expect(wrappers[0].props.style.display).toBe('none')
    expect(wrappers[1].props.style.display).toBe('block')
    expect(wrappers[0].props.children.props.port).toBe(fakePortA)
    expect(wrappers[1].props.children.props.port).toBe(fakePortB)
  })

  it('forwards close button click', () => {
    const { panel, onCloseClick } = makePanel(baseState)
    const tree: any = panel.render()
    // toolbar children: [tabs, closeButton]
    const closeButton = tree.props.children[1].props.children[1]
    closeButton.props.onClick()
    expect(onCloseClick).toHaveBeenCalledTimes(1)
  })

  it('renders no tabs when repositoryId is null', () => {
    const { panel } = makePanel(
      {
        ...baseState,
        sessions: new Map([['a', snap({ id: 'a' })]]),
        tabsByRepoId: new Map([[1, ['a']]]),
      },
      null
    )
    const tree: any = panel.render()
    const tabsContainer = tree.props.children[1].props.children[0]
    // first child is the tabs.map output (empty array when no repo)
    expect(tabsContainer.props.children[0]).toEqual([])
  })
})
