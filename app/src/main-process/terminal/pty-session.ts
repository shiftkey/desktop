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

import { IPtyOptions, ITerminalSessionSnapshot } from '../../lib/terminal/pty-types'

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
    if (this.pty !== null || this.destroyed) return

    this.pty = this.deps.factory(this.deps.options)
    this.snapshot = { ...this.snapshot, status: 'running' }

    this.dataDisposable = this.pty.onData(chunk => {
      const bytes = chunkToBytes(chunk)
      this.deps.port.postMessage({ type: 'data', bytes })
    })

    this.exitDisposable = this.pty.onExit(({ exitCode }) => {
      this.snapshot = { ...this.snapshot, status: 'exited', exitCode }
      this.deps.port.postMessage({ type: 'exit', exitCode })
      for (const cb of this.exitListeners) cb(this.snapshot)
      this.cleanup()
    })

    this.deps.port.on('message', ({ data }) => this.handleRendererMessage(data))
    this.deps.port.on('close', () => this.kill())
    this.deps.port.start()
  }

  /** Forward keystrokes / paste payloads to the PTY. */
  public write(bytes: Uint8Array | string): void {
    if (this.pty === null) return
    this.pty.write(typeof bytes === 'string' ? bytes : Buffer.from(bytes))
  }

  /** Resize the PTY (clamped to >=1 in each dimension). */
  public resize(cols: number, rows: number): void {
    if (this.pty === null) return
    const c = Math.max(1, Math.floor(cols))
    const r = Math.max(1, Math.floor(rows))
    if (c === this.snapshot.cols && r === this.snapshot.rows) return
    this.pty.resize(c, r)
    this.snapshot = { ...this.snapshot, cols: c, rows: r }
  }

  /** Kill the PTY and tear down the port. Safe to call multiple times. */
  public kill(signal: string = 'SIGHUP'): void {
    if (this.destroyed) return
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
    if (data === null || typeof data !== 'object') return
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

  private cleanup(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.dataDisposable?.dispose()
    this.exitDisposable?.dispose()
    this.dataDisposable = null
    this.exitDisposable = null
    try {
      this.deps.port.removeAllListeners()
      this.deps.port.close()
    } catch {
      // Port may have already been closed.
    }
  }
}

function chunkToBytes(chunk: string | Buffer): Uint8Array {
  // postMessage's structured-clone copies synchronously before returning,
  // so a zero-copy view is safe — node-pty can reuse its buffer pool the
  // moment our caller invokes postMessage. Avoids one allocation+copy per
  // PTY data frame on the hot path.
  const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}
