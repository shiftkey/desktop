import * as React from 'react'
import { IWorkingDirectoryStats } from '../../models/working-directory-stats'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'

interface IChangeSummaryBadgeProps {
  readonly stats: IWorkingDirectoryStats | null
  readonly changedFilesCount: number
}

/** Displays a compact summary of working-directory changes. */
export class ChangeSummaryBadge extends React.Component<
  IChangeSummaryBadgeProps,
  {}
> {
  public render() {
    const { changedFilesCount, stats } = this.props
    const files = changedFilesCount
    const additions = stats?.additions ?? 0
    const deletions = stats?.deletions ?? 0

    const filesLabel = files === 1 ? 'file' : 'files'
    const tooltip = `${files} ${filesLabel} changed • ${additions} additions • ${deletions} deletions`

    return (
      <TooltippedContent
        tooltip={tooltip}
        direction={TooltipDirection.NORTH}
        className="change-summary-badge-wrapper"
      >
        <span className="change-summary-badge">
          <span className="files-changed">
            {files} {filesLabel}
          </span>
          <span className="additions">+{additions}</span>{' '}
          <span className="deletions">-{deletions}</span>
        </span>
      </TooltippedContent>
    )
  }
}
