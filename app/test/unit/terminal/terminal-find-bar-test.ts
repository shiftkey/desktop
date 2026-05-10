import { TerminalFindBar } from '../../../src/ui/terminal/terminal-find-bar'

interface IHandlers {
  onClose: jest.Mock
  onFindNext: jest.Mock
  onFindPrevious: jest.Mock
}

function makeBar(visible: boolean = true): {
  bar: TerminalFindBar
  handlers: IHandlers
} {
  const handlers: IHandlers = {
    onClose: jest.fn(),
    onFindNext: jest.fn(),
    onFindPrevious: jest.fn(),
  }
  const bar = new TerminalFindBar({
    visible,
    onClose: handlers.onClose,
    onFindNext: handlers.onFindNext,
    onFindPrevious: handlers.onFindPrevious,
  })
  return { bar, handlers }
}

/** Walk the rendered tree and return the <input> element. */
function findInput(tree: any): any {
  // root: <div className="terminal-find-bar">
  //   children: [input, btn-prev, btn-next, btn-close]
  return tree.props.children[0]
}

describe('TerminalFindBar', () => {
  it('renders nothing when not visible', () => {
    const { bar } = makeBar(false)
    expect(bar.render()).toBeNull()
  })

  it('renders an input with role=search wrapper when visible', () => {
    const { bar } = makeBar(true)
    const tree: any = bar.render()
    expect(tree.props.role).toBe('search')
    expect(tree.props.className).toBe('terminal-find-bar')
    const input = findInput(tree)
    expect(input.type).toBe('input')
    expect(input.props.type).toBe('search')
  })

  it('calls onFindNext on Enter', () => {
    const { bar, handlers } = makeBar(true)
    ;(bar as any).state = { text: 'hello' }
    const tree: any = bar.render()
    const input = findInput(tree)
    const preventDefault = jest.fn()
    input.props.onKeyDown({
      key: 'Enter',
      shiftKey: false,
      preventDefault,
    })
    expect(preventDefault).toHaveBeenCalled()
    expect(handlers.onFindNext).toHaveBeenCalledWith('hello')
    expect(handlers.onFindPrevious).not.toHaveBeenCalled()
  })

  it('calls onFindPrevious on Shift+Enter', () => {
    const { bar, handlers } = makeBar(true)
    ;(bar as any).state = { text: 'foo' }
    const tree: any = bar.render()
    const input = findInput(tree)
    const preventDefault = jest.fn()
    input.props.onKeyDown({
      key: 'Enter',
      shiftKey: true,
      preventDefault,
    })
    expect(preventDefault).toHaveBeenCalled()
    expect(handlers.onFindPrevious).toHaveBeenCalledWith('foo')
    expect(handlers.onFindNext).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    const { bar, handlers } = makeBar(true)
    const tree: any = bar.render()
    const input = findInput(tree)
    const preventDefault = jest.fn()
    input.props.onKeyDown({ key: 'Escape', preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('next button click forwards current text to onFindNext', () => {
    const { bar, handlers } = makeBar(true)
    ;(bar as any).state = { text: 'abc' }
    const tree: any = bar.render()
    // children: [input, prevBtn, nextBtn, closeBtn]
    const nextBtn = tree.props.children[2]
    nextBtn.props.onClick()
    expect(handlers.onFindNext).toHaveBeenCalledWith('abc')
  })

  it('previous button click forwards current text to onFindPrevious', () => {
    const { bar, handlers } = makeBar(true)
    ;(bar as any).state = { text: 'abc' }
    const tree: any = bar.render()
    const prevBtn = tree.props.children[1]
    prevBtn.props.onClick()
    expect(handlers.onFindPrevious).toHaveBeenCalledWith('abc')
  })

  it('close button click fires onClose', () => {
    const { bar, handlers } = makeBar(true)
    const tree: any = bar.render()
    const closeBtn = tree.props.children[3]
    closeBtn.props.onClick()
    expect(handlers.onClose).toHaveBeenCalled()
  })

  it('input change updates internal text state', () => {
    const { bar } = makeBar(true)
    // Stub setState so we can observe the updater called by onChange
    // without needing the component to be DOM-mounted.
    const setStateSpy = jest
      .spyOn(bar, 'setState')
      .mockImplementation((updater: any) => {
        if (typeof updater === 'object') {
          ;(bar as any).state = { ...bar.state, ...updater }
        }
      })
    const tree: any = bar.render()
    const input = findInput(tree)
    input.props.onChange({ target: { value: 'typed' } })
    expect(setStateSpy).toHaveBeenCalledWith({ text: 'typed' })
    expect(bar.state.text).toBe('typed')
  })
})
