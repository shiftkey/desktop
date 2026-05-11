import * as React from 'react'
import { IWorktreeEntry } from '../../models/worktree'

interface IWorktreeListItemProps {
  readonly entry: IWorktreeEntry
}

export class WorktreeListItem extends React.Component<IWorktreeListItemProps> {
  public render() {
    const { entry } = this.props
    return (
      <li className="worktree-list__item">
        <div className="worktree-list__path">{entry.path}</div>
        <div className="worktree-list__meta">
          <span>HEAD: {entry.head.slice(0, 8)}</span>
          {entry.changesCount > 0 && (
            <span className="worktree-list__changes">
              {entry.changesCount} change
              {entry.changesCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </li>
    )
  }
}
