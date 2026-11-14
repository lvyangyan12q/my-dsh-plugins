/**
 * Pure classroom layout model: which zones exist, how wide the fixed zones are,
 * which zones are collapsed, and how a separator drag changes adjacent widths.
 *
 * The lecture column is the flexible one (`minmax(...)` in CSS), so a layout
 * stores a width for the three fixed zones only. Everything here is free of DOM
 * and storage concerns; `state.ts` validates the persisted shape and
 * `classroom-layout.tsx` renders it.
 */

export const zoneIds = ['directory', 'lecture', 'notes', 'conversation'] as const
export type ClassroomZone = typeof zoneIds[number]

/** Zones the learner can collapse. The lecture is always present. */
export const collapsibleZones = ['directory', 'notes', 'conversation'] as const
export type CollapsibleZone = typeof collapsibleZones[number]

/** Zones with a stored pixel width. */
export type FixedZone = CollapsibleZone

export const zoneLabels: Record<ClassroomZone, string> = {
  directory: '课程目录',
  lecture: '讲义',
  notes: '我的笔记',
  conversation: '老师对话',
}

export interface ZoneWidthBounds {
  min: number
  max: number
  default: number
}

/** Lecture minimum keeps the reading column legible when the side panes grow. */
export const lectureMinWidth = 280
export const separatorWidth = 6
/** The narrow/one-zone-at-a-time mode starts below this container width. */
export const narrowThreshold = 960
/** Pixels a separator moves per arrow key press; Shift multiplies it. */
export const keyboardResizeStep = 16

export const zoneWidthBounds: Record<FixedZone, ZoneWidthBounds> = {
  directory: { min: 140, max: 360, default: 200 },
  notes: { min: 200, max: 480, default: 220 },
  conversation: { min: 220, max: 520, default: 240 },
}

export interface ClassroomLayout {
  widths: Record<FixedZone, number>
  collapsed: Record<CollapsibleZone, boolean>
}

export function defaultLayout(): ClassroomLayout {
  return {
    widths: {
      directory: zoneWidthBounds.directory.default,
      notes: zoneWidthBounds.notes.default,
      conversation: zoneWidthBounds.conversation.default,
    },
    collapsed: { directory: false, notes: false, conversation: false },
  }
}

/** Round and clamp one stored width. Non-numbers fall back to the zone default. */
export function clampWidth(zone: FixedZone, value: unknown): number {
  const bounds = zoneWidthBounds[zone]
  if (typeof value !== 'number' || !Number.isFinite(value)) return bounds.default
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)))
}

function recordOf(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

/**
 * Coerce anything read from storage into a usable layout. Missing fields take
 * defaults, numeric widths are truncated into their bounds, and unknown fields
 * are dropped — an old or hand-edited state never breaks an existing space.
 */
export function normalizeLayout(value: unknown): ClassroomLayout {
  const source = recordOf(value)
  const widths = recordOf(source.widths)
  const collapsed = recordOf(source.collapsed)
  const result = defaultLayout()
  for (const zone of collapsibleZones) {
    result.widths[zone] = clampWidth(zone, widths[zone])
    result.collapsed[zone] = typeof collapsed[zone] === 'boolean' ? collapsed[zone] : false
  }
  return result
}

/** Visible zones in the fixed on-screen order; the lecture is always visible. */
export function visibleZones(layout: ClassroomLayout): ClassroomZone[] {
  return zoneIds.filter(zone => zone === 'lecture' || !layout.collapsed[zone])
}

export interface LayoutBoundary {
  leading: ClassroomZone
  trailing: ClassroomZone
  /** Grid column the separator occupies; zones are at columns 1, 3, 5, 7. */
  column: number
  /** The pane whose pixel width the separator reports and moves. */
  adjustable: FixedZone
}

const separatorColumn: Record<ClassroomZone, number> = {
  directory: 2,
  lecture: 4,
  notes: 6,
  conversation: 7,
}

/** Separators only exist between zones that are both visible. */
export function layoutBoundaries(layout: ClassroomLayout): LayoutBoundary[] {
  const zones = visibleZones(layout)
  const boundaries: LayoutBoundary[] = []
  for (let index = 1; index < zones.length; index += 1) {
    const leading = zones[index - 1]
    const trailing = zones[index]
    const adjustable: FixedZone = leading === 'lecture'
      ? trailing as FixedZone
      : leading === 'directory'
        ? 'directory'
        : 'conversation'
    boundaries.push({ leading, trailing, column: separatorColumn[leading], adjustable })
  }
  return boundaries
}

function withWidths(layout: ClassroomLayout, widths: Record<FixedZone, number>): ClassroomLayout {
  return { widths, collapsed: { ...layout.collapsed } }
}

/**
 * Move one boundary by `delta` pixels (positive = right). The lecture flexes, so
 * a boundary beside it only changes the fixed pane on the other side; two fixed
 * panes trade pixels without changing their combined width.
 */
export function resizeLayout(layout: ClassroomLayout, boundary: LayoutBoundary, delta: number): ClassroomLayout {
  const current = layoutBoundaries(layout).find(row => row.leading === boundary.leading && row.trailing === boundary.trailing)
  if (current === undefined || !Number.isFinite(delta) || delta === 0) return layout
  const widths = { ...layout.widths }

  if (current.leading === 'notes' && current.trailing === 'conversation') {
    const notes = widths.notes
    const conversation = widths.conversation
    const lowest = Math.max(zoneWidthBounds.notes.min - notes, conversation - zoneWidthBounds.conversation.max)
    const highest = Math.min(zoneWidthBounds.notes.max - notes, conversation - zoneWidthBounds.conversation.min)
    const applied = Math.min(highest, Math.max(lowest, Math.round(delta)))
    if (applied === 0) return layout
    widths.notes = notes + applied
    widths.conversation = conversation - applied
    return withWidths(layout, widths)
  }

  const zone = current.adjustable
  // Dragging right grows the directory (left of the lecture) but shrinks the
  // notes/conversation pane (right of it).
  const direction = current.leading === 'directory' ? 1 : -1
  const next = clampWidth(zone, widths[zone] + direction * Math.round(delta))
  if (next === widths[zone]) return layout
  widths[zone] = next
  return withWidths(layout, widths)
}

/** Collapse or restore one zone; the lecture and unknown zones are ignored. */
export function toggleCollapsed(layout: ClassroomLayout, zone: string): ClassroomLayout {
  if (!(collapsibleZones as readonly string[]).includes(zone)) return layout
  const key = zone as CollapsibleZone
  return {
    widths: { ...layout.widths },
    collapsed: { ...layout.collapsed, [key]: !layout.collapsed[key] },
  }
}

/** Unknown or zero container width is treated as wide, never as a narrow guess. */
export function isNarrowWidth(width: number | null | undefined, threshold: number = narrowThreshold): boolean {
  return typeof width === 'number' && Number.isFinite(width) && width > 0 && width < threshold
}

/**
 * Narrowest wide layout that still shows every visible zone: the lecture at its
 * readable minimum, the fixed panes at their saved widths and the separators.
 */
export function minimumWideWidth(layout: ClassroomLayout): number {
  const visible = visibleZones(layout)
  const fixed = visible.reduce((sum, zone) => (zone === 'lecture' ? sum : sum + layout.widths[zone]), 0)
  return lectureMinWidth + fixed + Math.max(0, visible.length - 1) * separatorWidth
}

/**
 * Whether to show one zone at a time. Saved pane widths count: a container wide
 * enough for the threshold can still be too narrow for deliberately widened
 * panes, and switching to zones avoids a horizontal scrollbar.
 */
export function usesNarrowLayout(width: number | null | undefined, layout: ClassroomLayout, threshold: number = narrowThreshold): boolean {
  if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) return false
  if (width < threshold) return true
  return width < minimumWideWidth(layout)
}

/** Narrow mode opens on the lecture; an unknown remembered zone falls back to it. */
export function resolveNarrowZone(zone: unknown): ClassroomZone {
  return (zoneIds as readonly unknown[]).includes(zone) ? zone as ClassroomZone : 'lecture'
}
