import { OscEvent } from './osc-parser'

/**
 * One completed command block — corresponds to a prompt → command → output
 * → end OSC 133 sequence.
 */
export interface ICommandBlock {
  readonly commandStartRow: number
  readonly outputStartRow: number
  readonly endRow: number
  readonly exitCode: number
}

interface IPending {
  commandStartRow: number | null
  outputStartRow: number | null
}

/**
 * Consumes OSC 133 events from an OscParser and assembles them into
 * complete command blocks. The xterm cursor row at each event boundary
 * is captured via the injected `getRow` callback.
 *
 * Tolerates missing events: an unmatched `command-end` is dropped, and a
 * fresh `prompt-start` resets any half-built pending block.
 */
/**
 * Upper bound on retained command blocks. A long-lived shell can run
 * thousands of commands; without a cap the array — and the gutter markers
 * the UI renders one-per-block — would grow unbounded. The oldest blocks
 * are dropped, matching how scrollback itself ages out.
 */
const MAX_BLOCKS = 256

export class CommandBlockTracker {
  private blocks: ICommandBlock[] = []
  private pending: IPending = { commandStartRow: null, outputStartRow: null }
  private listeners: Array<(blocks: ReadonlyArray<ICommandBlock>) => void> = []

  public constructor(private readonly getRow: () => number) {}

  public handle(evt: OscEvent): void {
    switch (evt.type) {
      case 'prompt-start':
        this.pending = { commandStartRow: null, outputStartRow: null }
        return
      case 'command-start':
        this.pending.commandStartRow = this.getRow()
        return
      case 'output-start':
        this.pending.outputStartRow = this.getRow()
        return
      case 'command-end': {
        if (this.pending.commandStartRow === null) {
          return
        }
        const block: ICommandBlock = {
          commandStartRow: this.pending.commandStartRow,
          outputStartRow:
            this.pending.outputStartRow ?? this.pending.commandStartRow,
          endRow: this.getRow(),
          exitCode: evt.exitCode,
        }
        const appended = [...this.blocks, block]
        this.blocks =
          appended.length > MAX_BLOCKS
            ? appended.slice(appended.length - MAX_BLOCKS)
            : appended
        this.pending = { commandStartRow: null, outputStartRow: null }
        this.emit()
        return
      }
      default:
        return
    }
  }

  public getBlocks(): ReadonlyArray<ICommandBlock> {
    return this.blocks
  }

  public reset(): void {
    this.blocks = []
    this.pending = { commandStartRow: null, outputStartRow: null }
    this.emit()
  }

  public onChange(
    cb: (blocks: ReadonlyArray<ICommandBlock>) => void
  ): () => void {
    this.listeners.push(cb)
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb)
    }
  }

  private emit(): void {
    for (const l of this.listeners.slice()) {
      try {
        l(this.blocks)
      } catch {
        // listener errors must not poison the tracker
      }
    }
  }
}

/**
 * Extract the text of a recorded command block. Caller supplies a
 * `getLineText(row)` function (typically backed by xterm's
 * `term.buffer.active.getLine(row).translateToString()`).
 */
export function extractBlockText(
  getLineText: (row: number) => string,
  block: ICommandBlock
): string {
  const out: string[] = []
  for (let r = block.commandStartRow; r <= block.endRow; r++) {
    out.push(getLineText(r))
  }
  return out.join('\n')
}
