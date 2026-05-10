import {
  Layout,
  leaf,
  splitLeaf,
  closeSession,
  findLeafIds,
} from '../../../src/lib/terminal/split-layout'

describe('split-layout', () => {
  it('makes a leaf', () => {
    const l = leaf('s1')
    expect(l).toEqual({ kind: 'leaf', sessionId: 's1' })
  })

  it('splits a leaf horizontally', () => {
    const before: Layout = leaf('s1')
    const after = splitLeaf(before, 's1', 'horizontal', 's2')
    expect(after).toEqual({
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: leaf('s2'),
    })
  })

  it('splits a deep leaf without disturbing siblings', () => {
    const root: Layout = {
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: leaf('s2'),
    }
    const after = splitLeaf(root, 's2', 'vertical', 's3')
    expect(after).toEqual({
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: {
        kind: 'split',
        orientation: 'vertical',
        ratio: 0.5,
        a: leaf('s2'),
        b: leaf('s3'),
      },
    })
  })

  it('returns the input unchanged when target leaf is not present', () => {
    const before: Layout = leaf('s1')
    expect(splitLeaf(before, 'nope', 'horizontal', 's2')).toBe(before)
  })

  it('collapses a 2-leaf split when one side closes', () => {
    const root: Layout = {
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: leaf('s2'),
    }
    expect(closeSession(root, 's1')).toEqual(leaf('s2'))
  })

  it('returns null when the only leaf closes', () => {
    expect(closeSession(leaf('s1'), 's1')).toBeNull()
  })

  it('preserves nested layout when collapsing a peer', () => {
    const root: Layout = {
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: {
        kind: 'split',
        orientation: 'vertical',
        ratio: 0.5,
        a: leaf('s2'),
        b: leaf('s3'),
      },
    }
    expect(closeSession(root, 's2')).toEqual({
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: leaf('s3'),
    })
  })

  it('lists all leaf ids in declaration order', () => {
    const root: Layout = {
      kind: 'split',
      orientation: 'horizontal',
      ratio: 0.5,
      a: leaf('s1'),
      b: {
        kind: 'split',
        orientation: 'vertical',
        ratio: 0.5,
        a: leaf('s2'),
        b: leaf('s3'),
      },
    }
    expect(findLeafIds(root)).toEqual(['s1', 's2', 's3'])
  })
})
