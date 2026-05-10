import {
  registerTerminalIpc,
  IIpcMain,
} from '../../../src/main-process/terminal/terminal-ipc'
import { TERMINAL_IPC } from '../../../src/lib/terminal/ipc-channels'
import { MockPty, MockPort } from '../../helpers/mock-pty'

class FakeIpcMain implements IIpcMain {
  public handlers: Map<string, (event: any, ...args: any[]) => any> = new Map()

  public handle(channel: string, fn: (event: any, ...args: any[]) => any) {
    this.handlers.set(channel, fn)
  }

  public removeHandler(channel: string) {
    this.handlers.delete(channel)
  }

  public on() {}
  public removeAllListeners() {}

  public async invoke(channel: string, args?: any) {
    const h = this.handlers.get(channel)
    if (!h) throw new Error(`no handler for ${channel}`)
    return h({}, args)
  }
}

describe('registerTerminalIpc', () => {
  describe('with node-pty available', () => {
    function setup() {
      const ipc = new FakeIpcMain()
      const ptyInstances: MockPty[] = []
      const ptyMod = {
        spawn: () => {
          const p = new MockPty()
          ptyInstances.push(p)
          return p
        },
      }
      const portPairs: Array<{ main: MockPort; renderer: MockPort }> = []
      const portPairFactory = () => {
        const pair = { main: new MockPort(), renderer: new MockPort() }
        portPairs.push(pair)
        return pair
      }
      const reg = registerTerminalIpc(ipc, () => ptyMod, portPairFactory)
      return { ipc, reg, ptyInstances, portPairs }
    }

    it('registers spawn, kill, and resize handlers', () => {
      const { ipc } = setup()
      expect(ipc.handlers.has(TERMINAL_IPC.SPAWN)).toBe(true)
      expect(ipc.handlers.has(TERMINAL_IPC.KILL)).toBe(true)
      expect(ipc.handlers.has(TERMINAL_IPC.RESIZE)).toBe(true)
    })

    it('spawn returns a session id and the renderer-facing port', async () => {
      const { ipc, ptyInstances, portPairs } = setup()
      const result = await ipc.invoke(TERMINAL_IPC.SPAWN, {
        repositoryId: 1,
        options: {
          shell: '/bin/bash',
          args: [],
          cwd: '/tmp',
          env: {},
          cols: 80,
          rows: 24,
        },
      })
      expect(typeof result.sessionId).toBe('string')
      expect(result.sessionId.length).toBeGreaterThan(0)
      expect(result.port).toBe(portPairs[0].renderer)
      expect(ptyInstances).toHaveLength(1)
    })

    it('kill terminates the session', async () => {
      const { ipc, ptyInstances } = setup()
      const r = await ipc.invoke(TERMINAL_IPC.SPAWN, {
        repositoryId: 1,
        options: {
          shell: 'sh',
          args: [],
          cwd: '/',
          env: {},
          cols: 80,
          rows: 24,
        },
      })
      await ipc.invoke(TERMINAL_IPC.KILL, r.sessionId)
      expect(ptyInstances[0].killed).toBe(true)
    })

    it('resize forwards size to the PTY', async () => {
      const { ipc, ptyInstances } = setup()
      const r = await ipc.invoke(TERMINAL_IPC.SPAWN, {
        repositoryId: 1,
        options: {
          shell: 'sh',
          args: [],
          cwd: '/',
          env: {},
          cols: 80,
          rows: 24,
        },
      })
      await ipc.invoke(TERMINAL_IPC.RESIZE, {
        sessionId: r.sessionId,
        cols: 100,
        rows: 30,
      })
      expect(ptyInstances[0].resizes[0]).toEqual({ cols: 100, rows: 30 })
    })

    it('dispose unregisters all handlers and kills sessions', async () => {
      const { ipc, reg, ptyInstances } = setup()
      await ipc.invoke(TERMINAL_IPC.SPAWN, {
        repositoryId: 1,
        options: {
          shell: 'sh',
          args: [],
          cwd: '/',
          env: {},
          cols: 1,
          rows: 1,
        },
      })
      reg.dispose()
      expect(ipc.handlers.has(TERMINAL_IPC.SPAWN)).toBe(false)
      expect(ipc.handlers.has(TERMINAL_IPC.KILL)).toBe(false)
      expect(ipc.handlers.has(TERMINAL_IPC.RESIZE)).toBe(false)
      expect(ptyInstances[0].killed).toBe(true)
    })
  })

  describe('when node-pty fails to load', () => {
    it('returns null manager and registers a rejecting spawn handler', async () => {
      const ipc = new FakeIpcMain()
      const reg = registerTerminalIpc(
        ipc,
        () => null,
        () => ({ main: new MockPort(), renderer: new MockPort() })
      )
      expect(reg.manager).toBeNull()
      expect(ipc.handlers.has(TERMINAL_IPC.SPAWN)).toBe(true)
      // Kill/resize should not be registered.
      expect(ipc.handlers.has(TERMINAL_IPC.KILL)).toBe(false)

      await expect(ipc.invoke(TERMINAL_IPC.SPAWN)).rejects.toThrow(
        /node-pty failed to load/
      )
    })

    it('dispose() removes the rejecting handler', () => {
      const ipc = new FakeIpcMain()
      const reg = registerTerminalIpc(ipc, () => null)
      reg.dispose()
      expect(ipc.handlers.has(TERMINAL_IPC.SPAWN)).toBe(false)
    })
  })
})
