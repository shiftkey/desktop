/**
 * Persistence of terminal scrollback to `localStorage`, keyed per session.
 *
 * The key format is single-sourced here so the writer (`XtermView`, which
 * serializes the xterm buffer) and the reaper (`AppStore`, which deletes the
 * key when a session is permanently dropped) can never drift apart. Without
 * the reaper, every terminal ever opened would leave a key behind — session
 * ids are unique per spawn — and `localStorage` would grow unbounded until it
 * hit the quota and broke writes for unrelated app state.
 */

const SCROLLBACK_PREFIX = 'terminal-scrollback-v1:'

/** The `localStorage` key under which a session's scrollback is stored. */
export function terminalScrollbackKey(sessionId: string): string {
  return `${SCROLLBACK_PREFIX}${sessionId}`
}

/** Read a session's persisted scrollback, or null if absent/unavailable. */
export function loadTerminalScrollback(sessionId: string): string | null {
  try {
    return localStorage.getItem(terminalScrollbackKey(sessionId))
  } catch {
    // localStorage may be unavailable in some contexts — non-fatal.
    return null
  }
}

/**
 * Persist a session's scrollback. An empty payload removes the key rather
 * than storing a useless empty entry.
 */
export function saveTerminalScrollback(
  sessionId: string,
  content: string
): void {
  try {
    if (content.length > 0) {
      localStorage.setItem(terminalScrollbackKey(sessionId), content)
    } else {
      localStorage.removeItem(terminalScrollbackKey(sessionId))
    }
  } catch {
    // best-effort; localStorage may be unavailable or over quota.
  }
}

/** Delete a session's persisted scrollback (called when a session is dropped). */
export function clearTerminalScrollback(sessionId: string): void {
  try {
    localStorage.removeItem(terminalScrollbackKey(sessionId))
  } catch {
    // non-fatal
  }
}
