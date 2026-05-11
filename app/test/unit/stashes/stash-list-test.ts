import { StashList } from '../../../src/ui/stashes/stash-list'
import {
  IStashEntry,
  StashedChangesLoadStates,
} from '../../../src/models/stash-entry'

function makeEntry(partial: Partial<IStashEntry>): IStashEntry {
  return {
    name: 'refs/stash@{0}',
    branchName: 'main',
    stashSha: 'abc',
    message: 'WIP on main: 1234567 a thing',
    stashedAt: 1700000000,
    tree: 't',
    parents: [],
    files: { kind: StashedChangesLoadStates.NotLoaded },
    ...partial,
  }
}

function makeList(
  props: Partial<{
    entries: ReadonlyArray<IStashEntry>
    loading: boolean
    selectedSha: string | null
    onSelect: jest.Mock
    onContextMenu: jest.Mock
    onCreateClick: jest.Mock
  }>
) {
  const onSelect = props.onSelect ?? jest.fn()
  const onCreateClick = props.onCreateClick ?? jest.fn()
  const list = new StashList({
    entries: props.entries ?? [],
    loading: props.loading ?? false,
    selectedSha: props.selectedSha ?? null,
    onSelect,
    onContextMenu: props.onContextMenu,
    onCreateClick,
  })
  return { list, onSelect, onCreateClick }
}

describe('StashList', () => {
  it('renders the placeholder when there are no entries and not loading', () => {
    const { list } = makeList({})
    const tree: any = list.render()
    // tree.props.children is [toolbar, body]
    const body = tree.props.children[1]
    expect(body.props.className).toContain('placeholder')
    // Placeholder mentions the call to action
    expect(JSON.stringify(body)).toContain('Stash changes')
  })

  it('renders the loading placeholder when loading and entries are empty', () => {
    const { list } = makeList({ loading: true })
    const body: any = list.render().props.children[1]
    expect(body.props.role).toBe('status')
    expect(body.props.children).toBe('Loading stashes…')
  })

  it('renders one row per entry when entries are present', () => {
    const entries = [
      makeEntry({ stashSha: 's1' }),
      makeEntry({ stashSha: 's2' }),
      makeEntry({ stashSha: 's3' }),
    ]
    const { list } = makeList({ entries })
    const body: any = list.render().props.children[1]
    expect(body.props.className).toContain('items')
    const rows = body.props.children
    expect(rows).toHaveLength(3)
    expect(rows[0].key).toBe('s1')
    expect(rows[1].key).toBe('s2')
  })

  it('marks the row matching selectedSha as selected', () => {
    const entries = [
      makeEntry({ stashSha: 's1' }),
      makeEntry({ stashSha: 's2' }),
    ]
    const { list } = makeList({ entries, selectedSha: 's2' })
    const rows = list.render().props.children[1].props.children as any[]
    expect(rows[0].props.selected).toBe(false)
    expect(rows[1].props.selected).toBe(true)
  })

  it('forwards the create click to onCreateClick', () => {
    const onCreateClick = jest.fn()
    const { list } = makeList({ onCreateClick })
    const tree: any = list.render()
    const toolbar = tree.props.children[0]
    const button = toolbar.props.children
    button.props.onClick()
    expect(onCreateClick).toHaveBeenCalledTimes(1)
  })
})
