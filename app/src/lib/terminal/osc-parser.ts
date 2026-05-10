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

export class OscParser {
  private listeners: Array<(e: OscEvent) => void> = []
  private state: State = 'text'
  private buf: number[] = []

  public onEvent(cb: (e: OscEvent) => void): void {
    this.listeners.push(cb)
  }

  public feed(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      switch (this.state) {
        case 'text':
          if (b === ESC) this.state = 'esc'
          break
        case 'esc':
          if (b === RBRACKET) {
            this.state = 'osc'
            this.buf.length = 0
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
            if (this.buf.length < MAX_OSC_LEN) {
              this.buf.push(b)
            }
          }
          break
        case 'osc-esc':
          if (b === BACKSLASH) {
            this.flush()
            this.state = 'text'
          } else {
            this.state = 'osc'
            if (this.buf.length < MAX_OSC_LEN) {
              this.buf.push(ESC)
              this.buf.push(b)
            }
          }
          break
      }
    }
  }

  private flush(): void {
    if (this.buf.length === 0 || this.buf.length >= MAX_OSC_LEN) {
      this.buf.length = 0
      return
    }
    const text = String.fromCharCode(...this.buf)
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
