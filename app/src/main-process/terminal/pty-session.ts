/**
 * Wraps a single PTY process and the Electron `MessagePortMain` it
 * communicates with. The class is structured to be unit-testable without
 * importing `node-pty` — the PTY is supplied via the `PtyFactory` argument
 * and any `IPty`-compatible object will do.
 *
 * The session owns:
 *   - the PTY process lifecycle (spawn → kill → exit)
 *   - the bytes pump (PTY → renderer; renderer → PTY)
 *   - resize forwarding
 *   - exit notification
 *
 * Higher-level coordination (mapping repo id to session id, exposing state
 * to the renderer's store) is the job of `TerminalManager`, not this class.
 */

import {
  IPtyOptions,
  ITerminalSessionSnapshot,
} from '../../lib/terminal/pty-types'
import { OscParser, OscEvent } from '../../lib/terminal/osc-parser'

/** Minimum surface our PTY needs to expose. Mirrors `node-pty`'s `IPty`. */
export interface IPty {
  readonly pid: number
  onData(cb: (data: string | Buffer) => void): { dispose(): void }
  onExit(cb: (e: { exitCode: number; signal?: number }) => void): {
    dispose(): void
  }
  write(data: string | Buffer): void
  resize(cols: number, rows: number): void
  kill(signal?: string): void
}

/** Factory function that creates a PTY given options. */
export type PtyFactory = (options: IPtyOptions) => IPty

/**
 * Subset of `Electron.MessagePortMain` we use. Ports tests should pass a
 * fake exposing the same shape — no `Electron` import required.
 */
export interface IPtyPort {
  start(): void
  postMessage(message: any, transferables?: any[]): void
  on(event: 'message', cb: (event: { data: any }) => void): void
  on(event: 'close', cb: () => void): void
  removeAllListeners(event?: string): void
  close(): void
}

interface IPtySessionDeps {
  readonly factory: PtyFactory
  readonly port: IPtyPort
  readonly options: IPtyOptions
  readonly id: string
  readonly repositoryId: number
  readonly now?: () => number
}

/**
 * One terminal session — encapsulates a PTY + a `MessagePort`. After
 * construction the session is `'starting'`; after `start()` resolves the
 * status flips to `'running'`. When the underlying shell exits the status
 * is `'exited'` and `exitCode` is set.
 */
export class PtySession {
  private readonly deps: IPtySessionDeps
  private pty: IPty | null = null
  private snapshot: ITerminalSessionSnapshot
  private dataDisposable: { dispose(): void } | null = null
  private exitDisposable: { dispose(): void } | null = null
  private destroyed = false
  private exitListeners: Array<(snapshot: ITerminalSessionSnapshot) => void> =
    []
  private oscParser = new OscParser()

  public constructor(deps: IPtySessionDeps) {
    this.deps = deps
    this.snapshot = {
      id: deps.id,
      repositoryId: deps.repositoryId,
      cwd: deps.options.cwd,
      shell: deps.options.shell,
      cols: deps.options.cols,
      rows: deps.options.rows,
      createdAt: (deps.now ?? Date.now)(),
      status: 'starting',
      exitCode: null,
      liveCwd: null,
      hasActivity: false,
      lastExitCode: null,
      title: null,
    }
  }

  /** Snapshot of the session as observed externally. Always returns a fresh copy. */
  public getSnapshot(): ITerminalSessionSnapshot {
    return { ...this.snapshot }
  }

  /**
   * Spawn the PTY, wire up the port pump, and flip status to 'running'.
   *
   * Idempotent: subsequent calls are no-ops once the PTY exists.
   */
  public start(): void {
    if (this.pty !== null || this.destroyed) {
      return
    }

    this.oscParser.onEvent(evt => this.onOsc(evt))

    this.pty = this.deps.factory(this.deps.options)
    this.snapshot = { ...this.snapshot, status: 'running' }

    this.dataDisposable = this.pty.onData(chunk => {
      if (this.destroyed) {
        return
      }
      const bytes = chunkToBytes(chunk)
      this.oscParser.feed(bytes)
      this.safePost({ type: 'data', bytes })
    })

    this.exitDisposable = this.pty.onExit(({ exitCode }) => {
      if (this.destroyed) {
        // We may have torn down already (renderer-initiated kill). Drop.
        return
      }
      this.snapshot = { ...this.snapshot, status: 'exited', exitCode }
      this.safePost({ type: 'exit', exitCode })
      const listeners = this.exitListeners.slice()
      for (const cb of listeners) {
        try {
          cb(this.snapshot)
        } catch (err) {
          log.error('[pty-session] exit listener threw', err as Error)
        }
      }
      this.cleanup()
    })

    this.deps.port.on('message', ({ data }) => this.handleRendererMessage(data))
    this.deps.port.on('close', () => this.kill())
    this.deps.port.start()
  }

  /** Forward keystrokes / paste payloads to the PTY. */
  public write(bytes: Uint8Array | string): void {
    if (this.pty === null || this.destroyed) {
      return
    }
    this.pty.write(typeof bytes === 'string' ? bytes : Buffer.from(bytes))
  }

  /** Resize the PTY (clamped to >=1 in each dimension). */
  public resize(cols: number, rows: number): void {
    if (this.pty === null || this.destroyed) {
      return
    }
    const c = Math.max(1, Math.floor(cols))
    const r = Math.max(1, Math.floor(rows))
    if (c === this.snapshot.cols && r === this.snapshot.rows) {
      return
    }
    try {
      this.pty.resize(c, r)
    } catch (err) {
      // PTY may have exited between the check and the call; not actionable.
      log.warn('[pty-session] resize failed', err as Error)
      return
    }
    this.snapshot = { ...this.snapshot, cols: c, rows: r }
  }

  /** Kill the PTY and tear down the port. Safe to call multiple times. */
  public kill(signal: string = 'SIGHUP'): void {
    if (this.destroyed) {
      return
    }
    if (this.pty !== null) {
      try {
        this.pty.kill(signal)
      } catch {
        // PTY may have already exited; nothing actionable.
      }
    }
    this.cleanup()
  }

  /** Subscribe to the one-shot exit notification. */
  public onExit(cb: (snapshot: ITerminalSessionSnapshot) => void): void {
    this.exitListeners.push(cb)
  }

  private handleRendererMessage(data: any): void {
    if (this.destroyed) {
      return
    }
    if (data === null || typeof data !== 'object') {
      return
    }
    switch (data.type) {
      case 'input':
        this.write(data.bytes)
        return
      case 'resize':
        this.resize(data.cols, data.rows)
        return
      default:
        // Unknown message — drop silently. We never throw on a renderer payload.
        return
    }
  }

  private onOsc(evt: OscEvent): void {
    if (this.destroyed) {
      return
    }
    if (evt.type === 'cwd') {
      this.snapshot = { ...this.snapshot, liveCwd: evt.path }
      this.safePost({ type: 'meta', liveCwd: evt.path })
    } else if (evt.type === 'command-end') {
      this.snapshot = { ...this.snapshot, lastExitCode: evt.exitCode }
      this.safePost({ type: 'meta', lastExitCode: evt.exitCode })
    }
  }

  private safePost(msg: any): void {
    try {
      this.deps.port.postMessage(msg)
    } catch (err) {
      // Port can be closed by the renderer at any moment; the resulting
      // throw must not propagate into the PTY data callback or it will
      // crash the main process.
      log.warn('[pty-session] postMessage failed', err as Error)
    }
  }

  private cleanup(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true
    try {
      this.dataDisposable?.dispose()
    } catch {
      // node-pty disposables can throw if the PTY is gone; ignore.
    }
    try {
      this.exitDisposable?.dispose()
    } catch {
      // Same — ignore.
    }
    this.dataDisposable = null
    this.exitDisposable = null
    try {
      this.deps.port.removeAllListeners()
    } catch {
      // Port may have already been closed.
    }
    try {
      this.deps.port.close()
    } catch {
      // Port may have already been closed.
    }
  }
}

/**
 * Always copy the PTY chunk into a fresh buffer. node-pty re-uses an
 * internal buffer pool for subsequent reads; Electron's structured clone
 * inside `MessagePortMain.postMessage` is asynchronous w.r.t. the caller,
 * so a zero-copy `Uint8Array` view of the source buffer would be
 * overwritten before the renderer receives it (data garbling, output
 * bleed across commands).
 */
function chunkToBytes(chunk: string | Buffer): Uint8Array {
  if (typeof chunk === 'string') {
    const buf = Buffer.from(chunk, 'utf8')
    return new Uint8Array(buf)
  }
  // Copy into a freshly-allocated ArrayBuffer.
  const out = new Uint8Array(chunk.byteLength)
  out.set(chunk)
  return out
}
