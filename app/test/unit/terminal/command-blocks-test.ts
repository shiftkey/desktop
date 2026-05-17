import {
  CommandBlockTracker,
  extractBlockText,
  ICommandBlock,
} from '../../../src/lib/terminal/command-blocks'

describe('CommandBlockTracker', () => {
  it('records a complete command block', () => {
    let row = 0
    const t = new CommandBlockTracker(() => row)
    t.handle({ type: 'prompt-start' })
    row = 5
    t.handle({ type: 'command-start' })
    row = 6
    t.handle({ type: 'output-start' })
    row = 12
    t.handle({ type: 'command-end', exitCode: 0 })
    expect(t.getBlocks()).toEqual([
      { commandStartRow: 5, outputStartRow: 6, endRow: 12, exitCode: 0 },
    ])
  })

  it('discards an unmatched command-end', () => {
    const t = new CommandBlockTracker(() => 0)
    t.handle({ type: 'command-end', exitCode: 1 })
    expect(t.getBlocks()).toEqual([])
  })

  it('opens a new block on a fresh prompt-start even if the previous never ended', () => {
    let row = 0
    const t = new CommandBlockTracker(() => row)
    row = 1
    t.handle({ type: 'prompt-start' })
    row = 2
    t.handle({ type: 'command-start' })
    row = 5
    t.handle({ type: 'prompt-start' })
    row = 6
    t.handle({ type: 'command-start' })
    row = 7
    t.handle({ type: 'command-end', exitCode: 0 })
    expect(t.getBlocks()).toEqual([
      { commandStartRow: 6, outputStartRow: 6, endRow: 7, exitCode: 0 },
    ])
  })

  it('emits change events on each completed block', () => {
    let row = 0
    const t = new CommandBlockTracker(() => row)
    const events: number[] = []
    t.onChange(blocks => events.push(blocks.length))
    t.handle({ type: 'prompt-start' })
    t.handle({ type: 'command-start' })
    row = 3
    t.handle({ type: 'command-end', exitCode: 0 })
    expect(events).toEqual([1])
  })

  it('clears all blocks on reset()', () => {
    const row = 0
    const t = new CommandBlockTracker(() => row)
    t.handle({ type: 'prompt-start' })
    t.handle({ type: 'command-start' })
    t.handle({ type: 'command-end', exitCode: 0 })
    t.reset()
    expect(t.getBlocks()).toEqual([])
  })
})

describe('extractBlockText', () => {
  it('joins lines from commandStartRow to endRow inclusive', () => {
    const lines = ['line0', 'line1', 'line2', 'line3', 'line4']
    const block: ICommandBlock = {
      commandStartRow: 1,
      outputStartRow: 2,
      endRow: 3,
      exitCode: 0,
    }
    const result = extractBlockText(r => lines[r], block)
    expect(result).toBe('line1\nline2\nline3')
  })

  it('returns a single line when commandStartRow equals endRow', () => {
    const block: ICommandBlock = {
      commandStartRow: 4,
      outputStartRow: 4,
      endRow: 4,
      exitCode: 0,
    }
    const result = extractBlockText(r => `row${r}`, block)
    expect(result).toBe('row4')
  })

  it('caps retained blocks and drops the oldest', () => {
    let row = 0
    const t = new CommandBlockTracker(() => row)
    const TOTAL = 400
    for (let i = 1; i <= TOTAL; i++) {
      t.handle({ type: 'prompt-start' })
      row = i
      t.handle({ type: 'command-start' })
      t.handle({ type: 'output-start' })
      t.handle({ type: 'command-end', exitCode: 0 })
    }
    const blocks = t.getBlocks()
    // The tracker keeps a bounded window — never the full 400.
    expect(blocks.length).toBeLessThan(TOTAL)
    expect(blocks.length).toBeGreaterThan(0)
    // The most recent command is always retained; the oldest are dropped.
    expect(blocks[blocks.length - 1].commandStartRow).toBe(TOTAL)
    expect(blocks[0].commandStartRow).toBeGreaterThan(1)
  })
})
