import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IWorktreeRemoveDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly worktreePath: string
  /** Branch the worktree has checked out, shown for confirmation. */
  readonly branch: string | null
  readonly onDismissed: () => void
}

interface IWorktreeRemoveDialogState {
  readonly force: boolean
  readonly removing: boolean
  readonly error: string | null
}

/**
 * Confirm removal of a linked worktree. Git refuses to remove a worktree
 * with uncommitted changes or a locked worktree unless forced, so a
 * `Force` opt-in is offered.
 */
export class WorktreeRemoveDialog extends React.Component<
  IWorktreeRemoveDialogProps,
  IWorktreeRemoveDialogState
> {
  public constructor(props: IWorktreeRemoveDialogProps) {
    super(props)
    this.state = { force: false, removing: false, error: null }
  }

  public render() {
    const title = __DARWIN__ ? 'Remove Worktree' : 'Remove worktree'
    return (
      <Dialog
        id="worktree-remove"
        type="warning"
        title={title}
        loading={this.state.removing}
        disabled={this.state.removing}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <span>
              Remove the worktree at <code>{this.props.worktreePath}</code>
              {this.props.branch !== null && (
                <>
                  {' '}
                  (branch <strong>{this.props.branch}</strong>)
                </>
              )}
              ? This deletes the worktree's working directory. Your commits and
              branches are not affected.
            </span>
          </Row>
          <Row>
            <Checkbox
              label="Force (discard uncommitted changes, remove if locked)"
              value={this.state.force ? CheckboxValue.On : CheckboxValue.Off}
              onChange={this.onForceToggle}
            />
          </Row>
          {this.state.error !== null && (
            <Row>
              <span className="error">{this.state.error}</span>
            </Row>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={__DARWIN__ ? 'Remove Worktree' : 'Remove worktree'}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onForceToggle = (e: React.FormEvent<HTMLInputElement>) => {
    this.setState({ force: e.currentTarget.checked })
  }

  private onSubmit = async () => {
    this.setState({ removing: true, error: null })
    try {
      await this.props.dispatcher.removeWorktree(
        this.props.repository,
        this.props.worktreePath,
        this.state.force
      )
      this.props.onDismissed()
    } catch (err) {
      this.setState({
        removing: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
