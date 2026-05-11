import * as React from 'react'
import { IWorkingDirectoryStats } from '../../models/working-directory-stats'
import { TooltippedContent } from '../lib/tooltipped-content'
import { TooltipDirection } from '../lib/tooltip'

interface IChangeSummaryBadgeProps {
  readonly stats: IWorkingDirectoryStats | null
}

/** Displays a compact summary of working-directory changes. */
export class ChangeSummaryBadge extends React.Component<
  IChangeSummaryBadgeProps,
  {}
> {
  public render() {
    const { stats } = this.props

    if (stats === null || stats.files === 0) {
      return null
    }

    const { files, additions, deletions } = stats

    const tooltip = `${files} files changed • ${additions} additions • ${deletions} deletions`
    const filesLabel = files === 1 ? 'file' : 'files'

    return (
      <TooltippedContent
        tooltip={tooltip}
        direction={TooltipDirection.NORTH}
      >
        <span className="change-summary-badge">
          {files} {filesLabel}{' '}
          <span className="additions">+{additions}</span>{' '}
          <span className="deletions">-{deletions}</span>
        </span>
      </TooltippedContent>
    )
  }
}
