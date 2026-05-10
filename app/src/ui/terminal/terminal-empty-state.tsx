import * as React from 'react'

interface IProps {
  readonly onNewTab: () => void
}

/**
 * Friendlier empty-state for the terminal panel: a primary CTA to spawn
 * the first session plus a chip line reminding the user of the toggle
 * and search shortcuts.
 */
export const TerminalEmptyState: React.FC<IProps> = ({ onNewTab }) => (
  <div className="terminal-empty-state">
    <div className="terminal-empty-state__title">No terminal sessions</div>
    <button
      type="button"
      className="terminal-empty-state__cta"
      onClick={onNewTab}
    >
      Open shell here
    </button>
    <div className="terminal-empty-state__hint">
      <kbd>Ctrl</kbd>+<kbd>`</kbd> toggles the panel · <kbd>Ctrl</kbd>+
      <kbd>Shift</kbd>+<kbd>F</kbd> finds in buffer
    </div>
  </div>
)
