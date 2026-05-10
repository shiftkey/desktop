/**
 * Pure tree model for split-pane terminal layouts.
 *
 * A leaf wraps a single session id. A split node has an orientation
 * ('horizontal' = side-by-side, 'vertical' = stacked), a ratio in [0,1]
 * for the divider, and two child Layouts. All operations return a fresh
 * tree (or the input unchanged) — never mutate.
 */

export type Orientation = 'horizontal' | 'vertical'

export type Layout =
  | { readonly kind: 'leaf'; readonly sessionId: string }
  | {
      readonly kind: 'split'
      readonly orientation: Orientation
      readonly ratio: number
      readonly a: Layout
      readonly b: Layout
    }

export function leaf(sessionId: string): Layout {
  return { kind: 'leaf', sessionId }
}

export function splitLeaf(
  root: Layout,
  targetId: string,
  orientation: Orientation,
  newSessionId: string
): Layout {
  if (root.kind === 'leaf') {
    if (root.sessionId !== targetId) {
      return root
    }
    return {
      kind: 'split',
      orientation,
      ratio: 0.5,
      a: root,
      b: leaf(newSessionId),
    }
  }
  const a = splitLeaf(root.a, targetId, orientation, newSessionId)
  const b = splitLeaf(root.b, targetId, orientation, newSessionId)
  if (a === root.a && b === root.b) {
    return root
  }
  return { ...root, a, b }
}

export function closeSession(root: Layout, targetId: string): Layout | null {
  if (root.kind === 'leaf') {
    return root.sessionId === targetId ? null : root
  }
  const a = closeSession(root.a, targetId)
  const b = closeSession(root.b, targetId)
  if (a === null && b === null) {
    return null
  }
  if (a === null) {
    return b
  }
  if (b === null) {
    return a
  }
  if (a === root.a && b === root.b) {
    return root
  }
  return { ...root, a, b }
}

export function findLeafIds(root: Layout): ReadonlyArray<string> {
  if (root.kind === 'leaf') {
    return [root.sessionId]
  }
  return [...findLeafIds(root.a), ...findLeafIds(root.b)]
}
