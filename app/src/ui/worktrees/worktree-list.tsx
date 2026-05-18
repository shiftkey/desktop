import * as React from 'react'
import { IWorktreeEntry } from '../../models/worktree'
import { WorktreeListItem } from './worktree-list-item'
import { Button } from '../lib/button'

interface IWorktreeListProps {
  readonly entries: ReadonlyArray<IWorktreeEntry>
  readonly loading: boolean
  /** Open the "add worktree" dialog. */
  readonly onCreateWorktree: () => void
  /** Prune stale worktree bookkeeping. */
  readonly onPruneWorktrees: () => void
  /** Open the "remove worktree" confirmation for a specific entry. */
  readonly onRemoveWorktree: (entry: IWorktreeEntry) => void
}

/**
 * Lists a repository's linked worktrees with a toolbar for adding a new
 * worktree and pruning stale ones. The toolbar is always shown so a user
 * with no linked worktrees can still create the first one.
 */
export class WorktreeList extends React.Component<IWorktreeListProps> {
  public render() {
    return (
      <div className="worktree-list">
        <div className="worktree-list__toolbar">
          <Button onClick={this.props.onCreateWorktree}>Add worktree…</Button>
          <Button
            onClick={this.props.onPruneWorktrees}
            tooltip="Remove bookkeeping for worktrees whose folder is gone"
          >
            Prune
          </Button>
        </div>
        {this.renderBody()}
      </div>
    )
  }

  private renderBody(): JSX.Element {
    if (this.props.loading) {
      return <div className="worktree-list__loading">Loading worktrees…</div>
    }

    if (this.props.entries.length === 0) {
      return (
        <div className="worktree-list__empty">No linked worktrees found.</div>
      )
    }

    return (
      <ul>
        {this.props.entries
          .filter((entry): entry is IWorktreeEntry => entry != null)
          .map(entry => (
            <WorktreeListItem
              key={entry.path}
              entry={entry}
              onRemove={this.props.onRemoveWorktree}
            />
          ))}
      </ul>
    )
  }
}
