import { defineDomain } from '@deepseek-ai/dsh-storage-domain'
import { z } from 'zod'

/** One learning space as stored: navigation identity plus its vault folder binding. */
export const spaceSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  directory: z.string().min(1).max(120),
  notePath: z.string().min(1).max(200),
  createdAt: z.string().min(1).max(40),
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
