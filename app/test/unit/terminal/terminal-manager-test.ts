import { TerminalManager } from '../../../src/main-process/terminal/terminal-manager'
import { IPtyOptions } from '../../../src/lib/terminal/pty-types'
import { MockPty, MockPort } from '../../helpers/mock-pty'

const baseOptions = (): IPtyOptions => ({
  shell: '/bin/bash',
  args: [],
  cwd: '/tmp',
  env: {},
  cols: 80,
  rows: 24,
})

function makeManager() {
  let nextId = 0
  const ptys: MockPty[] = []
  const factory = () => {
    const p = new MockPty()
    ptys.push(p)
    return p
  }
  const manager = new TerminalManager({
    factory,
    newId: () => `id-${nextId++}`,
  })
  return { manager, ptys }
}

describe('TerminalManager', () => {
  it('spawn() creates a session, starts it, and returns a snapshot', () => {
    const { manager, ptys } = makeManager()
    const port = new MockPort()
    const snap = manager.spawn(1, baseOptions(), port)

    expect(snap.id).toBe('id-0')
    expect(snap.repositoryId).toBe(1)
    expect(snap.status).toBe('running')
    expect(port.started).toBe(true)
    expect(ptys).toHaveLength(1)
    expect(manager.size()).toBe(1)
  })

  it('isolates state across multiple sessions', () => {
    const { manager } = makeManager()
    const port1 = new MockPort()
    const port2 = new MockPort()
    const a = manager.spawn(1, baseOptions(), port1)
    const b = manager.spawn(2, baseOptions(), port2)
    expect(a.id).not.toBe(b.id)
    expect(manager.size()).toBe(2)
    expect(manager.getSnapshot(a.id)?.repositoryId).toBe(1)
    expect(manager.getSnapshot(b.id)?.repositoryId).toBe(2)
  })

  it('kill() removes the session from the map', () => {
    const { manager, ptys } = makeManager()
    const snap = manager.spawn(1, baseOptions(), new MockPort())
    manager.kill(snap.id)
    expect(manager.size()).toBe(0)
    expect(manager.getSnapshot(snap.id)).toBeNull()
    expect(ptys[0].killed).toBe(true)
  })

  it('kill() with an unknown id is a no-op', () => {
    const { manager } = makeManager()
    expect(() => manager.kill('does-not-exist')).not.toThrow()
  })

  it('resize() forwards to the matching session', () => {
    const { manager, ptys } = makeManager()
    const snap = manager.spawn(1, baseOptions(), new MockPort())
    manager.resize(snap.id, 100, 30)
    expect(ptys[0].resizes[0]).toEqual({ cols: 100, rows: 30 })
  })

  it('resize() with an unknown id is a no-op', () => {
    const { manager } = makeManager()
    expect(() => manager.resize('nope', 100, 30)).not.toThrow()
  })

  it('reaps a session automatically when its PTY exits', () => {
    const { manager, ptys } = makeManager()
    const snap = manager.spawn(1, baseOptions(), new MockPort())
    expect(manager.size()).toBe(1)
    ptys[0].emitExit(0)
    expect(manager.size()).toBe(0)
    expect(manager.getSnapshot(snap.id)).toBeNull()
  })

  it('killAll() kills every active session and empties the map', () => {
    const { manager, ptys } = makeManager()
    manager.spawn(1, baseOptions(), new MockPort())
    manager.spawn(2, baseOptions(), new MockPort())
    manager.spawn(3, baseOptions(), new MockPort())
    expect(manager.size()).toBe(3)
    manager.killAll()
    expect(manager.size()).toBe(0)
    expect(ptys.every(p => p.killed)).toBe(true)
  })

  it('uses the default id generator when no override is supplied', () => {
    const manager = new TerminalManager({ factory: () => new MockPty() })
    const snap = manager.spawn(1, baseOptions(), new MockPort())
    expect(snap.id.startsWith('term-')).toBe(true)
  })
})
