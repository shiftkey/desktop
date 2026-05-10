import {
  spawnTerminal,
  killTerminal,
  resizeTerminal,
  makePendingSnapshot,
  IIpcRenderer,
  _setIpcRenderer,
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
        for (const l of listeners) {l(event, { sessionId: sid })}
      }
      if (this.deliverBeforeInvokeResolves) {fire()}
      else {queueMicrotask(fire)}
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
})
