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

const snap = (over: Partial<ITerminalSessionSnapshot> = {}): ITerminalSessionSnapshot => ({
  id: 'sess-1',
  repositoryId: 1,
  cwd: '/tmp',
  shell: '/bin/bash',
  cols: 80,
  rows: 24,
  createdAt: 1700000000000,
  status: 'running',
  exitCode: null,
  ...over,
})

describe('TerminalStore', () => {
  describe('initial state', () => {
    it('starts hidden, with no active session, default height', () => {
      const store = new TerminalStore()
      const s = store.getState()
      expect(s.visible).toBe(false)
      expect(s.height).toBe(_internals.DEFAULT_HEIGHT)
      expect(s.activeSessionId).toBeNull()
      expect(s.sessions.size).toBe(0)
      expect(s.sessionByRepoId.size).toBe(0)
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
      const store = new TerminalStore()
      let updates = 0
      store.onDidUpdate(() => updates++)
      store.toggle()
      expect(store.getState().visible).toBe(true)
      store.toggle()
      expect(store.getState().visible).toBe(false)
      expect(updates).toBe(2)
    })

    it('show is a no-op when already visible', () => {
      const store = new TerminalStore()
      store.show()
      let updates = 0
      store.onDidUpdate(() => updates++)
      store.show()
      expect(updates).toBe(0)
    })

    it('hide is a no-op when already hidden', () => {
      const store = new TerminalStore()
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
    it('registerSession stores the session and makes it active', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 7 }))
      const s = store.getState()
      expect(s.sessions.has('a')).toBe(true)
      expect(s.sessionByRepoId.get(7)).toBe('a')
      expect(s.activeSessionId).toBe('a')
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

    it('removeSession clears bindings and active id', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 1 }))
      store.removeSession('a')
      const s = store.getState()
      expect(s.sessions.has('a')).toBe(false)
      expect(s.sessionByRepoId.has(1)).toBe(false)
      expect(s.activeSessionId).toBeNull()
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

    it('removeSession does not delete repo binding owned by another session', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'old', repositoryId: 1 }))
      store.registerSession(snap({ id: 'new', repositoryId: 1 }))
      // sessionByRepoId.get(1) === 'new' after the second register.
      store.removeSession('old')
      expect(store.getState().sessionByRepoId.get(1)).toBe('new')
    })
  })

  describe('selectRepo', () => {
    it('switches activeSessionId to the session bound to that repo', () => {
      const store = new TerminalStore()
      store.registerSession(snap({ id: 'a', repositoryId: 1 }))
      store.registerSession(snap({ id: 'b', repositoryId: 2 }))
      store.selectRepo(1)
      expect(store.getState().activeSessionId).toBe('a')
      store.selectRepo(2)
      expect(store.getState().activeSessionId).toBe('b')
    })

    it('clears activeSessionId when the repo has no session', () => {
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
})
