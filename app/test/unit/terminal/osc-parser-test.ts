import { TextEncoder } from 'util'
import { OscParser, OscEvent } from '../../../src/lib/terminal/osc-parser'

function feedString(p: OscParser, s: string): OscEvent[] {
  const out: OscEvent[] = []
  p.onEvent(e => out.push(e))
  p.feed(new TextEncoder().encode(s))
  return out
}

describe('OscParser', () => {
  it('parses an OSC 7 cwd notification (file://host/path)', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]7;file://localhost/home/u/proj\x1b\\')
    expect(events).toEqual([{ type: 'cwd', path: '/home/u/proj' }])
  })

  it('parses an OSC 7 cwd with no host', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]7;file:///srv/x\x1b\\')
    expect(events).toEqual([{ type: 'cwd', path: '/srv/x' }])
  })

  it('decodes percent-encoded paths', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]7;file:///a%20b/c\x1b\\')
    expect(events).toEqual([{ type: 'cwd', path: '/a b/c' }])
  })

  it('parses OSC 133 prompt-start, command-start, output-start, command-end', () => {
    const p = new OscParser()
    const events = feedString(
      p,
      '\x1b]133;A\x1b\\\x1b]133;B\x1b\\\x1b]133;C\x1b\\\x1b]133;D;0\x1b\\'
    )
    expect(events).toEqual([
      { type: 'prompt-start' },
      { type: 'command-start' },
      { type: 'output-start' },
      { type: 'command-end', exitCode: 0 },
    ])
  })

  it('parses non-zero exit code on D', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]133;D;127\x1b\\')
    expect(events).toEqual([{ type: 'command-end', exitCode: 127 }])
  })

  it('handles BEL terminator (0x07) instead of ESC \\\\', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]7;file:///x\x07')
    expect(events).toEqual([{ type: 'cwd', path: '/x' }])
  })

  it('survives sequence split across feed() calls', () => {
    const p = new OscParser()
    const events: OscEvent[] = []
    p.onEvent(e => events.push(e))
    p.feed(new TextEncoder().encode('\x1b]7;file:///he'))
    expect(events).toEqual([])
    p.feed(new TextEncoder().encode('llo\x1b\\'))
    expect(events).toEqual([{ type: 'cwd', path: '/hello' }])
  })

  it('ignores unknown OSC codes', () => {
    const p = new OscParser()
    const events = feedString(p, '\x1b]9;notification\x1b\\')
    expect(events).toEqual([])
  })

  it('emits no events for plain text', () => {
    const p = new OscParser()
    expect(feedString(p, 'plain output\nmore output\n')).toEqual([])
  })

  it('drops absurdly long sequences without crashing', () => {
    const p = new OscParser()
    const huge = 'a'.repeat(10000)
    expect(feedString(p, '\x1b]7;file:///' + huge + '\x1b\\')).toEqual([])
  })
})
