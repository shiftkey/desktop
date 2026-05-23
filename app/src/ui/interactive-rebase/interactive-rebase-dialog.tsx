import * as React from 'react'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import {
  IInteractiveRebaseEntry,
  RebaseTodoAction,
} from '../../models/multi-commit-operation'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'

interface IInteractiveRebaseDialogProps {
  readonly repository: Repository
  readonly commits: ReadonlyArray<Commit>
  readonly lastRetainedCommitRef: string | null
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

interface IInteractiveRebaseDialogState {
  readonly entries: Array<IInteractiveRebaseEntry>
  readonly dragIndex: number | null
  readonly dragOverIndex: number | null
}

const ACTION_LABELS: Record<RebaseTodoAction, string> = {
  pick: 'Pick',
  squash: 'Squash',
  fixup: 'Fixup',
  drop: 'Drop',
}

export class InteractiveRebaseDialog extends React.Component<
  IInteractiveRebaseDialogProps,
  IInteractiveRebaseDialogState
> {
  public constructor(props: IInteractiveRebaseDialogProps) {
    super(props)
    this.state = {
      entries: props.commits.map(commit => ({ commit, action: 'pick' })),
      dragIndex: null,
      dragOverIndex: null,
    }
  }

  private onActionChange = (index: number, action: RebaseTodoAction) => {
    const entries = [...this.state.entries]
    entries[index] = { ...entries[index], action }
    this.setState({ entries })
  }

  private onDragStart = (index: number) => {
    this.setState({ dragIndex: index })
  }

  private onDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    this.setState({ dragOverIndex: index })
  }

  private onDrop = (toIndex: number) => {
    const { dragIndex, entries } = this.state
    if (dragIndex === null || dragIndex === toIndex) {
      this.setState({ dragIndex: null, dragOverIndex: null })
      return
    }
    const next = [...entries]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(toIndex, 0, moved)
    this.setState({ entries: next, dragIndex: null, dragOverIndex: null })
  }

  private onDragEnd = () => {
    this.setState({ dragIndex: null, dragOverIndex: null })
  }

  private onConfirm = async () => {
    const { repository, lastRetainedCommitRef, dispatcher, onDismissed } =
      this.props
    onDismissed()
    await dispatcher.startInteractiveRebase(
      repository,
      this.state.entries,
      lastRetainedCommitRef
    )
  }

  private hasOnlyPicks(): boolean {
    return this.state.entries.every(e => e.action === 'pick')
  }

  private allDropped(): boolean {
    return this.state.entries.every(e => e.action === 'drop')
  }

  public render() {
    const { entries, dragOverIndex } = this.state
    const disabled = this.allDropped()

    return (
      <Dialog
        id="interactive-rebase"
        title="Interactive Rebase"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p className="interactive-rebase-description">
            Reorder commits or set an action for each. Squash combines a commit
            into the one above it; Fixup does the same but discards the message;
            Drop removes the commit entirely.
          </p>
          <div className="interactive-rebase-list" role="list">
            {entries.map((entry, i) => (
              <div
                key={entry.commit.sha}
                role="listitem"
                className={`interactive-rebase-row${
                  entry.action === 'drop' ? ' interactive-rebase-row--drop' : ''
                }${
                  dragOverIndex === i ? ' interactive-rebase-row--dragover' : ''
                }`}
                draggable
                // eslint-disable-next-line react/jsx-no-bind
                onDragStart={() => this.onDragStart(i)}
                // eslint-disable-next-line react/jsx-no-bind
                onDragOver={e => this.onDragOver(e, i)}
                // eslint-disable-next-line react/jsx-no-bind
                onDrop={() => this.onDrop(i)}
                onDragEnd={this.onDragEnd}
              >
                <span
                  className="interactive-rebase-drag-handle"
                  aria-hidden="true"
                >
                  <Octicon symbol={OcticonSymbol.grabber} />
                </span>
                <code className="interactive-rebase-sha">
                  {entry.commit.sha.substring(0, 7)}
                </code>
                <span className="interactive-rebase-summary">
                  {entry.commit.summary}
                </span>
                <select
                  className="interactive-rebase-action"
                  value={entry.action}
                  aria-label={`Action for ${entry.commit.summary}`}
                  // eslint-disable-next-line react/jsx-no-bind
                  onChange={e =>
                    this.onActionChange(i, e.target.value as RebaseTodoAction)
                  }
                >
                  {(Object.keys(ACTION_LABELS) as Array<RebaseTodoAction>).map(
                    a => (
                      <option key={a} value={a}>
                        {ACTION_LABELS[a]}
                      </option>
                    )
                  )}
                </select>
              </div>
            ))}
          </div>
          {this.hasOnlyPicks() && (
            <p className="interactive-rebase-hint">
              Tip: Drag rows to reorder commits, or change the action to squash
              or drop commits.
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Start Rebase"
            okButtonDisabled={disabled}
            onOkButtonClick={this.onConfirm}
            onCancelButtonClick={this.props.onDismissed}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
