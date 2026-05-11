import * as React from 'react'
import { IWorktreeEntry } from '../../models/worktree'
import { WorktreeListItem } from './worktree-list-item'

interface IWorktreeListProps {
  readonly entries: ReadonlyArray<IWorktreeEntry>
  readonly loading: boolean
}

export class WorktreeList extends React.Component<IWorktreeListProps> {
  public render() {
    if (this.props.loading) {
      return (
        <div className="worktree-list">
          <div className="worktree-list__loading">Loading worktrees...</div>
        </div>
      )
    }

    if (this.props.entries.length === 0) {
      return (
        <div className="worktree-list">
          <div className="worktree-list__empty">No linked worktrees found.</div>
        </div>
      )
    }

    return (
      <div className="worktree-list">
        <ul>
          {this.props.entries.map(entry => (
            <WorktreeListItem key={entry.path} entry={entry} />
          ))}
        </ul>
      </div>
    )
  }
}
