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

function makePanel(
  state: ITerminalState,
  repositoryId: number | null = 1,
  extras: {
    onFilePathClick?: jest.Mock
    onReorderTab?: jest.Mock
    onRenameTab?: jest.Mock
    onFocusTabByIndex?: jest.Mock
    onAdjustFontSize?: jest.Mock
    onResetFontSize?: jest.Mock
    homedir?: string
  } = {}
) {
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
    fontSize: 13,
    scrollback: 5000,
    portFor,
    onResize,
    onCloseClick,
    onNewTab,
    onSelectTab,
    onCloseTab,
    onFilePathClick: extras.onFilePathClick,
    onReorderTab: extras.onReorderTab,
    onRenameTab: extras.onRenameTab,
    onFocusTabByIndex: extras.onFocusTabByIndex,
    onAdjustFontSize: extras.onAdjustFontSize,
    onResetFontSize: extras.onResetFontSize,
  })
  // Override homedir so tests get deterministic label output regardless
  // of CI user's $HOME.
  if (extras.homedir !== undefined) {
    const home = extras.homedir
    ;(panel as any).getHomedir = () => home
  }
  // The panel isn't mounted in these tests, so React's `setState` is a
  // no-op (no reconciler attached). Replace it with a direct, synchronous
  // mutation so renderTab() picks up state changes immediately.
  ;(panel as any).setState = (update: any, cb?: () => void) => {
    const next =
      typeof update === 'function' ? update((panel as any).state) : update
    ;(panel as any).state = { ...(panel as any).state, ...next }
    if (cb) {
      cb()
    }
  }
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
    // tab children: [statusIcon, labelOrInput, activityDotOrFalse, closeBtn]
    const closeBtn = tab.props.children[3]
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
    // Force both sessions into the mounted set so the existing assertion
    // that both views render survives the lazy-mount filter. The user
    // would have visited both tabs to see this state.
    ;(panel as any).state = {
      ...(panel as any).state,
      mountedSessionIds: new Set(['a', 'b']),
    }
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

  it('forwards onFilePathClick from XtermView with (repoId, sessionId, …)', () => {
    const a = snap({ id: 'a', repositoryId: 7 })
    const onFilePathClick = jest.fn()
    const { panel } = makePanel(
      {
        ...baseState,
        activeSessionId: 'a',
        sessions: new Map([[a.id, a]]),
        tabsByRepoId: new Map([[7, ['a']]]),
      },
      7,
      { onFilePathClick }
    )
    const tree: any = panel.render()
    const body = tree.props.children[3]
    const wrappers = body.props.children[1] as any[]
    expect(wrappers).toHaveLength(1)
    const xtermProps = wrappers[0].props.children.props
    expect(typeof xtermProps.onFilePathClick).toBe('function')
    xtermProps.onFilePathClick('src/foo.ts', 42, 7)
    expect(onFilePathClick).toHaveBeenCalledWith(7, 'a', 'src/foo.ts', 42, 7)
  })

  it('omits onFilePathClick on XtermView when prop is undefined', () => {
    const a = snap({ id: 'a' })
    const { panel } = makePanel({
      ...baseState,
      activeSessionId: 'a',
      sessions: new Map([[a.id, a]]),
      tabsByRepoId: new Map([[1, ['a']]]),
    })
    const tree: any = panel.render()
    const body = tree.props.children[3]
    const wrappers = body.props.children[1] as any[]
    expect(wrappers[0].props.children.props.onFilePathClick).toBeUndefined()
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

  describe('rich tab UX', () => {
    const getTab = (panel: any, ix = 0) => {
      const tree: any = panel.render()
      return tree.props.children[1].props.children[0].props.children[0][ix]
    }

    it('uses formatTabLabel: cwd inside $HOME renders as ~/<basename>', () => {
      const a = snap({
        id: 'a',
        shell: '/usr/bin/zsh',
        liveCwd: '/home/u/proj/src',
      })
      const { panel } = makePanel(
        {
          ...baseState,
          activeSessionId: 'a',
          sessions: new Map([[a.id, a]]),
          tabsByRepoId: new Map([[1, ['a']]]),
        },
        1,
        { homedir: '/home/u' }
      )
      const tab = getTab(panel)
      // children: [statusIcon, labelOrInput, dotOrFalse, closeBtn]
      const label = tab.props.children[1]
      expect(label.props.children).toBe('zsh · ~/src')
    })

    it('renders an activity dot for an inactive tab with hasActivity', () => {
      const a = snap({ id: 'a', hasActivity: true })
      const b = snap({ id: 'b', hasActivity: false })
      const { panel } = makePanel({
        ...baseState,
        activeSessionId: 'b',
        sessions: new Map([
          [a.id, a],
          [b.id, b],
        ]),
        tabsByRepoId: new Map([[1, ['a', 'b']]]),
      })
      const inactive = getTab(panel, 0)
      const dot = inactive.props.children[2]
      expect(dot && dot.props.className).toBe('terminal-panel__tab-activity')
      const active = getTab(panel, 1)
      // Active tab never shows the dot — third slot is `false`.
      expect(active.props.children[2]).toBe(false)
    })

    it('renders a status icon span on every tab', () => {
      const a = snap({ id: 'a', status: 'running', lastExitCode: null })
      const { panel } = makePanel({
        ...baseState,
        activeSessionId: 'a',
        sessions: new Map([[a.id, a]]),
        tabsByRepoId: new Map([[1, ['a']]]),
      })
      const tab = getTab(panel)
      const status = tab.props.children[0]
      expect(status.props.className).toContain('terminal-panel__tab-status')
      expect(status.props.className).toContain('running')
    })

    it('middle-click on a tab fires onCloseTab (button === 1)', () => {
      const a = snap({ id: 'a' })
      const { panel, onCloseTab } = makePanel({
        ...baseState,
        activeSessionId: 'a',
        sessions: new Map([[a.id, a]]),
        tabsByRepoId: new Map([[1, ['a']]]),
      })
      const tab = getTab(panel)
      const preventDefault = jest.fn()
      tab.props.onMouseDown({ button: 1, preventDefault })
      expect(preventDefault).toHaveBeenCalled()
      expect(onCloseTab).toHaveBeenCalledWith('a')
    })

    it('left mousedown does not close the tab', () => {
      const a = snap({ id: 'a' })
      const { panel, onCloseTab } = makePanel({
        ...baseState,
        activeSessionId: 'a',
        sessions: new Map([[a.id, a]]),
        tabsByRepoId: new Map([[1, ['a']]]),
      })
      const tab = getTab(panel)
      tab.props.onMouseDown({ button: 0, preventDefault: jest.fn() })
      expect(onCloseTab).not.toHaveBeenCalled()
    })

    it('double-click puts the tab into rename mode', () => {
      const a = snap({ id: 'a', shell: '/usr/bin/zsh' })
      const { panel } = makePanel({
        ...baseState,
        activeSessionId: 'a',
        sessions: new Map([[a.id, a]]),
        tabsByRepoId: new Map([[1, ['a']]]),
      })
      const tab = getTab(panel)
      tab.props.onDoubleClick()
      expect((panel.state as any).renamingSessionId).toBe('a')
      expect((panel.state as any).renameDraft).toBe('zsh')
    })

    it('Enter while renaming calls onRenameTab with the trimmed draft', () => {
      const a = snap({ id: 'a' })
      const onRenameTab = jest.fn()
      const { panel } = makePanel(
        {
          ...baseState,
          activeSessionId: 'a',
          sessions: new Map([[a.id, a]]),
          tabsByRepoId: new Map([[1, ['a']]]),
        },
        1,
        { onRenameTab }
      )
      panel.setState({
        renamingSessionId: 'a',
        renameDraft: '  build watcher  ',
      } as any)
      const tab = getTab(panel)
      const input = tab.props.children[1]
      input.props.onKeyDown({
        key: 'Enter',
        preventDefault: jest.fn(),
      })
      expect(onRenameTab).toHaveBeenCalledWith('a', 'build watcher')
      expect((panel.state as any).renamingSessionId).toBeNull()
    })

    it('Escape while renaming cancels without firing onRenameTab', () => {
      const a = snap({ id: 'a' })
      const onRenameTab = jest.fn()
      const { panel } = makePanel(
        {
          ...baseState,
          activeSessionId: 'a',
          sessions: new Map([[a.id, a]]),
          tabsByRepoId: new Map([[1, ['a']]]),
        },
        1,
        { onRenameTab }
      )
      panel.setState({
        renamingSessionId: 'a',
        renameDraft: 'discarded',
      } as any)
      const tab = getTab(panel)
      const input = tab.props.children[1]
      input.props.onKeyDown({ key: 'Escape', preventDefault: jest.fn() })
      expect(onRenameTab).not.toHaveBeenCalled()
      expect((panel.state as any).renamingSessionId).toBeNull()
    })

    it('empty draft commit does not fire onRenameTab', () => {
      const a = snap({ id: 'a' })
      const onRenameTab = jest.fn()
      const { panel } = makePanel(
        {
          ...baseState,
          activeSessionId: 'a',
          sessions: new Map([[a.id, a]]),
          tabsByRepoId: new Map([[1, ['a']]]),
        },
        1,
        { onRenameTab }
      )
      panel.setState({
        renamingSessionId: 'a',
        renameDraft: '   ',
      } as any)
      const tab = getTab(panel)
      const input = tab.props.children[1]
      input.props.onKeyDown({ key: 'Enter', preventDefault: jest.fn() })
      expect(onRenameTab).not.toHaveBeenCalled()
      expect((panel.state as any).renamingSessionId).toBeNull()
    })

    it('drop on tab B with drag started from A calls onReorderTab(repoId, A, ixOfB)', () => {
      const a = snap({ id: 'A' })
      const b = snap({ id: 'B' })
      const c = snap({ id: 'C' })
      const onReorderTab = jest.fn()
      const { panel } = makePanel(
        {
          ...baseState,
          activeSessionId: 'A',
          sessions: new Map([
            [a.id, a],
            [b.id, b],
            [c.id, c],
          ]),
          tabsByRepoId: new Map([[7, ['A', 'B', 'C']]]),
        },
        7,
        { onReorderTab }
      )
      const tabA = getTab(panel, 0)
      const tabB = getTab(panel, 1)
      tabA.props.onDragStart({ dataTransfer: {} })
      tabB.props.onDrop({
        preventDefault: jest.fn(),
        dataTransfer: {},
      })
      expect(onReorderTab).toHaveBeenCalledWith(7, 'A', 1)
    })

    it('drop on the same tab is a no-op', () => {
      const a = snap({ id: 'A' })
      const onReorderTab = jest.fn()
      const { panel } = makePanel(
        {
          ...baseState,
          activeSessionId: 'A',
          sessions: new Map([[a.id, a]]),
          tabsByRepoId: new Map([[1, ['A']]]),
        },
        1,
        { onReorderTab }
      )
      const tabA = getTab(panel, 0)
      tabA.props.onDragStart({ dataTransfer: {} })
      tabA.props.onDrop({
        preventDefault: jest.fn(),
        dataTransfer: {},
      })
      expect(onReorderTab).not.toHaveBeenCalled()
    })

    it('Ctrl+1 calls onFocusTabByIndex(repoId, 0) when panel is visible', () => {
      const a = snap({ id: 'a' })
      const onFocusTabByIndex = jest.fn()
      const { panel } = makePanel(
        {
          ...baseState,
          sessions: new Map([[a.id, a]]),
          tabsByRepoId: new Map([[7, ['a']]]),
        },
        7,
        { onFocusTabByIndex }
      )
      const preventDefault = jest.fn()
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '1',
        preventDefault,
      })
      expect(onFocusTabByIndex).toHaveBeenCalledWith(7, 0)
      expect(preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+9 maps to index 8', () => {
      const onFocusTabByIndex = jest.fn()
      const { panel } = makePanel(
        {
          ...baseState,
          tabsByRepoId: new Map([[7, []]]),
        },
        7,
        { onFocusTabByIndex }
      )
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '9',
        preventDefault: jest.fn(),
      })
      expect(onFocusTabByIndex).toHaveBeenCalledWith(7, 8)
    })

    it('Ctrl+0 does not fire onFocusTabByIndex (reserved for zoom)', () => {
      const onFocusTabByIndex = jest.fn()
      const { panel } = makePanel(baseState, 7, { onFocusTabByIndex })
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '0',
        preventDefault: jest.fn(),
      })
      expect(onFocusTabByIndex).not.toHaveBeenCalled()
    })

    it('Ctrl+Shift+1 does not fire (modifier guard)', () => {
      const onFocusTabByIndex = jest.fn()
      const { panel } = makePanel(baseState, 7, { onFocusTabByIndex })
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: true,
        altKey: false,
        metaKey: false,
        key: '1',
        preventDefault: jest.fn(),
      })
      expect(onFocusTabByIndex).not.toHaveBeenCalled()
    })

    it('Ctrl+1 is ignored when panel is hidden', () => {
      const onFocusTabByIndex = jest.fn()
      const { panel } = makePanel({ ...baseState, visible: false }, 7, {
        onFocusTabByIndex,
      })
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '1',
        preventDefault: jest.fn(),
      })
      expect(onFocusTabByIndex).not.toHaveBeenCalled()
    })
  })

  describe('font zoom keybindings', () => {
    it('Ctrl+= calls onAdjustFontSize(1) when panel is visible', () => {
      const onAdjustFontSize = jest.fn()
      const { panel } = makePanel(baseState, 1, { onAdjustFontSize })
      const preventDefault = jest.fn()
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '=',
        preventDefault,
      })
      expect(onAdjustFontSize).toHaveBeenCalledWith(1)
      expect(preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+- calls onAdjustFontSize(-1) when panel is visible', () => {
      const onAdjustFontSize = jest.fn()
      const { panel } = makePanel(baseState, 1, { onAdjustFontSize })
      const preventDefault = jest.fn()
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '-',
        preventDefault,
      })
      expect(onAdjustFontSize).toHaveBeenCalledWith(-1)
      expect(preventDefault).toHaveBeenCalled()
    })

    it('Ctrl+0 calls onResetFontSize when panel is visible', () => {
      const onResetFontSize = jest.fn()
      const { panel } = makePanel(baseState, 1, { onResetFontSize })
      const preventDefault = jest.fn()
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '0',
        preventDefault,
      })
      expect(onResetFontSize).toHaveBeenCalled()
      expect(preventDefault).toHaveBeenCalled()
    })

    it('font zoom keys are ignored when panel is hidden', () => {
      const onAdjustFontSize = jest.fn()
      const onResetFontSize = jest.fn()
      const { panel } = makePanel({ ...baseState, visible: false }, 1, {
        onAdjustFontSize,
        onResetFontSize,
      })
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '=',
        preventDefault: jest.fn(),
      })
      ;(panel as any).handleGlobalKeyDown({
        ctrlKey: true,
        shiftKey: false,
        altKey: false,
        metaKey: false,
        key: '0',
        preventDefault: jest.fn(),
      })
      expect(onAdjustFontSize).not.toHaveBeenCalled()
      expect(onResetFontSize).not.toHaveBeenCalled()
    })
  })

  describe('lazy mount', () => {
    it('lazy-mounts XtermView only for sessions that have been activated', () => {
      const s1 = snap({ id: 's1' })
      const s2 = snap({ id: 's2' })
      const s3 = snap({ id: 's3' })
      const sessions = new Map([
        [s1.id, s1],
        [s2.id, s2],
        [s3.id, s3],
      ])
      const tabsByRepoId = new Map([[1, ['s1', 's2', 's3']]])
      const stateActiveS2: any = {
        ...baseState,
        activeSessionId: 's2',
        sessions,
        tabsByRepoId,
      }
      const { panel } = makePanel(stateActiveS2)

      // First render: only the active session (s2) is mounted.
      const tree1: any = panel.render()
      const wrappers1 = tree1.props.children[3].props.children[1] as any[]
      expect(wrappers1).toHaveLength(1)
      expect(wrappers1[0].key).toBe('s2')

      // Switch to s3: simulate prop change, run componentDidUpdate.
      const stateActiveS3: any = {
        ...stateActiveS2,
        activeSessionId: 's3',
      }
      ;(panel as any).props = {
        ...(panel as any).props,
        state: stateActiveS3,
      }
      panel.componentDidUpdate({
        ...(panel as any).props,
        state: stateActiveS2,
      } as any)

      const tree2: any = panel.render()
      const wrappers2 = tree2.props.children[3].props.children[1] as any[]
      const ids2 = wrappers2.map(w => w.key).sort()
      expect(ids2).toEqual(['s2', 's3'])

      // Switch back to s2: s3 stays mounted (no unmount on tab switch).
      const stateBackToS2: any = {
        ...stateActiveS3,
        activeSessionId: 's2',
      }
      ;(panel as any).props = {
        ...(panel as any).props,
        state: stateBackToS2,
      }
      panel.componentDidUpdate({
        ...(panel as any).props,
        state: stateActiveS3,
      } as any)
      const tree3: any = panel.render()
      const wrappers3 = tree3.props.children[3].props.children[1] as any[]
      const ids3 = wrappers3.map(w => w.key).sort()
      expect(ids3).toEqual(['s2', 's3'])
    })

    it('drops removed session ids from the mounted set', () => {
      const s1 = snap({ id: 's1' })
      const s2 = snap({ id: 's2' })
      const sessions = new Map([
        [s1.id, s1],
        [s2.id, s2],
      ])
      const tabsByRepoId = new Map([[1, ['s1', 's2']]])
      const stateActiveS1: any = {
        ...baseState,
        activeSessionId: 's1',
        sessions,
        tabsByRepoId,
      }
      const { panel } = makePanel(stateActiveS1)
      // Pre-populate both into mounted set.
      ;(panel as any).state = {
        ...(panel as any).state,
        mountedSessionIds: new Set(['s1', 's2']),
      }

      // Remove s2 from the store.
      const stateAfterRemove: any = {
        ...stateActiveS1,
        sessions: new Map([[s1.id, s1]]),
        tabsByRepoId: new Map([[1, ['s1']]]),
      }
      ;(panel as any).props = {
        ...(panel as any).props,
        state: stateAfterRemove,
      }
      panel.componentDidUpdate({
        ...(panel as any).props,
        state: stateActiveS1,
      } as any)

      expect(
        Array.from((panel as any).state.mountedSessionIds as Set<string>)
      ).toEqual(['s1'])
    })
  })
})
