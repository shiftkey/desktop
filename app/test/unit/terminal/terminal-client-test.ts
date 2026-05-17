import {
  spawnTerminal,
  killTerminal,
  resizeTerminal,
  makePendingSnapshot,
  attachStoreToPort,
  IIpcRenderer,
  ITerminalStoreSink,
  _setIpcRenderer,
  _resetActivityThrottle,
} from '../../../src/lib/terminal/terminal-client'
import { TERMINAL_IPC } from '../../../src/lib/terminal/ipc-channels'
import { IPtyOptions } from '../../../src/lib/terminal/pty-types'

class FakeIpc implements IIpcRenderer {
  public calls: Array<{ channel: string; args: any[] }> = []
  public response: any = undefined
  /** Captured `on` listeners keyed by channel. */
  public listeners: Map<string, Array<(event: any, ...args: any[]) => void>> =
    new Map()
  /**
   * When a SPAWN invoke fires, deliver this port via the port-transfer
   * listener (mimicking main → renderer port hand-off).
   */
  public portToDeliver: any = null
  /** When set, deliver the port BEFORE the spawn invoke resolves. */
  public deliverBeforeInvokeResolves: boolean = false

  public async invoke(channel: string, ...args: any[]) {
    this.calls.push({ channel, args })
    if (
      channel === TERMINAL_IPC.SPAWN &&
      this.portToDeliver !== null &&
      this.response &&
      this.response.sessionId
    ) {
      const sid: string = this.response.sessionId
      const event = { ports: [this.portToDeliver] }
      const fire = () => {
        const listeners = this.listeners.get(TERMINAL_IPC.PORT_TRANSFER) ?? []
        for (const l of listeners) {
          l(event, { sessionId: sid })
        }
      }
      if (this.deliverBeforeInvokeResolves) {
        fire()
      } else {
        queueMicrotask(fire)
      }
    }
    return this.response
  }
  public on(channel: string, listener: (event: any, ...args: any[]) => void) {
    const list = this.listeners.get(channel) ?? []
    list.push(listener)
    this.listeners.set(channel, list)
  }
  public removeListener(
    channel: string,
    listener: (event: any, ...args: any[]) => void
  ) {
    const list = this.listeners.get(channel) ?? []
    this.listeners.set(
      channel,
      list.filter(l => l !== listener)
    )
  }
}

const baseOptions = (): IPtyOptions => ({
  shell: '/bin/bash',
  args: [],
  cwd: '/tmp',
  env: {},
  cols: 80,
  rows: 24,
})

describe('terminal-client', () => {
  beforeEach(() => {
    // Reset the cached IPC + pending-port maps between tests.
    _setIpcRenderer(null)
  })

  describe('spawnTerminal', () => {
    it('invokes the spawn channel and resolves once the port arrives', async () => {
      const ipc = new FakeIpc()
      const fakePort = { fake: true }
      ipc.response = { sessionId: 'abc' }
      ipc.portToDeliver = fakePort
      const result = await spawnTerminal(1, baseOptions(), ipc)
      expect(result).toEqual({ sessionId: 'abc', port: fakePort })
      expect(ipc.calls[0].channel).toBe(TERMINAL_IPC.SPAWN)
      expect(ipc.calls[0].args[0]).toMatchObject({
        repositoryId: 1,
        options: baseOptions(),
      })
    })

    it('handles the case where the port arrives before the invoke resolves', async () => {
      const ipc = new FakeIpc()
      const fakePort = { early: true }
      ipc.response = { sessionId: 'sess-early' }
      ipc.portToDeliver = fakePort
      ipc.deliverBeforeInvokeResolves = true
      const result = await spawnTerminal(2, baseOptions(), ipc)
      expect(result).toEqual({ sessionId: 'sess-early', port: fakePort })
    })

    it('rejects when the spawn response is malformed', async () => {
      const ipc = new FakeIpc()
      ipc.response = { foo: 'bar' }
      await expect(spawnTerminal(1, baseOptions(), ipc)).rejects.toThrow(
        /invalid response/i
      )
    })
  })

  describe('killTerminal', () => {
    it('invokes the kill channel with the session id', async () => {
      const ipc = new FakeIpc()
      await killTerminal('sess-1', ipc)
      expect(ipc.calls[0].channel).toBe(TERMINAL_IPC.KILL)
      expect(ipc.calls[0].args[0]).toBe('sess-1')
    })
  })

  describe('resizeTerminal', () => {
    it('invokes the resize channel with sessionId / cols / rows', async () => {
      const ipc = new FakeIpc()
      await resizeTerminal('sess-1', 100, 30, ipc)
      expect(ipc.calls[0].channel).toBe(TERMINAL_IPC.RESIZE)
      expect(ipc.calls[0].args[0]).toEqual({
        sessionId: 'sess-1',
        cols: 100,
        rows: 30,
      })
    })
  })

  describe('makePendingSnapshot', () => {
    it('builds a running snapshot from spawn args', () => {
      const snap = makePendingSnapshot('s1', 7, baseOptions(), 1700000000000)
      expect(snap).toEqual({
        id: 's1',
        repositoryId: 7,
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
      })
    })

    it('uses Date.now() when no clock is supplied', () => {
      const before = Date.now()
      const snap = makePendingSnapshot('s', 0, baseOptions())
      const after = Date.now()
      expect(snap.createdAt).toBeGreaterThanOrEqual(before)
      expect(snap.createdAt).toBeLessThanOrEqual(after)
    })
  })

  describe('attachStoreToPort', () => {
    class FakePort {
      public listeners: Array<(event: { data: any }) => void> = []
      public started = 0
      public addEventListener(
        _event: 'message',
        cb: (event: { data: any }) => void
      ) {
        this.listeners.push(cb)
      }
      public start() {
        this.started++
      }
      public emit(data: any) {
        for (const l of this.listeners) {
          l({ data })
        }
      }
    }

    class FakeStore implements ITerminalStoreSink {
      public mergeCalls: Array<{ id: string; patch: any }> = []
      public activityCalls: string[] = []
      public mergeMeta(sessionId: string, patch: any) {
        this.mergeCalls.push({ id: sessionId, patch })
      }
      public markActivity(sessionId: string) {
        this.activityCalls.push(sessionId)
      }
    }

    beforeEach(() => {
      _resetActivityThrottle()
    })

    it('routes meta frames into store.mergeMeta', () => {
      const port = new FakePort()
      const store = new FakeStore()
      attachStoreToPort(store, 's1', port)
      port.emit({
        type: 'meta',
        liveCwd: '/tmp/x',
        title: 'docs',
        lastExitCode: 0,
        hasActivity: true,
      })
      expect(store.mergeCalls).toHaveLength(1)
      expect(store.mergeCalls[0]).toEqual({
        id: 's1',
        patch: {
          liveCwd: '/tmp/x',
          title: 'docs',
          lastExitCode: 0,
          hasActivity: true,
        },
      })
    })

    it('does not start the port (XtermView owns the single start())', () => {
      const port = new FakePort()
      const store = new FakeStore()
      attachStoreToPort(store, 's1', port)
      // Starting the port here would flush the PTY's buffered initial
      // output (the shell prompt/banner) into this side-channel listener
      // before XtermView attaches its byte consumer — the prompt would be
      // lost and the panel would open blank. XtermView calls start().
      expect(port.started).toBe(0)
    })

    it('throttles markActivity to one call per 250ms per session', () => {
      const port = new FakePort()
      const store = new FakeStore()
      attachStoreToPort(store, 's1', port)
      // Simulate 5 rapid data frames in the same tick.
      for (let i = 0; i < 5; i++) {
        port.emit({ type: 'data', bytes: new Uint8Array([1]) })
      }
      expect(store.activityCalls).toEqual(['s1'])
    })

    it('does not throttle across distinct sessions', () => {
      const portA = new FakePort()
      const portB = new FakePort()
      const store = new FakeStore()
      attachStoreToPort(store, 'a', portA)
      attachStoreToPort(store, 'b', portB)
      portA.emit({ type: 'data', bytes: new Uint8Array() })
      portB.emit({ type: 'data', bytes: new Uint8Array() })
      expect(store.activityCalls).toEqual(['a', 'b'])
    })

    it('ignores unknown message types without crashing', () => {
      const port = new FakePort()
      const store = new FakeStore()
      attachStoreToPort(store, 's1', port)
      port.emit({ type: 'exit', exitCode: 0 })
      port.emit(null)
      port.emit('not-an-object')
      expect(store.mergeCalls).toEqual([])
      expect(store.activityCalls).toEqual([])
    })

    it('falls back to onmessage when addEventListener is unavailable', () => {
      const store = new FakeStore()
      const port: any = {
        onmessage: null as null | ((event: { data: any }) => void),
        start: () => undefined,
      }
      attachStoreToPort(store, 's1', port)
      expect(typeof port.onmessage).toBe('function')
      port.onmessage?.({
        data: { type: 'meta', liveCwd: '/x' },
      })
      expect(store.mergeCalls).toHaveLength(1)
      expect(store.mergeCalls[0].id).toBe('s1')
      expect(store.mergeCalls[0].patch.liveCwd).toBe('/x')
    })
  })
})
