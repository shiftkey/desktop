import { PtySession } from '../../../src/main-process/terminal/pty-session'
import { IPtyOptions } from '../../../src/lib/terminal/pty-types'
import { MockPty, MockPort } from '../../helpers/mock-pty'

const baseOptions = (): IPtyOptions => ({
  shell: '/bin/bash',
  args: [],
  cwd: '/tmp',
  env: { TERM: 'xterm-256color' },
  cols: 80,
  rows: 24,
})

function makeSession(opts?: Partial<IPtyOptions>) {
  const pty = new MockPty()
  const port = new MockPort()
  const session = new PtySession({
    factory: () => pty,
    port,
    options: { ...baseOptions(), ...opts },
    id: 'sess-1',
    repositoryId: 7,
    now: () => 1700000000000,
  })
  return { session, pty, port }
}

describe('PtySession', () => {
  describe('initial state', () => {
    it('snapshot is "starting" before start() is called', () => {
      const { session } = makeSession()
      const snap = session.getSnapshot()
      expect(snap.status).toBe('starting')
      expect(snap.exitCode).toBeNull()
      expect(snap.cols).toBe(80)
      expect(snap.rows).toBe(24)
      expect(snap.id).toBe('sess-1')
      expect(snap.repositoryId).toBe(7)
      expect(snap.createdAt).toBe(1700000000000)
    })

    it('returns a fresh snapshot copy on each call', () => {
      const { session } = makeSession()
      expect(session.getSnapshot()).not.toBe(session.getSnapshot())
    })
  })

  describe('start', () => {
    it('flips status to "running" and starts the port', () => {
      const { session, port } = makeSession()
      session.start()
      expect(session.getSnapshot().status).toBe('running')
      expect(port.started).toBe(true)
    })

    it('forwards PTY output bytes through the port as a data message', () => {
      const { session, pty, port } = makeSession()
      session.start()
      pty.emitData('hello')
      expect(port.posted).toHaveLength(1)
      expect(port.posted[0].message.type).toBe('data')
      expect(Array.from(port.posted[0].message.bytes)).toEqual(
        Array.from(Buffer.from('hello', 'utf8'))
      )
    })

    it('forwards Buffer chunks from the PTY without corruption', () => {
      const { session, pty, port } = makeSession()
      session.start()
      pty.emitData(Buffer.from([0xff, 0x00, 0x42]))
      expect(Array.from(port.posted[0].message.bytes)).toEqual([0xff, 0, 0x42])
    })

    it('is idempotent if called twice', () => {
      const { session, pty } = makeSession()
      session.start()
      const beforeSnap = session.getSnapshot()
      session.start()
      expect(pty.writes).toHaveLength(0)
      expect(session.getSnapshot().status).toBe(beforeSnap.status)
    })
  })

  describe('write', () => {
    it('forwards string input to the PTY', () => {
      const { session, pty } = makeSession()
      session.start()
      session.write('ls\n')
      expect(pty.writes).toHaveLength(1)
      expect(pty.writes[0]).toBe('ls\n')
    })

    it('forwards Uint8Array input as a Buffer', () => {
      const { session, pty } = makeSession()
      session.start()
      session.write(new Uint8Array([0x61, 0x62]))
      expect(pty.writes).toHaveLength(1)
      const w = pty.writes[0]
      expect(Buffer.isBuffer(w)).toBe(true)
      expect((w as Buffer).toString()).toBe('ab')
    })

    it('is a no-op before start()', () => {
      const { session, pty } = makeSession()
      session.write('nope')
      expect(pty.writes).toHaveLength(0)
    })
  })

  describe('resize', () => {
    it('clamps to >=1 in each dimension', () => {
      const { session, pty } = makeSession()
      session.start()
      session.resize(0, 0)
      expect(pty.resizes[0]).toEqual({ cols: 1, rows: 1 })
    })

    it('floors fractional values', () => {
      const { session, pty } = makeSession()
      session.start()
      session.resize(120.7, 30.9)
      expect(pty.resizes[0]).toEqual({ cols: 120, rows: 30 })
    })

    it('skips no-op resizes (same cols+rows)', () => {
      const { session, pty } = makeSession()
      session.start()
      session.resize(80, 24)
      expect(pty.resizes).toHaveLength(0)
    })

    it('updates snapshot to the new size', () => {
      const { session } = makeSession()
      session.start()
      session.resize(100, 30)
      const s = session.getSnapshot()
      expect(s.cols).toBe(100)
      expect(s.rows).toBe(30)
    })

    it('is a no-op before start()', () => {
      const { session, pty } = makeSession()
      session.resize(100, 30)
      expect(pty.resizes).toHaveLength(0)
    })
  })

  describe('renderer messages on the port', () => {
    it('forwards an "input" message to the PTY', () => {
      const { session, pty, port } = makeSession()
      session.start()
      port.emitRendererMessage({
        type: 'input',
        bytes: new Uint8Array([0x71]),
      })
      expect(pty.writes).toHaveLength(1)
      expect((pty.writes[0] as Buffer).toString()).toBe('q')
    })

    it('applies a "resize" message via resize()', () => {
      const { session, pty, port } = makeSession()
      session.start()
      port.emitRendererMessage({ type: 'resize', cols: 90, rows: 25 })
      expect(pty.resizes[0]).toEqual({ cols: 90, rows: 25 })
    })

    it('ignores unknown messages without throwing', () => {
      const { session, pty, port } = makeSession()
      session.start()
      port.emitRendererMessage({ type: 'unknown' })
      port.emitRendererMessage(null)
      port.emitRendererMessage('not-an-object')
      expect(pty.writes).toHaveLength(0)
      expect(pty.resizes).toHaveLength(0)
    })
  })

  describe('exit lifecycle', () => {
    it('flips status to "exited" with exit code, posts an exit message, and notifies listeners', () => {
      const { session, pty, port } = makeSession()
      const seen: number[] = []
      session.start()
      session.onExit(snap => seen.push(snap.exitCode!))
      pty.emitExit(42)

      expect(session.getSnapshot().status).toBe('exited')
      expect(session.getSnapshot().exitCode).toBe(42)
      expect(port.posted.find(p => p.message.type === 'exit')).toBeDefined()
      expect(seen).toEqual([42])
    })

    it('ignores port "close" if PTY already exited', () => {
      const { session, pty, port } = makeSession()
      session.start()
      pty.emitExit(0)
      // Port close should not throw or attempt to re-kill.
      port.emitClose()
      expect(pty.killed).toBe(false)
    })

    it('kills the PTY when the port closes from the renderer side', () => {
      const { session, pty, port } = makeSession()
      session.start()
      port.emitClose()
      expect(pty.killed).toBe(true)
    })
  })

  describe('OSC events', () => {
    it('emits liveCwd updates on OSC 7 to the renderer port', () => {
      const { session, pty, port } = makeSession()
      session.start()
      pty.emitData('hello\x1b]7;file:///tmp/x\x1b\\bye')
      const meta = port.posted.find(p => p.message.type === 'meta')?.message
      expect(meta).toEqual({ type: 'meta', liveCwd: '/tmp/x' })
      expect(session.getSnapshot().liveCwd).toBe('/tmp/x')
    })

    it('emits lastExitCode updates on OSC 133;D', () => {
      const { session, pty, port } = makeSession()
      session.start()
      pty.emitData('\x1b]133;A\x1b\\\x1b]133;B\x1b\\\x1b]133;D;7\x1b\\')
      const meta = port.posted.find(
        p => p.message.type === 'meta' && p.message.lastExitCode === 7
      )?.message
      expect(meta).toBeDefined()
      expect(session.getSnapshot().lastExitCode).toBe(7)
    })
  })

  describe('kill', () => {
    it('forwards a kill signal to the PTY and closes the port', () => {
      const { session, pty, port } = makeSession()
      session.start()
      session.kill('SIGKILL')
      expect(pty.killed).toBe(true)
      expect(pty.killSignal).toBe('SIGKILL')
      expect(port.closed).toBe(true)
    })

    it('defaults to SIGHUP', () => {
      const { session, pty } = makeSession()
      session.start()
      session.kill()
      expect(pty.killSignal).toBe('SIGHUP')
    })

    it('is safe to call before start()', () => {
      const { session, pty } = makeSession()
      session.kill()
      expect(pty.killed).toBe(false) // PTY never created
      // Second kill should not throw either.
      session.kill()
    })

    it('swallows errors thrown by the PTY kill call', () => {
      const pty = new MockPty()
      pty.kill = () => {
        throw new Error('already dead')
      }
      const port = new MockPort()
      const session = new PtySession({
        factory: () => pty,
        port,
        options: baseOptions(),
        id: 's',
        repositoryId: 1,
      })
      session.start()
      expect(() => session.kill()).not.toThrow()
      expect(port.closed).toBe(true)
    })
  })
})
