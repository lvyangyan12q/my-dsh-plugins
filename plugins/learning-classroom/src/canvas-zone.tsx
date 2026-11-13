import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  canvasFileName,
  isSafeCanvasUrl,
  relationName,
  type CanvasRelation,
  type CanvasSide,
} from './canvas.ts'
import type { ClassroomClient } from './classroom-client.ts'
import type { CanvasEdgeView, CanvasNodeView, CanvasReadView, ClassroomSpaceView } from './contract.ts'
import { absoluteVaultPath, type NativeOpenSeam } from './native-open.ts'

/** What the canvas asks the classroom to open when a file node is clicked. */
export interface CanvasOpenTarget {
  kind: 'lecture' | 'note'
  /** Space-relative path used by classroom commands, e.g. `讲义/第一章/01.md`. */
  path: string
  /** Vault-relative path shown to the reader and handed to Obsidian. */
  vaultPath: string
  label: string
  /** Real heading requested by the node; null when the node has none. */
  heading?: string | null
  /** Real block id requested by the node; null when the node has none. */
  blockId?: string | null
}

export interface CanvasZoneProps {
  client: ClassroomClient
  space: ClassroomSpaceView
  /** Absolute knowledge-vault root, used to build the Obsidian open link. */
  vaultPath: string | null
  busy: boolean
  onOpenTarget: (target: CanvasOpenTarget) => void
  /** Public DSH native open seam; absent when this Host exposes no Remote. */
  nativeOpen?: NativeOpenSeam
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; canvas: CanvasReadView }
  | { status: 'failed'; message: string }

type NativeState =
  | { status: 'probing' }
  | { status: 'available' }
  | { status: 'unavailable'; reason: string }

const relationOrder: readonly CanvasRelation[] = ['prerequisite', 'composition', 'application']

const relationColors: Record<CanvasRelation, string> = {
  prerequisite: '#d1242f',
  composition: '#0969da',
  application: '#1a7f37',
  related: '#6e7781',
}

const relationDashes: Record<CanvasRelation, string | undefined> = {
  prerequisite: undefined,
  composition: '7 4',
  application: '2 4',
  related: '2 4',
}

const relationMeaning: Record<'prerequisite' | 'composition' | 'application', string> = {
  prerequisite: '先学它，再学这里',
  composition: '由这些部分构成',
  application: '在这里用得上',
}

const targetBadges: Record<string, string> = {
  missing: '文件不存在',
  'missing-fragment': '锚点不存在',
  outside: '路径越界',
  unsupported: '不可打开',
}

const canvasStyles = `
.lc-canvas{display:flex;flex-direction:column;gap:10px;flex:1;min-height:0}
.lc-canvas-head{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px}
.lc-canvas-head h2{margin:0;font-size:16px}
.lc-canvas-path{margin:2px 0 0;font-size:12px;color:var(--dsh-text-secondary,#59636e);word-break:break-all}
.lc-canvas-path code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.lc-canvas-tools{display:flex;flex-wrap:wrap;gap:6px}
.lc-canvas-tools button{padding:4px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer;font-size:12px}
.lc-canvas-zoom{display:inline-flex;align-items:center;padding:0 6px;font-size:12px;color:var(--dsh-text-secondary,#59636e);font-variant-numeric:tabular-nums}
.lc-canvas-handoff{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.lc-canvas-handoff a,.lc-canvas-native{padding:4px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);text-decoration:none;font-size:12px;color:inherit;cursor:pointer}
.lc-canvas-native:disabled{opacity:.6;cursor:default}
.lc-canvas-legend{display:flex;flex-wrap:wrap;gap:12px;margin:0;padding:0;list-style:none;font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-canvas-legend-item{display:flex;align-items:center;gap:6px}
.lc-canvas-legend-swatch{display:inline-block;width:22px;height:0;border-top:2px solid currentColor}
.lc-canvas-legend-item[data-relation="prerequisite"]{color:#d1242f}
.lc-canvas-legend-item[data-relation="composition"]{color:#0969da}
.lc-canvas-legend-item[data-relation="application"]{color:#1a7f37}
.lc-canvas-legend-item[data-relation="composition"] .lc-canvas-legend-swatch{border-top-style:dashed}
.lc-canvas-legend-item[data-relation="application"] .lc-canvas-legend-swatch{border-top-style:dotted}
.lc-canvas-viewport{position:relative;flex:1;min-height:220px;overflow:auto;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:
  radial-gradient(circle at 1px 1px, #d8dee4 1px, transparent 0) 0 0 / 24px 24px,
  var(--dsh-surface,#fff);cursor:grab}
.lc-canvas-viewport:active{cursor:grabbing}
.lc-canvas-stage{position:relative;transform-origin:0 0}
.lc-canvas-edges{position:absolute;inset:0;overflow:visible;pointer-events:none}
.lc-canvas-edge-label{font-size:11px;font-family:inherit;paint-order:stroke;stroke:#fff;stroke-width:3px}
.lc-canvas-node{box-sizing:border-box;overflow:hidden;padding:8px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:var(--dsh-surface,#fff);font-size:13px;line-height:1.5}
.lc-canvas-node-text{white-space:pre-wrap;word-break:break-word}
.lc-canvas-node-text p{margin:0}
.lc-canvas-node-link a{color:var(--dsh-accent,#0969da);word-break:break-all}
.lc-canvas-node-group{background:rgba(9,105,218,.04);border-style:dashed;border-color:#9db8d2;border-radius:12px;pointer-events:none}
.lc-canvas-group-label{font-weight:600;color:var(--dsh-text-secondary,#59636e)}
.lc-canvas-node-file{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;height:100%;color:inherit;text-align:left;cursor:pointer;font:inherit}
.lc-canvas-node-file:hover .lc-canvas-file-name{text-decoration:underline}
.lc-canvas-file-name{font-weight:600;word-break:break-all}
.lc-canvas-file-path{font-size:11px;color:var(--dsh-text-secondary,#59636e);word-break:break-all}
.lc-canvas-file-badge{padding:1px 6px;border-radius:999px;background:#ffebe9;color:#82071e;font-size:11px}
.lc-canvas-empty{padding:24px;border:1px dashed var(--dsh-border,#d8dee4);border-radius:8px;text-align:center}
`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '读取脉络失败。'
}

/** Key for an Obsidian vault path; returns null when no vault root is known. */
export function obsidianOpenUrl(vaultRoot: string | null, relativePath: string): string | null {
  if (vaultRoot === null || vaultRoot.trim() === '') return null
  const root = vaultRoot.trim().replace(/[\\/]+$/, '')
  const relative = relativePath.trim().replaceAll('\\', '/').replace(/^\/+/, '')
  if (relative === '') return null
  return `obsidian://open?path=${encodeURIComponent(`${root}/${relative}`)}`
}

function fileLabel(node: CanvasNodeView): string {
  const file = node.file ?? ''
  const name = file.split('/').at(-1) ?? file
  return name.replace(/\.(md|html)$/i, '')
}

function nodeColor(color: string | null): string | undefined {
  if (color === null) return undefined
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color
  return undefined
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function borderPoint(center: { x: number; y: number }, ux: number, uy: number, rect: Rect): { x: number; y: number } {
  const tx = ux === 0 ? Number.POSITIVE_INFINITY : (rect.width / 2) / Math.abs(ux)
  const ty = uy === 0 ? Number.POSITIVE_INFINITY : (rect.height / 2) / Math.abs(uy)
  const t = Math.min(tx, ty)
  return { x: center.x + ux * t, y: center.y + uy * t }
}

/** Midpoint of the side JSON Canvas names, relative to the node's rendered rect. */
function sidePoint(rect: Rect, side: CanvasSide): { x: number; y: number } {
  switch (side) {
    case 'top': return { x: rect.left + rect.width / 2, y: rect.top }
    case 'right': return { x: rect.left + rect.width, y: rect.top + rect.height / 2 }
    case 'bottom': return { x: rect.left + rect.width / 2, y: rect.top + rect.height }
    case 'left': return { x: rect.left, y: rect.top + rect.height / 2 }
  }
}

function unit(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number } {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy) || 1
  return { x: dx / length, y: dy / length }
}

function edgeGeometry(
  from: Rect,
  to: Rect,
  selfLoop: boolean,
  fromSide: CanvasSide | null,
  toSide: CanvasSide | null,
): { d: string; labelX: number; labelY: number } {
  if (selfLoop) {
    const x1 = from.left + from.width * 0.72
    const y1 = from.top
    const x2 = from.left + from.width * 0.28
    return {
      d: `M ${x1} ${y1} C ${x1} ${y1 - 64}, ${x2} ${y1 - 64}, ${x2} ${y1}`,
      labelX: from.left + from.width / 2,
      labelY: from.top - 40,
    }
  }
  const fromCenter = centerOf(from)
  const toCenter = centerOf(to)
  let start: { x: number; y: number }
  let end: { x: number; y: number }
  if (fromSide !== null && toSide !== null) {
    start = sidePoint(from, fromSide)
    end = sidePoint(to, toSide)
  } else if (fromSide !== null) {
    start = sidePoint(from, fromSide)
    const direction = unit(start, toCenter)
    end = borderPoint(toCenter, -direction.x, -direction.y, to)
  } else if (toSide !== null) {
    end = sidePoint(to, toSide)
    const direction = unit(fromCenter, end)
    start = borderPoint(fromCenter, direction.x, direction.y, from)
  } else {
    const direction = unit(fromCenter, toCenter)
    start = borderPoint(fromCenter, direction.x, direction.y, from)
    end = borderPoint(toCenter, -direction.x, -direction.y, to)
  }
  return {
    d: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
    labelX: (start.x + end.x) / 2,
    labelY: (start.y + end.y) / 2 - 6,
  }
}

function edgeText(edge: CanvasEdgeView): string {
  const label = edge.label ?? relationName(edge.relation)
  return edge.selfLoop ? `${label}（自引用）` : label
}

/**
 * Read-only view of the learning space's `脉络.canvas`. It renders the parsed
 * graph and asks the classroom to open a lecture or note; it never edits the
 * canvas — structural changes stay in Obsidian, and the path plus an open action
 * are always visible.
 */
export function CanvasZone(props: CanvasZoneProps) {
  const { client, space, vaultPath, busy, onOpenTarget, nativeOpen } = props
  const spaceId = space.id
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [native, setNative] = useState<NativeState>(() => nativeOpen === undefined
    ? { status: 'unavailable', reason: '当前宿主没有接入公开的原生文件打开服务。' }
    : { status: 'probing' })
  const [openingNative, setOpeningNative] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const alive = useRef(true)
  const generation = useRef(0)

  useEffect(() => {
    alive.current = true
    const mine = generation.current + 1
    generation.current = mine
    const controller = new AbortController()
    setLoad({ status: 'loading' })
    setNotice('')

    const current = () => alive.current && generation.current === mine && !controller.signal.aborted
    client.readCanvas(spaceId, controller.signal).then(canvas => {
      if (current()) setLoad({ status: 'ready', canvas })
    }).catch(error => {
      if (current()) setLoad({ status: 'failed', message: messageOf(error) })
    })

    return () => {
      alive.current = false
      controller.abort()
    }
  }, [client, spaceId, reloadKey])

  // Probe the public native-open capability before rendering any control. An
  // unavailable Host gets an explanation and a path/Obsidian fallback, never a
  // disabled or inert "open" button.
  useEffect(() => {
    if (nativeOpen === undefined) {
      setNative({ status: 'unavailable', reason: '当前宿主没有接入公开的原生文件打开服务。' })
      return
    }
    let active = true
    setNative({ status: 'probing' })
    nativeOpen.probe().then(probe => {
      if (!active) return
      setNative(probe.available
        ? { status: 'available' }
        : { status: 'unavailable', reason: probe.reason ?? '宿主未说明原因。' })
    }).catch(error => {
      if (active) setNative({ status: 'unavailable', reason: messageOf(error) })
    })
    return () => { active = false }
  }, [nativeOpen])

  const canvas = load.status === 'ready' ? load.canvas : null
  const expectedPath = canvas?.path ?? `${space.directory}/${canvasFileName}`
  const absolutePath = absoluteVaultPath(vaultPath, expectedPath)
  const obsidianUrl = obsidianOpenUrl(vaultPath, expectedPath)
  const nativeBlockedReason = native.status === 'unavailable'
    ? native.reason
    : native.status === 'available' && absolutePath === null
      ? '没有可用的知识文件库绝对路径。'
      : null

  const reload = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setReloadKey(key => key + 1)
  }

  const zoomBy = (delta: number) => {
    setZoom(value => Math.min(2, Math.max(0.4, Number((value + delta).toFixed(2)))))
  }

  const openNative = async () => {
    if (nativeOpen === undefined || native.status !== 'available' || absolutePath === null) return
    setOpeningNative(true)
    setNotice('')
    const result = await nativeOpen.open(absolutePath)
    if (!alive.current) return
    setOpeningNative(false)
    if (!result.ok) setNotice(result.reason ?? '原生文件打开失败。')
  }

  const openNode = (node: CanvasNodeView) => {
    const target = node.target
    if (target === null) return
    if (target.status !== 'ok' || target.path === null || target.kind === null) {
      setNotice(target.message ?? `无法打开这个文件节点：${node.file ?? node.id}`)
      return
    }
    setNotice('')
    onOpenTarget({
      kind: target.kind,
      path: target.path,
      vaultPath: target.vaultPath ?? node.file ?? target.path,
      label: fileLabel(node),
      heading: target.heading,
      blockId: target.blockId,
    })
  }

  const rectOf = (node: CanvasNodeView, minX: number, minY: number): Rect => ({
    left: node.x - minX + 40,
    top: node.y - minY + 40,
    width: node.width,
    height: node.height,
  })

  return (
    <section className="lc-canvas" aria-label="课程脉络">
      <style>{canvasStyles}</style>
      <div className="lc-canvas-head">
        <div>
          <h2>课程脉络</h2>
          <p className="lc-canvas-path">脉络文件：<code>{absolutePath ?? expectedPath}</code></p>
        </div>
        <div className="lc-canvas-tools">
          <button type="button" disabled={busy} onClick={() => zoomBy(0.1)}>放大</button>
          <button type="button" disabled={busy} onClick={() => zoomBy(-0.1)}>缩小</button>
          <button type="button" disabled={busy} onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}>重置</button>
          <button type="button" disabled={busy} onClick={reload}>刷新脉络</button>
          <span className="lc-canvas-zoom" aria-live="polite">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="lc-canvas-handoff">
        {obsidianUrl !== null
          ? <a href={obsidianUrl}>在 Obsidian 中打开</a>
          : <span className="lc-hint">未选择知识文件库，无法生成 Obsidian 打开链接。</span>}
        {native.status === 'probing' && <span className="lc-hint" role="status">正在探测 DSH 原生文件打开…</span>}
        {native.status === 'available' && absolutePath !== null && (
          <button type="button" className="lc-canvas-native" disabled={busy || openingNative} onClick={() => void openNative()}>
            {openingNative ? '正在用系统应用打开…' : '用系统默认应用打开画布'}
          </button>
        )}
        {nativeBlockedReason !== null && (
          <span className="lc-hint" data-native-open="unavailable">
            DSH 原生文件打开不可用：{nativeBlockedReason} 可复制上方绝对路径，或在 Obsidian 中编辑；这里不提供无效按钮。
          </span>
        )}
        <p className="lc-hint">脉络在这里只读显示；新增节点或连线请在 Obsidian 中编辑，插件内不提供画布编辑。</p>
      </div>

      {notice !== '' && <div className="lc-alert" role="alert">{notice}</div>}

      {load.status === 'loading' && <p role="status">正在读取脉络…</p>}

      {load.status === 'failed' && (
        <div className="lc-alert" role="alert">
          <p>{load.message}</p>
          <button type="button" className="lc-secondary" onClick={reload}>重新加载脉络</button>
        </div>
      )}

      {load.status === 'ready' && load.canvas.nodes.length === 0 && (
        <div className="lc-canvas-empty">
          <h3>脉络还没有节点</h3>
          <p>在 Obsidian 里打开 <code>{load.canvas.path}</code> 添加概念与关系；保存后回到这里刷新脉络。</p>
        </div>
      )}

      {canvas !== null && canvas.nodes.length > 0 && (
        <>
          <ul className="lc-canvas-legend" aria-label="关系类型">
            {relationOrder.map(relation => (
              <li key={relation} className="lc-canvas-legend-item" data-relation={relation}>
                <span className="lc-canvas-legend-swatch" aria-hidden="true" />
                <span>{relationName(relation)}</span>
                <span>{relationMeaning[relation as 'prerequisite' | 'composition' | 'application']}</span>
              </li>
            ))}
          </ul>
          <CanvasViewport
            canvas={canvas}
            zoom={zoom}
            offset={offset}
            rectOf={rectOf}
            onOpenNode={openNode}
            onWheelDelta={delta => zoomBy(delta)}
            onPanStart={event => {
              if (event.button !== 0) return
              const target = event.target as { closest?: (selector: string) => unknown } | null
              if (typeof target?.closest === 'function' && target.closest('button, a') != null) return
              event.currentTarget.setPointerCapture?.(event.pointerId)
              drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
            }}
            onPanMove={event => {
              if (drag.current === null) return
              setOffset({ x: drag.current.ox + (event.clientX - drag.current.x), y: drag.current.oy + (event.clientY - drag.current.y) })
            }}
            onPanEnd={() => { drag.current = null }}
          />
        </>
      )}
    </section>
  )
}

function CanvasViewport(props: {
  canvas: CanvasReadView
  zoom: number
  offset: { x: number; y: number }
  rectOf: (node: CanvasNodeView, minX: number, minY: number) => Rect
  onOpenNode: (node: CanvasNodeView) => void
  onWheelDelta: (delta: number) => void
  onPanStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPanMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPanEnd: () => void
}) {
  const { canvas, zoom, offset, rectOf, onOpenNode } = props
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const minX = Math.min(...canvas.nodes.map(node => node.x))
  const minY = Math.min(...canvas.nodes.map(node => node.y))
  const stageWidth = canvas.width + 80
  const stageHeight = canvas.height + 80
  const rects = new Map(canvas.nodes.map(node => [node.id, rectOf(node, minX, minY)]))
  const ordered = [...canvas.nodes].sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1))

  // Native non-passive wheel listener: the viewport zooms instead of scrolling
  // a second document, and preventDefault is legal here.
  useEffect(() => {
    const element = viewportRef.current
    if (element === null) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      props.onWheelDelta(event.deltaY < 0 ? 0.1 : -0.1)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => { element.removeEventListener('wheel', onWheel) }
  }, [props.onWheelDelta])

  return (
    <div
      ref={viewportRef}
      className="lc-canvas-viewport"
      style={{ touchAction: 'none' }}
      onPointerDown={props.onPanStart}
      onPointerMove={props.onPanMove}
      onPointerUp={props.onPanEnd}
      onPointerLeave={props.onPanEnd}
      onPointerCancel={props.onPanEnd}
    >
      <div
        className="lc-canvas-stage"
        data-zoom={zoom}
        style={{ width: stageWidth, height: stageHeight, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
      >
        <svg className="lc-canvas-edges" width={stageWidth} height={stageHeight}>
          <defs>
            {(['prerequisite', 'composition', 'application', 'related'] as const).map(relation => (
              <marker
                key={relation}
                id={`lc-canvas-arrow-${relation}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={relationColors[relation]} />
              </marker>
            ))}
          </defs>
          {canvas.edges.map(edge => {
            const from = rects.get(edge.fromNode)
            const to = rects.get(edge.toNode)
            if (from === undefined || to === undefined) return null
            const geometry = edgeGeometry(from, to, edge.selfLoop, edge.fromSide ?? null, edge.toSide ?? null)
            const marker = `url(#lc-canvas-arrow-${edge.relation})`
            return (
              <g
                key={edge.id}
                className={`lc-canvas-edge lc-edge-${edge.relation}`}
                data-edge-id={edge.id}
                data-relation={edge.relation}
                data-self={edge.selfLoop ? 'true' : 'false'}
                data-from-end={edge.fromEnd}
                data-to-end={edge.toEnd}
              >
                <path
                  d={geometry.d}
                  fill="none"
                  stroke={relationColors[edge.relation]}
                  strokeWidth={1.6}
                  strokeDasharray={relationDashes[edge.relation]}
                  markerStart={edge.fromEnd === 'arrow' ? marker : undefined}
                  markerEnd={edge.toEnd === 'arrow' ? marker : undefined}
                />
                <text x={geometry.labelX} y={geometry.labelY} textAnchor="middle" fill={relationColors[edge.relation]} className="lc-canvas-edge-label">
                  {edgeText(edge)}
                </text>
              </g>
            )
          })}
        </svg>

        {ordered.map(node => {
          const rect = rects.get(node.id)
          if (rect === undefined) return null
          const style = {
            position: 'absolute' as const,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            zIndex: node.type === 'group' ? 0 : 1,
            borderColor: nodeColor(node.color),
          }
          if (node.type === 'group') {
            return (
              <div key={node.id} className="lc-canvas-node lc-canvas-node-group" data-node-id={node.id} data-node-type="group" style={style}>
                {node.label !== null && node.label !== '' && <span className="lc-canvas-group-label">{node.label}</span>}
              </div>
            )
          }
          if (node.type === 'text') {
            return (
              <div key={node.id} className="lc-canvas-node lc-canvas-node-text" data-node-id={node.id} data-node-type="text" style={style}>
                <p>{node.text}</p>
              </div>
            )
          }
          if (node.type === 'link') {
            const url = node.url ?? ''
            const safe = isSafeCanvasUrl(url)
            return (
              <div key={node.id} className="lc-canvas-node lc-canvas-node-link" data-node-id={node.id} data-node-type="link" style={style}>
                {safe
                  ? <a href={url} target="_blank" rel="noreferrer noopener">{url}</a>
                  : <span>{url === '' ? '未填写链接' : '不支持直接打开的链接'}</span>}
              </div>
            )
          }
          const target = node.target
          const badge = target !== null && target.status !== 'ok' ? targetBadges[target.status] ?? '不可打开' : null
          return (
            <button
              key={node.id}
              type="button"
              className="lc-canvas-node lc-canvas-node-file"
              data-node-id={node.id}
              data-node-type="file"
              aria-label={`打开 ${fileLabel(node)}`}
              title={node.file ?? ''}
              style={style}
              onClick={() => onOpenNode(node)}
            >
              <span className="lc-canvas-file-name">{fileLabel(node)}</span>
              {node.file !== null && <span className="lc-canvas-file-path">{node.file}</span>}
              {badge !== null && <span className="lc-canvas-file-badge">{badge}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
