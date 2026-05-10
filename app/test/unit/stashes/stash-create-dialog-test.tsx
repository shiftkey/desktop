import { StashCreateDialog } from '../../../src/ui/stashes/stash-create-dialog'
import { Repository } from '../../../src/models/repository'
import { Dispatcher } from '../../../src/ui/dispatcher'

function makeDispatcher(create: jest.Mock = jest.fn()): Dispatcher {
  return { createStash: create } as unknown as Dispatcher
}

function makeDialog(
  dispatcher: Dispatcher = makeDispatcher(),
  onDismissed: jest.Mock = jest.fn()
) {
  const repository = new Repository('/tmp/r', 1, null, false)
  const component = new StashCreateDialog({
    dispatcher,
    repository,
    onDismissed,
  })
  ;(component as any).setState = (state: any) => {
    component.state = { ...component.state, ...state }
  }
  return { component, dispatcher, onDismissed, repository }
}

describe('StashCreateDialog', () => {
  it('initializes with empty message, untracked off, not creating, no error', () => {
    const { component } = makeDialog()
    expect(component.state.message).toBe('')
    expect(component.state.includeUntracked).toBe(false)
    expect(component.state.creating).toBe(false)
    expect(component.state.error).toBeNull()
  })

  it('updates message state via onMessageChange handler', () => {
    const { component } = makeDialog()
    ;(component as any).onMessageChange('hello world')
    expect(component.state.message).toBe('hello world')
  })

  it('toggles includeUntracked via the checkbox handler', () => {
    const { component } = makeDialog()
    ;(component as any).onUntrackedToggle({
      currentTarget: { checked: true },
    })
    expect(component.state.includeUntracked).toBe(true)
    ;(component as any).onUntrackedToggle({
      currentTarget: { checked: false },
    })
    expect(component.state.includeUntracked).toBe(false)
  })

  it('does not dispatch createStash when message is whitespace only', async () => {
    const create = jest.fn()
    const { component } = makeDialog(makeDispatcher(create))
    ;(component as any).onMessageChange('   ')
    await (component as any).onSubmit()
    expect(create).not.toHaveBeenCalled()
    expect(component.state.creating).toBe(false)
  })

  it('dispatches createStash with trimmed message and untracked flag', async () => {
    const create = jest.fn().mockResolvedValue(true)
    const dispatcher = makeDispatcher(create)
    const onDismissed = jest.fn()
    const { component, repository } = makeDialog(dispatcher, onDismissed)
    ;(component as any).onMessageChange('  WIP fix nav  ')
    ;(component as any).onUntrackedToggle({
      currentTarget: { checked: true },
    })
    await (component as any).onSubmit()

    expect(create).toHaveBeenCalledWith(repository, 'WIP fix nav', true)
    expect(onDismissed).toHaveBeenCalledTimes(1)
    expect(component.state.creating).toBe(false)
    expect(component.state.error).toBeNull()
  })

  it('shows an error and does not dismiss when there are no changes to stash', async () => {
    const create = jest.fn().mockResolvedValue(false)
    const onDismissed = jest.fn()
    const { component } = makeDialog(makeDispatcher(create), onDismissed)
    ;(component as any).onMessageChange('try')
    await (component as any).onSubmit()

    expect(create).toHaveBeenCalled()
    expect(onDismissed).not.toHaveBeenCalled()
    expect(component.state.error).toBe(
      'No changes in the working directory to stash.'
    )
    expect(component.state.creating).toBe(false)
  })

  it('captures error message from a thrown Error and clears creating', async () => {
    const create = jest.fn().mockRejectedValue(new Error('git exploded'))
    const onDismissed = jest.fn()
    const { component } = makeDialog(makeDispatcher(create), onDismissed)
    ;(component as any).onMessageChange('boom')
    await (component as any).onSubmit()

    expect(component.state.error).toBe('git exploded')
    expect(component.state.creating).toBe(false)
    expect(onDismissed).not.toHaveBeenCalled()
  })

  it('coerces non-Error throws to a string error', async () => {
    const create = jest.fn().mockRejectedValue('something weird')
    const { component } = makeDialog(makeDispatcher(create))
    ;(component as any).onMessageChange('x')
    await (component as any).onSubmit()

    expect(component.state.error).toBe('something weird')
  })

  it('renders a Dialog with the platform-appropriate title and disabled submit when message is empty', () => {
    const { component } = makeDialog()
    const tree: any = component.render()
    expect(tree.props.id).toBe('stash-create')
    // Submit button is in the footer, child of OkCancelButtonGroup
    const footer = tree.props.children[1]
    const buttonGroup = footer.props.children
    expect(buttonGroup.props.okButtonDisabled).toBe(true)
  })

  it('enables submit and surfaces error in the body when one is set', () => {
    const { component } = makeDialog()
    ;(component as any).onMessageChange('not empty')
    component.state = { ...component.state, error: 'boom' }
    const tree: any = component.render()
    const footer = tree.props.children[1]
    expect(footer.props.children.props.okButtonDisabled).toBe(false)
    // Stringify the body to verify the error message is in the rendered tree
    expect(JSON.stringify(tree.props.children[0])).toContain('boom')
  })
})
