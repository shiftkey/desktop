import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IWorktreeCreateDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

interface IWorktreeCreateDialogState {
  /** Filesystem path for the new worktree. */
  readonly path: string
  /**
   * Branch text. When `createNewBranch` is on this is the name of the
   * branch to create; otherwise it is the existing branch / commit-ish to
   * check out (blank lets Git derive a branch from the path).
   */
  readonly branch: string
  readonly createNewBranch: boolean
  readonly force: boolean
  readonly creating: boolean
  readonly error: string | null
}

/**
 * Create a new linked worktree. Collects a target path and a branch — a
 * brand-new branch, or an existing branch / commit-ish to check out — and
 * delegates to `git worktree add` via the dispatcher.
 */
export class WorktreeCreateDialog extends React.Component<
  IWorktreeCreateDialogProps,
  IWorktreeCreateDialogState
> {
  public constructor(props: IWorktreeCreateDialogProps) {
    super(props)
    this.state = {
      path: '',
      branch: '',
      createNewBranch: false,
      force: false,
      creating: false,
      error: null,
    }
  }

  public render() {
    const title = __DARWIN__ ? 'Add Worktree' : 'Add worktree'
    return (
      <Dialog
        id="worktree-create"
        title={title}
        loading={this.state.creating}
        disabled={this.state.creating}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <TextBox
              label="Worktree location"
              placeholder="/path/to/new/worktree"
              value={this.state.path}
              onValueChanged={this.onPathChange}
              autoFocus={true}
            />
          </Row>
          <Row>
            <TextBox
              label={
                this.state.createNewBranch
                  ? 'New branch name'
                  : 'Branch or commit to check out'
              }
              placeholder={
                this.state.createNewBranch ? 'feature/my-work' : 'main'
              }
              value={this.state.branch}
              onValueChanged={this.onBranchChange}
            />
          </Row>
          <Row>
            <Checkbox
              label="Create a new branch"
              value={
                this.state.createNewBranch
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onCreateNewBranchToggle}
            />
          </Row>
          <Row>
            <Checkbox
              label="Force (branch already checked out, or path exists)"
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
            okButtonText={__DARWIN__ ? 'Add Worktree' : 'Add worktree'}
            okButtonDisabled={this.isSubmitDisabled()}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  /** A path is always required; a new branch additionally needs a name. */
  private isSubmitDisabled(): boolean {
    if (this.state.path.trim().length === 0) {
      return true
    }
    if (this.state.createNewBranch && this.state.branch.trim().length === 0) {
      return true
    }
    return false
  }

  private onPathChange = (path: string) => {
    this.setState({ path })
  }

  private onBranchChange = (branch: string) => {
    this.setState({ branch })
  }

  private onCreateNewBranchToggle = (e: React.FormEvent<HTMLInputElement>) => {
    this.setState({ createNewBranch: e.currentTarget.checked })
  }

  private onForceToggle = (e: React.FormEvent<HTMLInputElement>) => {
    this.setState({ force: e.currentTarget.checked })
  }

  private onSubmit = async () => {
    if (this.isSubmitDisabled()) {
      return
    }
    const path = this.state.path.trim()
    const branch = this.state.branch.trim()
    const force = this.state.force
    const options = this.state.createNewBranch
      ? { newBranch: branch, force }
      : { committish: branch.length > 0 ? branch : undefined, force }

    this.setState({ creating: true, error: null })
    try {
      await this.props.dispatcher.createWorktree(
        this.props.repository,
        path,
        options
      )
      this.props.onDismissed()
    } catch (err) {
      this.setState({
        creating: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
