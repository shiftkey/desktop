import { TextDecoder } from 'util'

/**
 * Streaming parser for ECMA-48 / xterm Operating System Command (OSC)
 * sequences emitted by interactive shells over the PTY byte stream.
 *
 * Recognized sequences:
 *   - OSC 7    `file://[host]/path`        — current working directory
 *   - OSC 133  `A` / `B` / `C` / `D[;exit]` — prompt / command / output
 *                                            boundaries (FinalTerm protocol)
 *
 * Both `BEL` (0x07) and `ESC \` (ST, 0x1B 0x5C) are accepted as terminators.
 * Payloads are decoded as UTF-8 to handle shells that emit raw multibyte
 * paths (e.g. zsh on macOS with non-ASCII filenames). Sequences whose payload
 * exceeds {@link MAX_OSC_LEN} are dropped in their entirety (poison-on-overflow)
 * rather than silently truncated.
 */

export type OscEvent =
  | { type: 'cwd'; path: string }
  | { type: 'prompt-start' }
  | { type: 'command-start' }
  | { type: 'output-start' }
  | { type: 'command-end'; exitCode: number }

const ESC = 0x1b
const RBRACKET = 0x5d
const BACKSLASH = 0x5c
const BEL = 0x07
const MAX_OSC_LEN = 4096

type State = 'text' | 'esc' | 'osc' | 'osc-esc'

/**
 * Incremental OSC parser. Bytes are pushed in via {@link feed}; recognized
 * events are dispatched synchronously to listeners registered through
 * {@link onEvent}. The parser is stateful across feed calls — partial
 * sequences split between writes are stitched together transparently.
 */
export class OscParser {
  private listeners: Array<(e: OscEvent) => void> = []
  private state: State = 'text'
  private buf: number[] = []
  private poisoned: boolean = false
  private decoder: TextDecoder = new TextDecoder('utf-8', { fatal: false })

  /**
   * Register a callback invoked once per recognized OSC event. Listener
   * exceptions are swallowed so a buggy subscriber cannot stall the byte
   * pump.
   */
  public onEvent(cb: (e: OscEvent) => void): void {
    this.listeners.push(cb)
  }

  /**
   * Feed raw PTY bytes into the parser. Safe to call with an empty buffer.
   * Sequences whose payload would exceed {@link MAX_OSC_LEN} are marked
   * poisoned and dropped on the next terminator — no partial event is
   * emitted.
   */
  public feed(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      switch (this.state) {
        case 'text':
          if (b === ESC) {
            this.state = 'esc'
          }
          break
        case 'esc':
          if (b === RBRACKET) {
            this.state = 'osc'
            this.buf.length = 0
            this.poisoned = false
          } else {
            this.state = 'text'
          }
          break
        case 'osc':
          if (b === BEL) {
            this.flush()
            this.state = 'text'
          } else if (b === ESC) {
            this.state = 'osc-esc'
          } else {
            this.appendByte(b)
          }
          break
        case 'osc-esc':
          if (b === BACKSLASH) {
            this.flush()
            this.state = 'text'
          } else if (b === ESC) {
            // A second ESC in a row: the first ESC was a literal payload byte,
            // but this new ESC may itself begin the real `ESC \` (ST)
            // terminator. Emit the prior ESC and stay in 'osc-esc' to evaluate
            // this one. Without this, a stray ESC before the terminator
            // consumes the terminator's ESC and the sequence never closes —
            // swallowing all following output (including the next sequence)
            // until a BEL or the 4096-byte poison cap forces recovery.
            this.appendByte(ESC)
          } else {
            this.state = 'osc'
            this.appendByte(ESC)
            this.appendByte(b)
          }
          break
      }
    }
  }

  private appendByte(b: number): void {
    if (this.poisoned) {
      return
    }
    if (this.buf.length >= MAX_OSC_LEN) {
      this.poisoned = true
      return
    }
    this.buf.push(b)
  }

  private flush(): void {
    if (this.poisoned) {
      this.buf.length = 0
      this.poisoned = false
      return
    }
    if (this.buf.length === 0) {
      return
    }
    const text = this.decoder.decode(new Uint8Array(this.buf))
    this.buf.length = 0
    const evt = parse(text)
    if (evt !== null) {
      for (const l of this.listeners.slice()) {
        try {
          l(evt)
        } catch {
          // listener errors must not break the byte pump
        }
      }
    }
  }
}

function parse(payload: string): OscEvent | null {
  const semi = payload.indexOf(';')
  const codeRaw = semi === -1 ? payload : payload.slice(0, semi)
  const rest = semi === -1 ? '' : payload.slice(semi + 1)
  const code = parseInt(codeRaw, 10)
  if (code === 7) {
    return parseCwd(rest)
  }
  if (code === 133) {
    return parsePromptMark(rest)
  }
  return null
}

function parseCwd(rest: string): OscEvent | null {
  if (!rest.startsWith('file://')) {
    return null
  }
  const afterScheme = rest.slice('file://'.length)
  const slash = afterScheme.indexOf('/')
  const path = slash === -1 ? '/' : afterScheme.slice(slash)
  try {
    return { type: 'cwd', path: decodeURIComponent(path) }
  } catch {
    return { type: 'cwd', path }
  }
}

function parsePromptMark(rest: string): OscEvent | null {
  const sub = rest.split(';')
  switch (sub[0]) {
    case 'A':
      return { type: 'prompt-start' }
    case 'B':
      return { type: 'command-start' }
    case 'C':
      return { type: 'output-start' }
    case 'D': {
      const exit = parseInt(sub[1] ?? '0', 10)
      return {
        type: 'command-end',
        exitCode: Number.isNaN(exit) ? 0 : exit,
      }
    }
    default:
      return null
  }
}
