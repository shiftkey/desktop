import * as React from 'react'
import { IStashEntry } from '../../models/stash-entry'
import { formatRelative } from '../../lib/format-relative'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IStashListItemProps {
  readonly entry: IStashEntry
  readonly selected: boolean
  readonly onClick: (entry: IStashEntry) => void
  readonly onContextMenu?: (
    entry: IStashEntry,
    e: React.MouseEvent<HTMLDivElement>
  ) => void
  /**
   * Override for "now" used by tests so the relative-time string is
   * deterministic. Defaults to `Date.now()` at render time.
   */
  readonly nowMs?: number
}

/**
 * Strip the leading Desktop marker (`!!GitHub_Desktop<branch>`) or
 * `WIP on branch:` prefix to surface a tidier display message.
 */
export function getDisplayMessage(entry: IStashEntry): string {
  const desktopRe = /^!!GitHub_Desktop<[^>]*>\s*/
  // CLI reflog: "WIP on <branch>: <abbrev-sha> <subject>"
  //         or: "On <branch>: <user-message>"
  // Only consume the abbrev SHA when it is a contiguous run of 4+ hex chars
  // followed by whitespace, otherwise we'd eat the first letter of the
  // user's message when it happens to begin with a hex letter.
  const wipOnRe = /^(?:WIP on|On)\s+[^:]+:\s*(?:[0-9a-f]{4,40}\s+)?/
  const trimmed = entry.message
    .replace(desktopRe, '')
    .replace(wipOnRe, '')
    .trim()
  if (trimmed.length === 0) {
    return entry.branchName.length > 0
      ? `Stashed on ${entry.branchName}`
      : 'Stashed changes'
  }
  return trimmed
}

export class StashListItem extends React.PureComponent<IStashListItemProps> {
  public render() {
    const { entry, selected, nowMs } = this.props
    const now = nowMs ?? Date.now()
    const displayMessage = getDisplayMessage(entry)
    const ageMs = entry.stashedAt > 0 ? entry.stashedAt * 1000 - now : 0
    const ago = entry.stashedAt > 0 ? formatRelative(ageMs) : ''

    return (
      <div
        className={`stash-list-item${selected ? ' selected' : ''}`}
        onClick={this.onClick}
        onContextMenu={this.onContextMenu}
        role="row"
        aria-selected={selected}
      >
        <Octicon symbol={octicons.fileDirectory} />
        <div className="stash-list-item__main">
          <div className="stash-list-item__title">{displayMessage}</div>
          <div className="stash-list-item__meta">
            {entry.branchName && (
              <span className="stash-list-item__branch">
                {entry.branchName}
              </span>
            )}
            {ago && <span className="stash-list-item__age">{ago}</span>}
          </div>
        </div>
      </div>
    )
  }

  private onClick = () => {
    this.props.onClick(this.props.entry)
  }

  private onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (this.props.onContextMenu) {
      e.preventDefault()
      this.props.onContextMenu(this.props.entry, e)
    }
  }
}
