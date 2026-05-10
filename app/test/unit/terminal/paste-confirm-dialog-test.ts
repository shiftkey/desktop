import { PasteConfirmDialog } from '../../../src/ui/terminal/paste-confirm-dialog'

// ---------------------------------------------------------------------------
// Tree-walking helpers (same pattern used across terminal tests)
// ---------------------------------------------------------------------------

function collectStrings(node: any, out: string[] = []): string[] {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) collectStrings(child, out)
    return out
  }
  if (typeof node === 'object' && node.props) collectStrings(node.props.children, out)
  return out
}

function findByType(node: any, tag: string): any {
  if (node === null || node === undefined || node === false) return null
  if (Array.isArray(node)) {
    for (const c of node) {
      const h = findByType(c, tag)
      if (h) return h
    }
    return null
  }
  if (typeof node === 'object' && node.props) {
    if (node.type === tag) return node
    return findByType(node.props.children, tag)
  }
  return null
}

function findAllByType(node: any, tag: string, out: any[] = []): any[] {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) {
    for (const c of node) findAllByType(c, tag, out)
    return out
  }
  if (typeof node === 'object' && node.props) {
    if (node.type === tag) out.push(node)
    findAllByType(node.props.children, tag, out)
  }
  return out
}

// ---------------------------------------------------------------------------

describe('PasteConfirmDialog', () => {
  it('shows line count in title', () => {
    const tree: any = (PasteConfirmDialog as any)({
      text: 'a\nb\nc\nd',
      onConfirm: jest.fn(),
      onCancel: jest.fn(),
    })
    const texts = collectStrings(tree)
    expect(texts.join(' ')).toMatch(/4 lines/)
  })

  it('"Paste anyway" calls onConfirm with the full text', () => {
    const onConfirm = jest.fn()
    const text = 'line1\nline2\nline3'
    const tree: any = (PasteConfirmDialog as any)({
      text,
      onConfirm,
      onCancel: jest.fn(),
    })
    const buttons = findAllByType(tree, 'button')
    const pasteBtn = buttons.find((b: any) =>
      collectStrings(b.props.children).join('').toLowerCase().includes('paste')
    )
    expect(pasteBtn).toBeDefined()
    pasteBtn.props.onClick()
    expect(onConfirm).toHaveBeenCalledWith(text)
  })

  it('Cancel calls onCancel', () => {
    const onCancel = jest.fn()
    const tree: any = (PasteConfirmDialog as any)({
      text: 'x\ny',
      onConfirm: jest.fn(),
      onCancel,
    })
    const buttons = findAllByType(tree, 'button')
    const cancelBtn = buttons.find((b: any) =>
      collectStrings(b.props.children).join('').toLowerCase().includes('cancel')
    )
    expect(cancelBtn).toBeDefined()
    cancelBtn.props.onClick()
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows preview limited to 6 lines and a "more" line for large pastes', () => {
    const lines = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n')
    const tree: any = (PasteConfirmDialog as any)({
      text: lines,
      onConfirm: jest.fn(),
      onCancel: jest.fn(),
    })
    const pre = findByType(tree, 'pre')
    expect(pre).not.toBeNull()
    const texts = collectStrings(tree)
    expect(texts.join(' ')).toMatch(/4 more/)
  })
})
