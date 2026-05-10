import * as React from 'react'

const MAX_PREVIEW_LINES = 6

interface IPasteConfirmDialogProps {
  readonly text: string
  readonly onConfirm: (text: string) => void
  readonly onCancel: () => void
}

/**
 * Confirmation dialog shown when the user pastes multi-line or long text into
 * the terminal. Displays a line count, a preview of the first 6 lines, and
 * Paste/Cancel buttons.
 */
export function PasteConfirmDialog(props: IPasteConfirmDialogProps) {
  const { text, onConfirm, onCancel } = props
  const lines = text.split('\n')
  const lineCount = lines.length
  const previewLines = lines.slice(0, MAX_PREVIEW_LINES)
  const extraCount = lineCount - MAX_PREVIEW_LINES

  return (
    <div className="paste-confirm-dialog" role="dialog" aria-modal={true}>
      <div className="paste-confirm-dialog__content">
        <h3 className="paste-confirm-dialog__title">
          {`Paste ${lineCount} lines into terminal?`}
        </h3>
        <pre className="paste-confirm-dialog__preview">
          {previewLines.join('\n')}
        </pre>
        {extraCount > 0 && (
          <p className="paste-confirm-dialog__more">
            {`…and ${extraCount} more`}
          </p>
        )}
        <div className="paste-confirm-dialog__actions">
          <button
            type="button"
            className="paste-confirm-dialog__cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="paste-confirm-dialog__confirm"
            onClick={() => onConfirm(text)}
          >
            Paste anyway
          </button>
        </div>
      </div>
    </div>
  )
}
