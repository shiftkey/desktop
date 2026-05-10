import { TerminalEmptyState } from '../../../src/ui/terminal/terminal-empty-state'

/**
 * Walk a rendered React tree and collect all string children. Lets the
 * tests assert that "Ctrl" appears anywhere in the rendered output
 * without needing a real DOM.
 */
function collectStrings(node: any, out: string[] = []): string[] {
  if (node === null || node === undefined || node === false) {
    return out
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      collectStrings(child, out)
    }
    return out
  }
  if (typeof node === 'object' && node.props) {
    collectStrings(node.props.children, out)
  }
  return out
}

/** Find the first descendant whose `type` matches `tag`. */
function findByType(node: any, tag: string): any {
  if (node === null || node === undefined || node === false) {
    return null
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByType(child, tag)
      if (hit !== null) {
        return hit
      }
    }
    return null
  }
  if (typeof node === 'object' && node.props) {
    if (node.type === tag) {
      return node
    }
    return findByType(node.props.children, tag)
  }
  return null
}

/** Find every descendant whose `type` matches `tag`. */
function findAllByType(node: any, tag: string, out: any[] = []): any[] {
  if (node === null || node === undefined || node === false) {
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      findAllByType(child, tag, out)
    }
    return out
  }
  if (typeof node === 'object' && node.props) {
    if (node.type === tag) {
      out.push(node)
    }
    findAllByType(node.props.children, tag, out)
  }
  return out
}

describe('TerminalEmptyState', () => {
  it('renders the CTA and triggers onNewTab on click', () => {
    const onNewTab = jest.fn()
    const tree: any = (TerminalEmptyState as any)({ onNewTab })
    const button = findByType(tree, 'button')
    expect(button).not.toBeNull()
    // The button label is human-readable copy, e.g. "Open shell here".
    const label = collectStrings(button.props.children).join(' ')
    expect(label.toLowerCase()).toMatch(/open shell/)
    button.props.onClick()
    expect(onNewTab).toHaveBeenCalledTimes(1)
  })

  it('shows a keyboard hint chip mentioning Ctrl', () => {
    const onNewTab = jest.fn()
    const tree: any = (TerminalEmptyState as any)({ onNewTab })
    const kbds = findAllByType(tree, 'kbd')
    // At least one <kbd> chip carries the text "Ctrl".
    const texts = kbds.map(k => collectStrings(k.props.children).join(''))
    expect(texts).toContain('Ctrl')
  })
})
