import { TerminalPanel } from '../../../src/ui/terminal/terminal-panel'
import { ITerminalState } from '../../../src/lib/stores/terminal-store'
import { _palettes } from '../../../src/lib/terminal/terminal-theme'
import { ITerminalSessionSnapshot } from '../../../src/lib/terminal/pty-types'

const baseState: ITerminalState = {
  visible: true,
  height: 240,
  activeSessionId: null,
  sessions: new Map(),
  sessionByRepoId: new Map(),
}

const snap = (over: Partial<ITerminalSessionSnapshot> = {}): ITerminalSessionSnapshot => ({
  id: 'a',
  repositoryId: 1,
  cwd: '/tmp',
  shell: '/usr/bin/zsh',
  cols: 80,
  rows: 24,
  createdAt: 0,
  status: 'running',
  exitCode: null,
  ...over,
})

function makePanel(state: ITerminalState) {
  const onResize = jest.fn()
  const onCloseClick = jest.fn()
  const portFor = jest.fn(() => null)
  const panel = new TerminalPanel({
    state,
    theme: _palettes.DARK_THEME,
    portFor,
    onResize,
    onCloseClick,
  })
  return { panel, onResize, onCloseClick, portFor }
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

  it('shows a placeholder body when there is no active session', () => {
    const { panel } = makePanel(baseState)
    const tree: any = panel.render()
    const body = tree.props.children[1]
    expect(body.props.children.props.className).toBe(
      'terminal-panel__placeholder'
    )
  })

  it('shows just "Terminal" in the title when no session is active', () => {
    const { panel } = makePanel(baseState)
    const tree: any = panel.render()
    const title = tree.props.children[0].props.children[0]
    expect(title.props.children).toBe('Terminal')
  })

  it('renders shell basename in the title when a session is active', () => {
    const sess = snap({ id: 'a', shell: '/usr/bin/fish' })
    const sessions = new Map([[sess.id, sess]])
    const { panel } = makePanel({
      ...baseState,
      activeSessionId: 'a',
      sessions,
    })
    const tree: any = panel.render()
    const title = tree.props.children[0].props.children[0]
    expect(title.props.children).toBe('Terminal — fish')
  })

  it('falls back to the raw shell string when split fails to produce a basename', () => {
    const sess = snap({ id: 'a', shell: 'zsh' })
    const { panel } = makePanel({
      ...baseState,
      activeSessionId: 'a',
      sessions: new Map([[sess.id, sess]]),
    })
    const tree: any = panel.render()
    const title = tree.props.children[0].props.children[0]
    expect(title.props.children).toBe('Terminal — zsh')
  })

  it('renders an XtermView when portFor returns a port', () => {
    const fakePort = { postMessage: jest.fn(), start: jest.fn() }
    const { panel, portFor } = makePanel({
      ...baseState,
      activeSessionId: 'a',
      sessions: new Map([['a', snap({ id: 'a' })]]),
    })
    portFor.mockReturnValue(fakePort as any)
    const tree: any = panel.render()
    const body = tree.props.children[1]
    // Body's child is the XtermView element.
    expect(body.props.children.props.port).toBe(fakePort)
  })

  it('forwards close button click', () => {
    const { panel, onCloseClick } = makePanel(baseState)
    const tree: any = panel.render()
    const button = tree.props.children[0].props.children[1]
    button.props.onClick()
    expect(onCloseClick).toHaveBeenCalledTimes(1)
  })
})
