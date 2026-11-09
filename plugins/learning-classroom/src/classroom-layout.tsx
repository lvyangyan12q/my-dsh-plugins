import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  collapsibleZones,
  defaultLayout,
  isNarrowWidth,
  keyboardResizeStep,
  layoutBoundaries,
  lectureMinWidth,
  narrowThreshold,
  resolveNarrowZone,
  resizeLayout,
  separatorWidth,
  toggleCollapsed,
  zoneIds,
  zoneLabels,
  zoneWidthBounds,
  type ClassroomLayout,
  type ClassroomZone,
  type LayoutBoundary,
} from './layout.ts'

/** Measures the layout container; injected so tests never depend on window size. */
export type WidthObserver = (element: HTMLElement, report: (width: number) => void) => () => void

/** Production width source: the container itself, never the window. */
export const observeContainerWidth: WidthObserver = (element, report) => {
  let disposed = false
  const push = (width: number) => { if (!disposed) report(width) }
  push(element.getBoundingClientRect().width)
  if (typeof ResizeObserver === 'undefined') return () => { disposed = true }
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) push(entry.contentRect.width)
  })
  observer.observe(element)
  return () => { disposed = true; observer.disconnect() }
}

export interface ClassroomLayoutViewProps {
  layout: ClassroomLayout
  onLayoutChange(next: ClassroomLayout): void
  /** The course directory and the lecture reader are rendered by `LectureZone`. */
  lecture: ReactNode
  notes: ReactNode
  conversation: ReactNode
  observeWidth?: WidthObserver
  threshold?: number
}

const styles = `
.lc-layout-root{display:flex;flex-direction:column;gap:8px;min-height:0;flex:1}
.lc-layout-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.lc-layout-caption{font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-layout-toggle,.lc-layout-tab,.lc-layout-reset{padding:3px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:999px;background:var(--dsh-surface,#fff);color:inherit;font-size:12px;cursor:pointer}
.lc-layout-tab[aria-pressed="true"]{border-color:var(--dsh-accent,#0969da);background:#ddf4ff;color:#0969da;font-weight:600}
.lc-layout-toggle[aria-label^="显示"]{border-style:dashed;color:var(--dsh-text-secondary,#59636e)}
.lc-layout{display:grid;grid-template-rows:minmax(0,1fr);min-height:0;min-width:0;flex:1;overflow:auto}
.lc-layout > *{min-width:0}
.lc-layout [aria-label="课程目录"]{grid-column:1;grid-row:1}
.lc-layout [aria-label="讲义"]{grid-column:3;grid-row:1}
.lc-layout .lc-zone-notes{grid-column:5;grid-row:1}
.lc-layout .lc-zone-conversation{grid-column:7;grid-row:1}
.lc-layout[data-collapsed-directory="true"] [aria-label="课程目录"]{display:none}
.lc-layout[data-collapsed-notes="true"] .lc-zone-notes{display:none}
.lc-layout[data-collapsed-conversation="true"] .lc-zone-conversation{display:none}
.lc-separator{position:relative;align-self:stretch;cursor:col-resize;touch-action:none;border:0;padding:0;background:transparent}
.lc-separator::after{content:"";position:absolute;top:0;bottom:0;left:50%;width:2px;transform:translateX(-50%);border-radius:2px;background:var(--dsh-border,#d8dee4)}
.lc-separator:hover::after,.lc-separator:focus-visible::after{background:var(--dsh-accent,#0969da)}
.lc-separator:focus-visible{outline:2px solid var(--dsh-accent,#0969da);outline-offset:-2px}
.lc-layout[data-narrow="true"]{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);overflow:hidden}
.lc-layout[data-narrow="true"] [aria-label="课程目录"],
.lc-layout[data-narrow="true"] [aria-label="讲义"],
.lc-layout[data-narrow="true"] .lc-zone-notes,
.lc-layout[data-narrow="true"] .lc-zone-conversation{display:none;grid-column:1;grid-row:1}
.lc-layout[data-narrow="true"][data-active-zone="directory"] [aria-label="课程目录"]{display:flex}
.lc-layout[data-narrow="true"][data-active-zone="lecture"] [aria-label="讲义"]{display:flex}
.lc-layout[data-narrow="true"][data-active-zone="notes"] .lc-zone-notes{display:flex}
.lc-layout[data-narrow="true"][data-active-zone="conversation"] .lc-zone-conversation{display:flex}
`

/**
 * The four-zone classroom shell: a CSS grid of course directory, lecture, notes
 * and conversation with draggable separators, collapsible side zones and a
 * one-zone-at-a-time mode for narrow containers.
 *
 * Collapsing hides a zone with CSS instead of unmounting it, so a note being
 * edited and an in-flight conversation keep their state; adjusting the layout
 * only reports navigation state and never calls the lecture, note or session
 * APIs.
 */
export function ClassroomLayoutView(props: ClassroomLayoutViewProps) {
  const { layout, onLayoutChange, lecture, notes, conversation, observeWidth = observeContainerWidth, threshold = narrowThreshold } = props
  const [draft, setDraft] = useState<ClassroomLayout | null>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [activeZone, setActiveZone] = useState<ClassroomZone>('lecture')
  const root = useRef<HTMLDivElement | null>(null)
  const endDrag = useRef<() => void>(() => {})

  const current = draft ?? layout
  const narrow = isNarrowWidth(width, threshold)

  useEffect(() => {
    const element = root.current
    if (element === null) return
    return observeWidth(element, setWidth)
  }, [observeWidth])

  // A drag ends on mouseup anywhere; unmounting mid-drag must not leak listeners.
  useEffect(() => () => endDrag.current(), [])

  // Entering narrow mode always starts on the lecture, the reading priority.
  useEffect(() => {
    if (narrow) setActiveZone('lecture')
  }, [narrow])

  const template = useMemo(() => {
    if (narrow) return 'minmax(0, 1fr)'
    const columns = new Array<string>(7).fill('0px')
    columns[0] = current.collapsed.directory ? '0px' : `${current.widths.directory}px`
    columns[2] = `minmax(${lectureMinWidth}px, 1fr)`
    columns[4] = current.collapsed.notes ? '0px' : `${current.widths.notes}px`
    columns[6] = current.collapsed.conversation ? '0px' : `${current.widths.conversation}px`
    for (const boundary of layoutBoundaries(current)) columns[boundary.column - 1] = `${separatorWidth}px`
    return columns.join(' ')
  }, [current, narrow])

  const commit = (next: ClassroomLayout) => {
    if (next !== current) onLayoutChange(next)
  }

  const beginDrag = (boundary: LayoutBoundary, event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const base = current
    let latest: ClassroomLayout | null = null
    const move = (moveEvent: MouseEvent) => {
      const next = resizeLayout(base, boundary, moveEvent.clientX - startX)
      latest = next
      setDraft(next)
    }
    const finish = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', finish)
      endDrag.current = () => {}
      setDraft(null)
      if (latest !== null && latest !== base) onLayoutChange(latest)
    }
    endDrag.current = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', finish)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', finish)
  }

  const nudge = (boundary: LayoutBoundary, event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = keyboardResizeStep * (event.shiftKey ? 3 : 1)
    commit(resizeLayout(current, boundary, event.key === 'ArrowRight' ? step : -step))
  }

  const toggle = (zone: (typeof collapsibleZones)[number]) => commit(toggleCollapsed(current, zone))

  return (
    <div className="lc-layout-root" ref={root}>
      <style>{styles}</style>
      <div className="lc-layout-bar" role="toolbar" aria-label="课堂布局">
        <span className="lc-layout-caption">{narrow ? '分区' : '分栏'}</span>
        {narrow
          ? zoneIds.map(zone => (
            <button
              key={zone}
              type="button"
              className="lc-layout-tab"
              aria-pressed={activeZone === zone}
              onClick={() => setActiveZone(resolveNarrowZone(zone))}
            >
              {zoneLabels[zone]}
            </button>
          ))
          : collapsibleZones.map(zone => (
            <button
              key={zone}
              type="button"
              className="lc-layout-toggle"
              aria-label={`${current.collapsed[zone] ? '显示' : '收起'}${zoneLabels[zone]}`}
              onClick={() => toggle(zone)}
            >
              {zoneLabels[zone]}
            </button>
          ))}
        {!narrow && (
          <button type="button" className="lc-layout-reset" aria-label="恢复默认布局" onClick={() => commit(defaultLayout())}>
            重置布局
          </button>
        )}
      </div>

      <div
        className="lc-layout"
        data-narrow={narrow ? 'true' : 'false'}
        data-active-zone={activeZone}
        data-collapsed-directory={current.collapsed.directory ? 'true' : 'false'}
        data-collapsed-notes={current.collapsed.notes ? 'true' : 'false'}
        data-collapsed-conversation={current.collapsed.conversation ? 'true' : 'false'}
        style={{ gridTemplateColumns: template }}
      >
        <div className="lc-lecture-mount" style={{ display: 'contents' }}>{lecture}</div>

        {!narrow && layoutBoundaries(current).map(boundary => (
          <div
            key={`${boundary.leading}-${boundary.trailing}`}
            className="lc-separator"
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label={`调整${zoneLabels[boundary.leading]}与${zoneLabels[boundary.trailing]}宽度`}
            aria-valuemin={zoneWidthBounds[boundary.adjustable].min}
            aria-valuemax={zoneWidthBounds[boundary.adjustable].max}
            aria-valuenow={current.widths[boundary.adjustable]}
            aria-valuetext={`${zoneLabels[boundary.adjustable]}宽度 ${current.widths[boundary.adjustable]} 像素`}
            style={{ gridColumn: boundary.column, gridRow: 1 }}
            onMouseDown={event => beginDrag(boundary, event)}
            onKeyDown={event => nudge(boundary, event)}
          />
        ))}

        <section className="lc-pane lc-zone-notes" aria-label="我的笔记">
          <h2>我的笔记</h2>
          {notes}
        </section>
        <section className="lc-pane lc-zone-conversation" aria-label="老师对话">
          <h2>老师对话</h2>
          {conversation}
        </section>
      </div>
    </div>
  )
}
