import {
  getDisplayMessage,
  StashListItem,
} from '../../../src/ui/stashes/stash-list-item'
import {
  IStashEntry,
  StashedChangesLoadStates,
} from '../../../src/models/stash-entry'

function makeEntry(partial: Partial<IStashEntry>): IStashEntry {
  return {
    name: 'refs/stash@{0}',
    branchName: 'main',
    stashSha: 'abc',
    message: '',
    stashedAt: 0,
    tree: 'tree',
    parents: [],
    files: { kind: StashedChangesLoadStates.NotLoaded },
    ...partial,
  }
}

describe('getDisplayMessage', () => {
  it('strips the Desktop marker prefix', () => {
    const entry = makeEntry({
      message: '!!GitHub_Desktop<feature/x>',
      branchName: 'feature/x',
    })
    expect(getDisplayMessage(entry)).toBe('Stashed on feature/x')
  })

  it('strips the WIP on <branch>: <hash> prefix and keeps the subject', () => {
    const entry = makeEntry({
      message: 'WIP on main: 1a2b3c4 fix the thing',
      branchName: 'main',
    })
    expect(getDisplayMessage(entry)).toBe('fix the thing')
  })

  it('strips the "On <branch>:" prefix and keeps the user message', () => {
    const entry = makeEntry({
      message: 'On main: experiment with caching',
      branchName: 'main',
    })
    expect(getDisplayMessage(entry)).toBe('experiment with caching')
  })

  it('returns the trimmed raw message when no prefix matches', () => {
    const entry = makeEntry({
      message: '  some hand-written description  ',
      branchName: 'main',
    })
    expect(getDisplayMessage(entry)).toBe('some hand-written description')
  })

  it('falls back to "Stashed on <branch>" when stripped message is empty and a branch is known', () => {
    const entry = makeEntry({
      message: '!!GitHub_Desktop<release/1.0>',
      branchName: 'release/1.0',
    })
    expect(getDisplayMessage(entry)).toBe('Stashed on release/1.0')
  })

  it('falls back to "Stashed changes" when neither branch nor message gives a useful label', () => {
    const entry = makeEntry({ message: '', branchName: '' })
    expect(getDisplayMessage(entry)).toBe('Stashed changes')
  })
})

describe('StashListItem', () => {
  const baseEntry = makeEntry({
    message: 'WIP on main: 1a2b3c4 fix nav',
    branchName: 'main',
    stashSha: 's1',
    stashedAt: 1700000000, // a known unix seconds
  })

  function instantiate(props: Partial<{
    selected: boolean
    onClick: jest.Mock
    onContextMenu: jest.Mock
    nowMs: number
    entry: IStashEntry
  }>) {
    const onClick = props.onClick ?? jest.fn()
    const onContextMenu = props.onContextMenu
    const item = new StashListItem({
      entry: props.entry ?? baseEntry,
      selected: props.selected ?? false,
      onClick,
      onContextMenu,
      nowMs: props.nowMs,
    })
    return { item, onClick, onContextMenu }
  }

  it('renders the display message and branch in the row', () => {
    const { item } = instantiate({ nowMs: 1700003600000 })
    const tree: any = item.render()
    expect(tree.props.className).toContain('stash-list-item')
    expect(tree.props.className).not.toContain('selected')
    // Drill into children to find the title text
    const main = tree.props.children[1]
    const title = main.props.children[0]
    expect(title.props.children).toBe('fix nav')
    // branch span is the first metadata child
    const meta = main.props.children[1]
    const metaChildren = (meta.props.children as any[]).filter(Boolean)
    expect(metaChildren.some((c: any) => c.props.children === 'main')).toBe(true)
  })

  it('adds the "selected" class when selected', () => {
    const { item } = instantiate({ selected: true })
    const tree: any = item.render()
    expect(tree.props.className).toContain('selected')
    expect(tree.props['aria-selected']).toBe(true)
  })

  it('omits the relative-time span when stashedAt is unknown', () => {
    const entry = makeEntry({ ...baseEntry, stashedAt: 0 })
    const { item } = instantiate({ entry })
    const tree: any = item.render()
    const meta = tree.props.children[1].props.children[1]
    const metaChildren = (meta.props.children as any[]).filter(Boolean)
    // Only branch span, no age span
    expect(metaChildren).toHaveLength(1)
  })

  it('invokes onClick with the entry when the row is clicked', () => {
    const { item, onClick } = instantiate({})
    ;(item as any).onClick()
    expect(onClick).toHaveBeenCalledWith(baseEntry)
  })

  it('invokes onContextMenu with the entry and event when set', () => {
    const onContextMenu = jest.fn()
    const { item } = instantiate({ onContextMenu })
    const fakeEvent: any = { preventDefault: jest.fn() }
    ;(item as any).onContextMenu(fakeEvent)
    expect(fakeEvent.preventDefault).toHaveBeenCalled()
    expect(onContextMenu).toHaveBeenCalledWith(baseEntry, fakeEvent)
  })

  it('does nothing on context menu when no handler is provided', () => {
    const { item } = instantiate({})
    const fakeEvent: any = { preventDefault: jest.fn() }
    ;(item as any).onContextMenu(fakeEvent)
    expect(fakeEvent.preventDefault).not.toHaveBeenCalled()
  })
})

