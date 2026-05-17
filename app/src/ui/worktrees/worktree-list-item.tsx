import * as React from 'react'
import { IWorktreeEntry } from '../../models/worktree'
import { Button } from '../lib/button'

interface IWorktreeListItemProps {
  readonly entry: IWorktreeEntry
  /** Invoked when the user asks to remove this worktree. */
  readonly onRemove: (entry: IWorktreeEntry) => void
}

/**
 * A single linked-worktree row: its filesystem path, the ref it has checked
 * out (branch name, or `detached @ <sha>` when in detached-HEAD state), an
 * uncommitted-change count, badges for locked / prunable worktrees, and a
 * Remove action.
 */
export class WorktreeListItem extends React.Component<IWorktreeListItemProps> {
  public render() {
    const { entry } = this.props
    return (
      <li className="worktree-list__item">
        <div className="worktree-list__item-main">
          <div className="worktree-list__path">{entry.path}</div>
          <div className="worktree-list__meta">
            {this.renderRef()}
            {entry.changesCount > 0 && (
              <span className="worktree-list__changes">
                {entry.changesCount} uncommitted change
                {entry.changesCount !== 1 ? 's' : ''}
              </span>
            )}
            {this.renderBadge('locked', 'Locked', entry.lockedReason)}
            {this.renderBadge('prunable', 'Prunable', entry.prunableReason)}
          </div>
        </div>
        <Button
          className="worktree-list__remove"
          onClick={this.onRemoveClick}
          tooltip={`Remove the worktree at ${entry.path}`}
        >
          Remove
        </Button>
      </li>
    )
  }

  private onRemoveClick = () => {
    this.props.onRemove(this.props.entry)
  }

  /** The checked-out ref: branch name, bare marker, or detached sha. */
  private renderRef(): JSX.Element {
    const { entry } = this.props
    if (entry.isBare) {
      return <span className="worktree-list__ref">bare repository</span>
    }
    if (entry.branch !== null) {
      return <span className="worktree-list__ref">{entry.branch}</span>
    }
    return (
      <span className="worktree-list__ref worktree-list__ref--detached">
        detached @ {entry.head.slice(0, 8)}
      </span>
    )
  }

  /**
   * Render a status badge plus, when Git supplied one, the visible reason
   * text. `reason` is `null` when the state does not apply, an empty string
   * when the state applies without a reason.
   */
  private renderBadge(
    kind: 'locked' | 'prunable',
    label: string,
    reason: string | null
  ): JSX.Element | null {
    if (reason === null) {
      return null
    }
    return (
      <span className="worktree-list__status">
        <span className={`worktree-list__badge worktree-list__badge--${kind}`}>
          {label}
        </span>
        {reason.length > 0 && (
          <span className="worktree-list__reason">{reason}</span>
        )}
      </span>
    )
  }
}
