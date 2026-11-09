import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  canvasFileName,
  isSafeCanvasUrl,
  relationName,
  type CanvasRelation,
} from './canvas.ts'
import type { ClassroomClient } from './classroom-client.ts'
import type { CanvasEdgeView, CanvasNodeView, CanvasReadView, ClassroomSpaceView } from './contract.ts'

/** What the canvas asks the classroom to open when a file node is clicked. */
export interface CanvasOpenTarget {
  kind: 'lecture' | 'note'
  /** Space-relative path used by classroom commands, e.g. `讲义/01.md`. */
  path: string
  /** Vault-relative path shown to the reader and handed to Obsidian. */
  vaultPath: string
  label: string
}

export interface CanvasZoneProps {
  client: ClassroomClient
  space: ClassroomSpaceView
  /** Absolute knowledge-vault root, used to build the Obsidian open link. */
  vaultPath: string | null
  busy: boolean
  onOpenTarget: (target: CanvasOpenTarget) => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; canvas: CanvasReadView }
  | { status: 'failed'; message: string }

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
.lc-canvas-handoff{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.lc-canvas-handoff a{padding:4px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);text-decoration:none;font-size:12px}
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

function edgeGeometry(from: Rect, to: Rect, selfLoop: boolean): { d: string; labelX: number; labelY: number } {
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
  const dx = toCenter.x - fromCenter.x
  const dy = toCenter.y - fromCenter.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const start = borderPoint(fromCenter, ux, uy, from)
  const end = borderPoint(toCenter, -ux, -uy, to)
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
  const { client, space, vaultPath, busy, onOpenTarget } = props
  const spaceId = space.id
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  const [notice, setNotice] = useState('')
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
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

  const canvas = load.status === 'ready' ? load.canvas : null
  const expectedPath = canvas?.path ?? `${space.directory}/${canvasFileName}`
  const obsidianUrl = obsidianOpenUrl(vaultPath, expectedPath)

  const reload = () => {
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setReloadKey(key => key + 1)
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
          <p className="lc-canvas-path">脉络文件：<code>{expectedPath}</code></p>
        </div>
        <div className="lc-canvas-tools">
          <button type="button" disabled={busy} onClick={() => setZoom(value => Math.min(2, Number((value + 0.1).toFixed(2))))}>放大</button>
          <button type="button" disabled={busy} onClick={() => setZoom(value => Math.max(0.4, Number((value - 0.1).toFixed(2))))}>缩小</button>
          <button type="button" disabled={busy} onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }}>重置</button>
          <button type="button" disabled={busy} onClick={reload}>刷新脉络</button>
        </div>
      </div>

      <div className="lc-canvas-handoff">
        {obsidianUrl !== null
          ? <a href={obsidianUrl}>在 Obsidian 中打开</a>
          : <span className="lc-hint">未选择知识文件库，无法生成 Obsidian 打开链接。</span>}
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
            onPanStart={event => {
              const target = event.target as { closest?: (selector: string) => unknown } | null
              if (typeof target?.closest === 'function' && target.closest('button, a') != null) return
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
  onPanStart: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPanMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPanEnd: () => void
}) {
  const { canvas, zoom, offset, rectOf, onOpenNode } = props
  const minX = Math.min(...canvas.nodes.map(node => node.x))
  const minY = Math.min(...canvas.nodes.map(node => node.y))
  const stageWidth = canvas.width + 80
  const stageHeight = canvas.height + 80
  const rects = new Map(canvas.nodes.map(node => [node.id, rectOf(node, minX, minY)]))
  const ordered = [...canvas.nodes].sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1))

  return (
    <div
      className="lc-canvas-viewport"
      onPointerDown={props.onPanStart}
      onPointerMove={props.onPanMove}
      onPointerUp={props.onPanEnd}
      onPointerLeave={props.onPanEnd}
    >
      <div
        className="lc-canvas-stage"
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
            const geometry = edgeGeometry(from, to, edge.selfLoop)
            return (
              <g
                key={edge.id}
                className={`lc-canvas-edge lc-edge-${edge.relation}`}
                data-edge-id={edge.id}
                data-relation={edge.relation}
                data-self={edge.selfLoop ? 'true' : 'false'}
              >
                <path
                  d={geometry.d}
                  fill="none"
                  stroke={relationColors[edge.relation]}
                  strokeWidth={1.6}
                  strokeDasharray={relationDashes[edge.relation]}
                  markerEnd={`url(#lc-canvas-arrow-${edge.relation})`}
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
