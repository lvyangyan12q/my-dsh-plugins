/**
 * Recoverable drafts for note text that has not reached disk. A draft is not a
 * second source of truth: it only bridges a failed, in-flight or interrupted
 * save, and is dropped as soon as the same text is confirmed on disk.
 */
export type DraftStorage = 'session' | 'memory'
export type DraftWriteResult = DraftStorage | 'stale'

export interface NoteDraft {
  content: string
  /** Version the editor had read when the draft text was authored. */
  baseVersion: string
  /** Monotonic per-file draft revision; an older failure may not replace a newer draft. */
  revision: number
  savedAt: string
  /** Where this copy came from when read; never persisted into the payload. */
  storage?: DraftStorage
}

export interface NoteDraftStore {
  read(spaceId: string, path: string): NoteDraft | null
  /**
   * Returns where the draft actually went. `memory` means it will not survive a
   * page close; `stale` means a newer draft already exists and was kept.
   */
  write(spaceId: string, path: string, draft: NoteDraft): DraftWriteResult
  remove(spaceId: string, path: string): void
}

const keyPrefix = 'learning-classroom:note-draft:v1:'

/**
 * Module-scoped monotonic revision clock per draft key. It deliberately
 * survives NotesZone mounts: clearing a draft after reading it must not reset
 * the clock, or a late failure from an older mount could reuse a lower revision
 * and replace a newer draft. The clock is page-scoped; old in-flight callbacks
 * do not survive a page reload.
 */
const revisionClocks = new Map<string, number>()

/**
 * A draft belongs to one space UUID plus a space-relative note path. Space ids
 * are minted with `randomUUID()` when a space is created, and choosing a
 * different vault clears the registered spaces, so a key cannot be reused by a
 * space from another vault.
 */
function keyOf(spaceId: string, path: string): string {
  return `${keyPrefix}${encodeURIComponent(spaceId)}:${encodeURIComponent(path)}`
}

/** Raise the shared clock to at least the revision read from disk. */
export function observeDraftRevision(spaceId: string, path: string, revision: number): number {
  const key = keyOf(spaceId, path)
  const next = Math.max(revisionClocks.get(key) ?? 0, revision, 0)
  revisionClocks.set(key, next)
  return next
}

/** Allocate the next revision for an edit; never regresses across mounts. */
export function allocateDraftRevision(spaceId: string, path: string): number {
  const key = keyOf(spaceId, path)
  const next = (revisionClocks.get(key) ?? 0) + 1
  revisionClocks.set(key, next)
  return next
}

/** Latest allocated/observed revision for a key. */
export function draftRevisionClock(spaceId: string, path: string): number {
  return revisionClocks.get(keyOf(spaceId, path)) ?? 0
}

function isDraft(value: unknown): value is NoteDraft {
  if (value === null || typeof value !== 'object') return false
  const draft = value as { content?: unknown; baseVersion?: unknown; revision?: unknown; savedAt?: unknown }
  return typeof draft.content === 'string'
    && typeof draft.baseVersion === 'string'
    && typeof draft.savedAt === 'string'
    && (draft.revision === undefined || typeof draft.revision === 'number')
}

function parseDraft(raw: string | null): NoteDraft | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isDraft(parsed)) return null
    return { ...parsed, revision: parsed.revision ?? 0 }
  } catch {
    return null
  }
}

/**
 * A shared memory fallback. It is deliberately module-scoped: when the browser
 * refuses sessionStorage, a new NotesZone instance on the same page must still
 * find the draft parked by the previous one. It is not durable across reloads,
 * so the UI has to say so instead of pretending the draft is safe.
 */
const memoryFallback = createMemoryDraftStore()

/** In-memory store; also the cross-mount fallback for the session store. */
export function createMemoryDraftStore(): NoteDraftStore {
  const files = new Map<string, NoteDraft>()
  return {
    read(spaceId, path) {
      const draft = files.get(keyOf(spaceId, path))
      return draft === undefined ? null : { ...draft, storage: 'memory' }
    },
    write(spaceId, path, draft) {
      const key = keyOf(spaceId, path)
      const existing = files.get(key)
      if (existing !== undefined && draft.revision <= (existing.revision ?? 0)) return 'stale'
      files.set(key, {
        content: draft.content,
        baseVersion: draft.baseVersion,
        revision: draft.revision,
        savedAt: draft.savedAt,
      })
      return 'memory'
    },
    remove(spaceId, path) {
      files.delete(keyOf(spaceId, path))
    },
  }
}

export interface WebStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function browserSessionStorage(): WebStorageLike | null {
  try {
    if (typeof globalThis.sessionStorage === 'undefined') return null
    return globalThis.sessionStorage
  } catch {
    // Access can throw under strict cookie/privacy settings.
    return null
  }
}

/**
 * Session-scoped browser store: drafts survive panel/topic navigation and a
 * page refresh in the same tab, and disappear when the tab closes. A quota or
 * privacy failure falls back to the shared memory store instead of dropping
 * the text; the returned storage kind lets the UI warn that it is not durable.
 */
export function createSessionDraftStore(storage: WebStorageLike | null = browserSessionStorage()): NoteDraftStore {
  if (storage === null) return memoryFallback
  const backing = storage

  const read = (spaceId: string, path: string): NoteDraft | null => {
    // A failed setItem left the newest text in the fallback; it wins.
    const fallback = memoryFallback.read(spaceId, path)
    if (fallback !== null) return fallback
    try {
      const draft = parseDraft(backing.getItem(keyOf(spaceId, path)))
      return draft === null ? null : { ...draft, storage: 'session' }
    } catch {
      return null
    }
  }

  return {
    read,
    write(spaceId, path, draft) {
      const existing = read(spaceId, path)
      if (existing !== null && draft.revision <= (existing.revision ?? 0)) return 'stale'
      try {
        backing.setItem(keyOf(spaceId, path), JSON.stringify({
          content: draft.content,
          baseVersion: draft.baseVersion,
          revision: draft.revision,
          savedAt: draft.savedAt,
        }))
        memoryFallback.remove(spaceId, path)
        return 'session'
      } catch {
        const written = memoryFallback.write(spaceId, path, draft)
        return written === 'stale' ? 'stale' : 'memory'
      }
    },
    remove(spaceId, path) {
      try {
        backing.removeItem(keyOf(spaceId, path))
      } catch {
        // Ignore; the in-memory copy is still removed below.
      }
      memoryFallback.remove(spaceId, path)
    },
  }
}
