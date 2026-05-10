import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { StashListItem } from './stash-list-item'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IStashListProps {
  readonly entries: ReadonlyArray<IStashEntry>
  readonly loading: boolean
  readonly selectedSha: string | null
  readonly onSelect: (entry: IStashEntry) => void
  readonly onContextMenu?: (
    entry: IStashEntry,
    e: React.MouseEvent<HTMLDivElement>
  ) => void
  readonly onCreateClick: () => void
}

/**
 * Renders the list of stash entries for the active repository, plus a
 * "Stash changes" button that opens the create dialog.
 */
export class StashList extends React.PureComponent<IStashListProps> {
  public render() {
    return (
      <div className="stash-list" role="grid">
        <div className="stash-list__toolbar">
          <Button onClick={this.props.onCreateClick}>
            <Octicon symbol={octicons.plus} />
            <span>Stash changes</span>
          </Button>
        </div>
        {this.renderBody()}
      </div>
    )
  }

  private renderBody() {
    const { entries, loading, selectedSha } = this.props

    if (loading && entries.length === 0) {
      return (
        <div className="stash-list__placeholder" role="status">
          Loading stashes…
        </div>
      )
    }

    if (entries.length === 0) {
      return (
        <div className="stash-list__placeholder">
          No stashes. Click <strong>Stash changes</strong> to save your current
          working changes.
        </div>
      )
    }

    return (
      <div className="stash-list__items">
        {entries.map(entry => (
          <StashListItem
            key={entry.stashSha}
            entry={entry}
            selected={entry.stashSha === selectedSha}
            onClick={this.props.onSelect}
            onContextMenu={this.props.onContextMenu}
          />
        ))}
      </div>
    )
  }
}
