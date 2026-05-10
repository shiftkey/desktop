import {
  TerminalStore,
  IHeightStore,
  _internals,
} from '../../../src/lib/stores/terminal-store'
import { ITerminalSessionSnapshot } from '../../../src/lib/terminal/pty-types'

class FakeHeightStore implements IHeightStore {
  public data: Map<string, string> = new Map()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

const snap = (
  over: Partial<ITerminalSessionSnapshot> = {}
): ITerminalSessionSnapshot => ({
  id: 'sess-1',
  repositoryId: 1,
  cwd: '/tmp',
  shell: '/bin/bash',
  cols: 80,
  rows: 24,
  createdAt: 1700000000000,
  status: 'running',
  exitCode: null,
  liveCwd: null,
  hasActivity: false,
  lastExitCode: null,
  title: null,
  ...over,
})

describe('TerminalStore', () => {
  describe('initial state', () => {
    it('defaults to visible (so first-launch users see a terminal)', () => {
      const store = new TerminalStore()
      const s = store.getState()
      expect(s.visible).toBe(true)
      expect(s.height).toBe(_internals.DEFAULT_HEIGHT)
      expect(s.activeSessionId).toBeNull()
      expect(s.sessions.size).toBe(0)
      expect(s.tabsByRepoId.size).toBe(0)
      expect(s.activeByRepoId.size).toBe(0)
    })

    it('respects a persisted "hidden" preference', () => {
      const fake = new FakeHeightStore()
      fake.setItem(_internals.VISIBLE_KEY, 'hidden')
      const store = new TerminalStore(fake)
      expect(store.getState().visible).toBe(false)
    })

    it('respects a persisted "visible" preference', () => {
      const fake = new FakeHeightStore()
      fake.setItem(_internals.VISIBLE_KEY, 'visible')
      const store = new TerminalStore(fake)
      expect(store.getState().visible).toBe(true)
    })

    it('toggle persists the new visibility', () => {
      const fake = new FakeHeightStore()
      const store = new TerminalStore(fake)
      // starts visible
      store.toggle()
      expect(store.getState().visible).toBe(false)
      expect(fake.getItem(_internals.VISIBLE_KEY)).toBe('hidden')
      store.toggle()
      expect(fake.getItem(_internals.VISIBLE_KEY)).toBe('visible')
    })

    it('hydrates persisted height from storage', () => {
      const fake = new FakeHeightStore()
      fake.setItem(_internals.HEIGHT_KEY, '320')
      const store = new TerminalStore(fake)
      expect(store.getState().height).toBe(320)
    })

    it('clamps an absurdly large persisted height down', () => {
      const fake = new FakeHeightStore()
      fake.setItem(_internals.HEIGHT_KEY, '999999')
      const store = new TerminalStore(fake)
      expect(store.getState().height).toBe(_internals.MAX_HEIGHT)
    })

    it('falls back to default for invalid stored height', () => {
      const fake = new FakeHeightStore()
      fake.setItem(_internals.HEIGHT_KEY, 'banana')
      const store = new TerminalStore(fake)
      expect(store.getState().height).toBe(_internals.DEFAULT_HEIGHT)
    })
  })

  describe('toggle / show / hide', () => {
    it('toggle flips visibility and emits an update', () => {
      // Default is visible, so first toggle hides, second shows.
      const store = new TerminalStore()
      let updates = 0
      store.onDidUpdate(() => updates++)
      store.toggle()
      expect(store.getState().visible).toBe(false)
      store.toggle()
      expect(store.getState().visible).toBe(true)
      expect(updates).toBe(2)
    })

    it('show is a no-op when already visible', () => {
      const store = new TerminalStore()
      // store starts visible by default
      let updates = 0
      store.onDidUpdate(() => updates++)
      store.show()
      expect(updates).toBe(0)
    })

    it('hide is a no-op when already hidden', () => {
      const store = new TerminalStore()
      store.hide() // first hide actually hides
      let updates = 0
      store.onDidUpdate(() => updates++)
      store.hide()
      expect(updates).toBe(0)
    })
  })

  describe('setHeight', () => {
    it('clamps to MIN_HEIGHT and persists', () => {
      const fake = new FakeHeightStore()
      const store = new TerminalStore(fake)
      store.setHeight(10)
      expect(store.getState().height).toBe(_internals.MIN_HEIGHT)
      expect(fake.getItem(_internals.HEIGHT_KEY)).toBe(
        String(_internals.MIN_HEIGHT)
      )
    })

    it('clamps to MAX_HEIGHT and persists', () => {
      const fake = new FakeHeightStore()
      const store = new TerminalStore(fake)
      store.setHeight(99999)
      expect(store.getState().height).toBe(_internals.MAX_HEIGHT)
    })

    it('skips updates when the height is unchanged', () => {
      const store = new TerminalStore()
      store.setHeight(300)
      let updates = 0
      store.onDidUpdate(() => updates++)
      store.setHeight(300)
      expect(updates).toBe(0)
    })

    it('floors fractional heights', () => {
      const store = new TerminalStore()
      store.setHeight(199.7)
      expect(store.getState().height).toBe(199)
    })
  })

  describe('session lifecycle', () => {
    it('registerSession stores the session, appends to tabs, and makes it active', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 7 }))
      const s = store.getState()
      expect(s.sessions.has('a')).toBe(true)
      expect(s.tabsByRepoId.get(7)).toEqual(['a'])
      expect(s.activeByRepoId.get(7)).toBe('a')
      expect(s.activeSessionId).toBe('a')
    })

    it('registerSession appends additional tabs in order for the same repo', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 7 }))
      store.registerSession(snap({ id: 'b', repositoryId: 7 }))
      const s = store.getState()
      expect(s.tabsByRepoId.get(7)).toEqual(['a', 'b'])
      // newest is active
      expect(s.activeSessionId).toBe('b')
      expect(s.activeByRepoId.get(7)).toBe('b')
    })

    it('selectSession flips the active id and remembers it for the repo', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 7 }))
      store.registerSession(snap({ id: 'b', repositoryId: 7 }))
      store.selectSession('a')
      expect(store.getState().activeSessionId).toBe('a')
      expect(store.getState().activeByRepoId.get(7)).toBe('a')
    })

    it('updateSession patches an existing snapshot in place', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', cols: 80 }))
      store.updateSession(snap({ id: 'a', cols: 120 }))
      expect(store.getState().sessions.get('a')!.cols).toBe(120)
    })

    it('updateSession is a no-op for unknown ids', () => {
      const store = new TerminalStore()
      let updates = 0
      store.onDidUpdate(() => updates++)
      store.updateSession(snap({ id: 'unknown' }))
      expect(updates).toBe(0)
    })

    it('removeSession clears bindings and active id when last tab', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 1 }))
      store.removeSession('a')
      const s = store.getState()
      expect(s.sessions.has('a')).toBe(false)
      expect(s.tabsByRepoId.has(1)).toBe(false)
      expect(s.activeByRepoId.has(1)).toBe(false)
      expect(s.activeSessionId).toBeNull()
    })

    it('removeSession picks the previous tab as active when removing the active one', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 1 }))
      store.registerSession(snap({ id: 'b', repositoryId: 1 }))
      // 'b' is now active. Remove 'b'.
      store.removeSession('b')
      const s = store.getState()
      expect(s.tabsByRepoId.get(1)).toEqual(['a'])
      expect(s.activeSessionId).toBe('a')
      expect(s.activeByRepoId.get(1)).toBe('a')
    })

    it('removeSession keeps the active id when a different session was active', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 1 }))
      store.registerSession(snap({ id: 'b', repositoryId: 2 }))
      // 'b' is now active. Remove 'a'.
      store.removeSession('a')
      expect(store.getState().activeSessionId).toBe('b')
    })

    it('removeSession is a no-op for unknown ids', () => {
      const store = new TerminalStore()
      let updates = 0
      store.onDidUpdate(() => updates++)
      store.removeSession('nope')
      expect(updates).toBe(0)
    })
  })

  describe('markExited / replaceSession', () => {
    const memStore = () => new FakeHeightStore()

    it('on exit the session stays in the store with status=exited', () => {
      const s = new TerminalStore(memStore())
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.markExited('s1', 137)
      const sess = s.getState().sessions.get('s1')!
      expect(sess.status).toBe('exited')
      expect(sess.exitCode).toBe(137)
      expect(s.getState().tabsByRepoId.get(7)).toEqual(['s1'])
    })

    it('replaceSession swaps a session in-place preserving its tab position', () => {
      const s = new TerminalStore(memStore())
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      s.registerSession(snap({ id: 's3', repositoryId: 7 }))
      // s2 is the middle tab. Replace it with a fresh snapshot id 'sNew'.
      s.markExited('s2', 1)
      s.replaceSession('s2', snap({ id: 'sNew', repositoryId: 7 }))
      expect(s.getState().tabsByRepoId.get(7)).toEqual(['s1', 'sNew', 's3'])
      // The replaced session is gone:
      expect(s.getState().sessions.has('s2')).toBe(false)
      expect(s.getState().sessions.get('sNew')!.id).toBe('sNew')
    })

    it('replaceSession updates activeSessionId when the active was replaced', () => {
      const s = new TerminalStore(memStore())
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.markExited('s1', 1)
      s.replaceSession('s1', snap({ id: 'sNew', repositoryId: 7 }))
      expect(s.getState().activeSessionId).toBe('sNew')
      expect(s.getState().activeByRepoId.get(7)).toBe('sNew')
    })

    it('markExited is a no-op for an unknown session id', () => {
      const s = new TerminalStore(memStore())
      s.markExited('unknown', 1)
      expect(s.getState().sessions.size).toBe(0)
    })
  })

  describe('selectRepo', () => {
    it('switches activeSessionId to the last-active session for that repo', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 1 }))
      store.registerSession(snap({ id: 'b', repositoryId: 2 }))
      store.selectRepo(1)
      expect(store.getState().activeSessionId).toBe('a')
      store.selectRepo(2)
      expect(store.getState().activeSessionId).toBe('b')
    })

    it('falls back to the first tab when activeByRepoId has no entry', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 1 }))
      store.registerSession(snap({ id: 'b', repositoryId: 1 }))
      // Select something else, then return — the last-active should win.
      store.selectSession('a')
      store.selectRepo(2)
      store.selectRepo(1)
      expect(store.getState().activeSessionId).toBe('a')
    })

    it('clears activeSessionId when the repo has no tabs', () => {
      const store = new TerminalStore()
      store.selectRepo(99)
      expect(store.getState().activeSessionId).toBeNull()
    })

    it('clears activeSessionId when given null', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a' }))
      store.selectRepo(null)
      expect(store.getState().activeSessionId).toBeNull()
    })
  })

  describe('mergeMeta / markActivity', () => {
    it('mergeMeta updates liveCwd / lastExitCode without touching tabs', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.mergeMeta('s1', { liveCwd: '/tmp/x' })
      expect(s.getState().sessions.get('s1')!.liveCwd).toBe('/tmp/x')
      expect(s.getState().tabsByRepoId.get(7)).toEqual(['s1'])
      s.mergeMeta('s1', { lastExitCode: 1 })
      expect(s.getState().sessions.get('s1')!.lastExitCode).toBe(1)
      // liveCwd still set (per-field merge)
      expect(s.getState().sessions.get('s1')!.liveCwd).toBe('/tmp/x')
    })

    it('mergeMeta is a no-op for unknown ids', () => {
      const s = new TerminalStore()
      let updates = 0
      s.onDidUpdate(() => updates++)
      s.mergeMeta('ghost', { liveCwd: '/tmp' })
      expect(updates).toBe(0)
    })

    it('markActivity flips hasActivity for inactive tabs only', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 })) // becomes active
      s.registerSession(snap({ id: 's2', repositoryId: 7 })) // becomes active, s1 inactive
      s.markActivity('s1')
      expect(s.getState().sessions.get('s1')!.hasActivity).toBe(true)
      s.markActivity('s2') // already active — no-op
      expect(s.getState().sessions.get('s2')!.hasActivity).toBe(false)
    })

    it('selecting a session clears its activity flag', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      s.markActivity('s1')
      s.selectSession('s1')
      expect(s.getState().sessions.get('s1')!.hasActivity).toBe(false)
    })
  })

  describe('reorderTab / setTitle', () => {
    it('reorderTab moves a session to a new index within its repo', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      s.registerSession(snap({ id: 's3', repositoryId: 7 }))
      s.reorderTab(7, 's3', 0)
      expect(s.getState().tabsByRepoId.get(7)).toEqual(['s3', 's1', 's2'])
    })

    it('reorderTab clamps toIndex to valid range', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      s.reorderTab(7, 's1', 999) // beyond end
      expect(s.getState().tabsByRepoId.get(7)).toEqual(['s2', 's1'])
    })

    it('setTitle updates the session title via mergeMeta', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.setTitle('s1', 'build watcher')
      expect(s.getState().sessions.get('s1')!.title).toBe('build watcher')
    })

    it('reorderTab is a no-op for an unknown session id', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.reorderTab(7, 'unknown', 0)
      expect(s.getState().tabsByRepoId.get(7)).toEqual(['s1'])
    })
  })

  describe('applySplit / layoutByRepoId', () => {
    it('registerSession sets leaf layout for a new repo', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      const layout = s.getState().layoutByRepoId.get(7)
      expect(layout).toEqual({ kind: 'leaf', sessionId: 's1' })
    })

    it('registerSession for existing repo does not overwrite layout', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      // Second register should leave the layout as the leaf for s1
      const layout = s.getState().layoutByRepoId.get(7)
      expect(layout).toEqual({ kind: 'leaf', sessionId: 's1' })
    })

    it('applySplit updates layout to a split node', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      s.applySplit(7, 's1', 'horizontal', 's2')
      const layout = s.getState().layoutByRepoId.get(7)
      expect(layout).toEqual({
        kind: 'split',
        orientation: 'horizontal',
        ratio: 0.5,
        a: { kind: 'leaf', sessionId: 's1' },
        b: { kind: 'leaf', sessionId: 's2' },
      })
    })

    it('applySplit with vertical orientation', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      s.applySplit(7, 's1', 'vertical', 's2')
      const layout = s.getState().layoutByRepoId.get(7)
      expect(layout).toMatchObject({ kind: 'split', orientation: 'vertical' })
    })

    it('removeSession collapses a split back to a leaf', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      s.applySplit(7, 's1', 'horizontal', 's2')
      s.removeSession('s2')
      const layout = s.getState().layoutByRepoId.get(7)
      expect(layout).toEqual({ kind: 'leaf', sessionId: 's1' })
    })

    it('removeSession of last session deletes the layout entry', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.removeSession('s1')
      expect(s.getState().layoutByRepoId.has(7)).toBe(false)
    })

    it('setSplitRatio updates ratio at the root split', () => {
      const s = new TerminalStore()
      s.registerSession(snap({ id: 's1', repositoryId: 7 }))
      s.registerSession(snap({ id: 's2', repositoryId: 7 }))
      s.applySplit(7, 's1', 'horizontal', 's2')
      s.setSplitRatio(7, [], 0.75)
      const layout = s.getState().layoutByRepoId.get(7)
      expect(layout).toMatchObject({ kind: 'split', ratio: 0.75 })
    })

    it('setSplitRatio is a no-op for unknown repo', () => {
      const s = new TerminalStore()
      // Should not throw
      s.setSplitRatio(99, [], 0.5)
      expect(s.getState().layoutByRepoId.has(99)).toBe(false)
    })

    it('initial layoutByRepoId is empty', () => {
      const s = new TerminalStore()
      expect(s.getState().layoutByRepoId.size).toBe(0)
    })
  })
})
