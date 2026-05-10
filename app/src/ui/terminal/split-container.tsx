import * as React from 'react'
import { Layout } from '../../lib/terminal/split-layout'
import { XtermView, IXtermViewPort } from './xterm-view'
import { ITerminalThemeColors } from '../../lib/terminal/terminal-theme'

interface ISplitContainerProps {
  readonly layout: Layout
  readonly activeSessionId: string | null
  readonly portFor: (sessionId: string) => IXtermViewPort | null
  readonly theme: ITerminalThemeColors
  readonly fontSize: number
  readonly scrollback: number
  readonly mountedSessionIds: ReadonlySet<string>
  readonly xtermRefs: Map<string, React.RefObject<XtermView>>
  readonly onRatioChange?: (
    path: ReadonlyArray<'a' | 'b'>,
    ratio: number
  ) => void
  readonly onFilePathClick?: (
    sessionId: string,
    path: string,
    line: number,
    column: number | null
  ) => void
  readonly onPasteConfirmRequired?: (sessionId: string, text: string) => void
}

export class SplitContainer extends React.Component<ISplitContainerProps> {
  public render() {
    return this.renderNode(this.props.layout, [])
  }

  private renderNode(
    node: Layout,
    path: ReadonlyArray<'a' | 'b'>
  ): React.ReactNode {
    if (node.kind === 'leaf') {
      return this.renderLeaf(node.sessionId)
    }
    const isHorizontal = node.orientation === 'horizontal'
    return (
      <div
        key={path.join('/') || 'root'}
        style={{
          display: 'flex',
          flexDirection: isHorizontal ? 'row' : 'column',
          width: '100%',
          height: '100%',
        }}
      >
        <div
          style={{ flex: node.ratio, overflow: 'hidden', minWidth: 0, minHeight: 0 }}
        >
          {this.renderNode(node.a, [...path, 'a'])}
        </div>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          className={`split-spacer ${node.orientation}`}
          // eslint-disable-next-line react/jsx-no-bind
          onMouseDown={e => this.onSpacerMouseDown(e, path, node.ratio, node.orientation)}
        />
        <div
          style={{ flex: 1 - node.ratio, overflow: 'hidden', minWidth: 0, minHeight: 0 }}
        >
          {this.renderNode(node.b, [...path, 'b'])}
        </div>
      </div>
    )
  }

  private renderLeaf(sessionId: string): React.ReactNode {
    const {
      portFor,
      theme,
      fontSize,
      scrollback,
      mountedSessionIds,
      xtermRefs,
      activeSessionId,
    } = this.props

    if (!mountedSessionIds.has(sessionId)) {
      return (
        <div
          key={sessionId}
          style={{ width: '100%', height: '100%' }}
        />
      )
    }

    const ref = this.getOrCreateRef(sessionId, xtermRefs)

    return (
      <div
        key={sessionId}
        style={{
          width: '100%',
          height: '100%',
          display: sessionId === activeSessionId ? 'block' : 'none',
        }}
      >
        <XtermView
          ref={ref}
          port={portFor(sessionId)}
          theme={theme}
          fontSize={fontSize}
          scrollback={scrollback}
          // eslint-disable-next-line react/jsx-no-bind
          onFilePathClick={
            this.props.onFilePathClick
              ? (path, line, col) =>
                  this.props.onFilePathClick!(sessionId, path, line, col)
              : undefined
          }
          // eslint-disable-next-line react/jsx-no-bind
          onPasteConfirmRequired={text =>
            this.props.onPasteConfirmRequired?.(sessionId, text)
          }
        />
      </div>
    )
  }

  private getOrCreateRef(
    sessionId: string,
    xtermRefs: Map<string, React.RefObject<XtermView>>
  ): React.RefObject<XtermView> {
    if (!xtermRefs.has(sessionId)) {
      xtermRefs.set(sessionId, React.createRef<XtermView>())
    }
    return xtermRefs.get(sessionId)!
  }

  private onSpacerMouseDown(
    e: React.MouseEvent,
    path: ReadonlyArray<'a' | 'b'>,
    initialRatio: number,
    orientation: 'horizontal' | 'vertical'
  ) {
    e.preventDefault()
    const isHorizontal = orientation === 'horizontal'
    const startX = e.clientX
    const startY = e.clientY
    const container = (e.currentTarget as HTMLElement).parentElement!
    const totalSize = isHorizontal ? container.offsetWidth : container.offsetHeight

    const onMove = (me: MouseEvent) => {
      const delta = isHorizontal ? me.clientX - startX : me.clientY - startY
      const newRatio = Math.max(
        0.1,
        Math.min(0.9, initialRatio + delta / totalSize)
      )
      this.props.onRatioChange?.(path, newRatio)
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
}
