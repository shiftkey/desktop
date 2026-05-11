/**
 * Hand-written test fakes for an `IPty` and an `IPtyPort` so PTY-handling
 * code can be unit-tested without touching node-pty or Electron's
 * MessagePortMain.
 *
 * The fakes record interactions and expose `emit*` helpers so tests can
 * simulate PTY data, exits, and renderer messages.
 */

import { IPty, IPtyPort } from '../../src/main-process/terminal/pty-session'

export class MockPty implements IPty {
  public readonly pid = 12345
  public writes: Array<string | Buffer> = []
  public resizes: Array<{ cols: number; rows: number }> = []
  public killed = false
  public killSignal: string | undefined

  private dataCb: ((data: string | Buffer) => void) | null = null
  private exitCb: ((e: { exitCode: number; signal?: number }) => void) | null =
    null

  public onData(cb: (data: string | Buffer) => void) {
    this.dataCb = cb
    return {
      dispose: () => {
        if (this.dataCb === cb) {this.dataCb = null}
      },
    }
  }

  public onExit(cb: (e: { exitCode: number; signal?: number }) => void) {
    this.exitCb = cb
    return {
      dispose: () => {
        if (this.exitCb === cb) {this.exitCb = null}
      },
    }
  }

  public write(data: string | Buffer) {
    this.writes.push(data)
  }

  public resize(cols: number, rows: number) {
    this.resizes.push({ cols, rows })
  }

  public kill(signal?: string) {
    this.killed = true
    this.killSignal = signal
  }

  /** Simulate the PTY emitting bytes upstream (toward the renderer). */
  public emitData(data: string | Buffer) {
    this.dataCb?.(data)
  }

  /** Simulate the PTY process exiting. */
  public emitExit(exitCode: number) {
    this.exitCb?.({ exitCode })
  }
}

export class MockPort implements IPtyPort {
  public started = false
  public closed = false
  public posted: Array<{ message: any; transferables?: any[] }> = []

  private messageCb: ((event: { data: any }) => void) | null = null
  private closeCb: (() => void) | null = null

  public start() {
    this.started = true
  }

  public postMessage(message: any, transferables?: any[]) {
    this.posted.push({ message, transferables })
  }

  public on(event: 'message' | 'close', cb: any) {
    if (event === 'message') {this.messageCb = cb}
    if (event === 'close') {this.closeCb = cb}
  }

  public removeAllListeners() {
    this.messageCb = null
    this.closeCb = null
  }

  public close() {
    this.closed = true
  }

  /** Simulate the renderer sending a message to main. */
  public emitRendererMessage(data: any) {
    this.messageCb?.({ data })
  }

  /** Simulate the port closing from the other side. */
  public emitClose() {
    this.closeCb?.()
  }
}
