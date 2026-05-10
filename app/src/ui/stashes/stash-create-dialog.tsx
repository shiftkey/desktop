import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IStashCreateDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

interface IStashCreateDialogState {
  readonly message: string
  readonly includeUntracked: boolean
  readonly creating: boolean
  readonly error: string | null
}

export class StashCreateDialog extends React.Component<
  IStashCreateDialogProps,
  IStashCreateDialogState
> {
  public constructor(props: IStashCreateDialogProps) {
    super(props)
    this.state = {
      message: '',
      includeUntracked: false,
      creating: false,
      error: null,
    }
  }

  public render() {
    const title = __DARWIN__ ? 'Stash Changes' : 'Stash changes'
    const submitDisabled = this.state.message.trim().length === 0
    return (
      <Dialog
        id="stash-create"
        title={title}
        loading={this.state.creating}
        disabled={this.state.creating}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <TextBox
              label="Description"
              placeholder="WIP on something"
              value={this.state.message}
              onValueChanged={this.onMessageChange}
              autoFocus={true}
            />
          </Row>
          <Row>
            <Checkbox
              label="Include untracked files"
              value={
                this.state.includeUntracked
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onUntrackedToggle}
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
            okButtonText={__DARWIN__ ? 'Stash Changes' : 'Stash changes'}
            okButtonDisabled={submitDisabled}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onMessageChange = (message: string) => {
    this.setState({ message })
  }

  private onUntrackedToggle = (e: React.FormEvent<HTMLInputElement>) => {
    this.setState({ includeUntracked: e.currentTarget.checked })
  }

  private onSubmit = async () => {
    const message = this.state.message.trim()
    if (message.length === 0) {
      return
    }

    this.setState({ creating: true, error: null })
    try {
      const created = await this.props.dispatcher.createStash(
        this.props.repository,
        message,
        this.state.includeUntracked
      )
      this.setState({ creating: false })
      if (!created) {
        this.setState({
          error: 'No changes in the working directory to stash.',
        })
        return
      }
      this.props.onDismissed()
    } catch (err) {
      this.setState({
        creating: false,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
