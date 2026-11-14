import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'
import { clampWidth, defaultLayout, zoneWidthBounds, type FixedZone } from './layout.ts'

/**
 * Stored pane width. Numbers are rounded and truncated into their bounds; a
 * non-number falls back to the zone default. Unknown fields are rejected by the
 * surrounding `.strict()` object.
 */
function widthSchema(zone: FixedZone) {
  return z.number().finite()
    .transform(value => clampWidth(zone, value))
    .default(zoneWidthBounds[zone].default)
}

/** Per-space classroom layout: pane widths plus collapsed zones. */
export const layoutSchema = z.object({
  widths: z.object({
    directory: widthSchema('directory'),
    notes: widthSchema('notes'),
    conversation: widthSchema('conversation'),
  }).strict(),
  collapsed: z.object({
    directory: z.boolean().default(false),
    notes: z.boolean().default(false),
    conversation: z.boolean().default(false),
  }).strict(),
}).strict()

/** Last scroll offset in one course file; navigation state only. */
export const readingPositionSchema = z.object({
  path: z.string().min(1).max(400).nullable().default(null),
  scrollTop: z.number().finite().min(0).max(10_000_000).default(0),
}).strict()

/** One learning space as stored: navigation identity plus its vault folder binding. */
export const spaceSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  directory: z.string().min(1).max(120),
  notePath: z.string().min(1).max(200),
  createdAt: z.string().min(1).max(40),
  // The teacher Session binding is navigation state, never conversation
  // content. Older state without the field reads as "not opened yet".
  sessionId: z.string().min(1).max(200).nullable().default(null),
  /**
   * Last opened lecture, relative to the space folder (`讲义/…` or an explicitly
   * linked path). Optional with a default so v1 state written before this ticket
   * still loads.
   */
  lecturePath: z.string().min(1).max(400).nullable().default(null),
  /**
   * Existing space files the learner explicitly linked into the course. Only the
   * selection is stored; the file bodies stay in the knowledge vault and are
   * never copied or moved.
   */
  linkedLectures: z.array(z.string().min(1).max(400)).max(500).default([]),
  /**
   * Pane widths and collapsed zones. Optional with a default so state written by
   * tickets 01–03 still loads and existing spaces keep working.
   */
  layout: layoutSchema.default(defaultLayout()),
  /**
   * Last reading position per space. Optional with a default so state written
   * before this ticket still loads and the reader simply starts at the top.
   */
  readingPosition: readingPositionSchema.default({ path: null, scrollTop: 0 }),
}).strict()

/**
 * The plugin's storage holds navigation and bindings only: the vault root, the
 * registered learning spaces and the current selection. Lecture, note and canvas
 * bodies never enter it — they are files in the knowledge vault.
 */
export const classroomStateSchema = z.object({
  schemaVersion: z.literal(1),
  vaultPath: z.string().min(1).max(4096).nullable(),
  spaces: z.array(spaceSchema).max(1000),
  currentSpaceId: z.string().min(1).max(64).nullable(),
}).strict()

export type ClassroomSpace = z.infer<typeof spaceSchema>
export type ClassroomState = z.infer<typeof classroomStateSchema>

export function emptyClassroomState(): ClassroomState {
  return { schemaVersion: 1, vaultPath: null, spaces: [], currentSpaceId: null }
}

/** New storage identity. The removed `personal_learning` domain is never opened. */
export const learningClassroomDomain = defineDomain({
  name: 'learning_classroom',
  version: 1,
  global: { schema: classroomStateSchema, initial: emptyClassroomState() },
  tables: {},
})

/** The narrow storage seam the Host app is written against. */
export interface ClassroomStateStore {
  read(): ClassroomState
  write(next: ClassroomState): Promise<void>
  close(): Promise<void>
}

interface StorageGlobal {
  get(): unknown
  set(value: unknown): Promise<void>
}

interface StorageDomainHandle {
  readonly global: StorageGlobal
  close(): Promise<void>
}

interface StorageDomainFacility {
  open(spec: typeof learningClassroomDomain): Promise<StorageDomainHandle>
}

/** Production adapter over the real `learning_classroom` v1 storage domain. */
export async function openClassroomStateStore(ctx: { storageDomain: StorageDomainFacility }): Promise<ClassroomStateStore> {
  const domain = await ctx.storageDomain.open(learningClassroomDomain)
  return {
    read: () => classroomStateSchema.parse(domain.global.get()),
    write: async next => { await domain.global.set(classroomStateSchema.parse(next)) },
    close: () => domain.close(),
  }
}
