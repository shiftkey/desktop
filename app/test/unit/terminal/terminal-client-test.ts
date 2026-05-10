import {
  spawnTerminal,
  killTerminal,
  resizeTerminal,
  makePendingSnapshot,
  IIpcRenderer,
} from '../../../src/lib/terminal/terminal-client'
import { TERMINAL_IPC } from '../../../src/lib/terminal/ipc-channels'
import { IPtyOptions } from '../../../src/lib/terminal/pty-types'

class FakeIpc implements IIpcRenderer {
  public calls: Array<{ channel: string; args: any[] }> = []
  public response: any = undefined
  public async invoke(channel: string, ...args: any[]) {
    this.calls.push({ channel, args })
    return this.response
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
  describe('spawnTerminal', () => {
    it('invokes the spawn channel with repositoryId + options and returns the response', async () => {
      const ipc = new FakeIpc()
      ipc.response = { sessionId: 'abc', port: { fake: true } }
      const result = await spawnTerminal(1, baseOptions(), ipc)
      expect(result).toEqual({ sessionId: 'abc', port: { fake: true } })
      expect(ipc.calls[0].channel).toBe(TERMINAL_IPC.SPAWN)
      expect(ipc.calls[0].args[0]).toMatchObject({
        repositoryId: 1,
        options: baseOptions(),
      })
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
