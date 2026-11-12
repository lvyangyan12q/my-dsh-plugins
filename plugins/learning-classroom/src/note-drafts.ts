/**
 * Recoverable drafts for note text that has not reached disk. A draft is not a
 * second source of truth: it only bridges a failed, in-flight or interrupted
 * save, and is dropped as soon as the same text is confirmed on disk.
 */
export type DraftStorage = 'session' | 'memory'

export interface NoteDraft {
  content: string
  /** Version the editor had read when the draft text was authored. */
  baseVersion: string
  savedAt: string
  /** Where this copy came from when read; never persisted into the payload. */
  storage?: DraftStorage
}

export interface NoteDraftStore {
  read(spaceId: string, path: string): NoteDraft | null
  /** Returns where the draft actually went; `memory` means it will not survive a page close. */
  write(spaceId: string, path: string, draft: NoteDraft): DraftStorage
  remove(spaceId: string, path: string): void
}

const keyPrefix = 'learning-classroom:note-draft:v1:'

function keyOf(spaceId: string, path: string): string {
  return `${keyPrefix}${encodeURIComponent(spaceId)}:${encodeURIComponent(path)}`
}

function isDraft(value: unknown): value is NoteDraft {
  if (value === null || typeof value !== 'object') return false
  const draft = value as { content?: unknown; baseVersion?: unknown; savedAt?: unknown }
  return typeof draft.content === 'string'
    && typeof draft.baseVersion === 'string'
    && typeof draft.savedAt === 'string'
}

function parseDraft(raw: string | null): NoteDraft | null {
  if (raw === null) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isDraft(parsed) ? parsed : null
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
      files.set(keyOf(spaceId, path), { content: draft.content, baseVersion: draft.baseVersion, savedAt: draft.savedAt })
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
  return {
    read(spaceId, path) {
      // A failed setItem left the newest text in the fallback; it wins.
      const fallback = memoryFallback.read(spaceId, path)
      if (fallback !== null) return fallback
      try {
        const draft = parseDraft(backing.getItem(keyOf(spaceId, path)))
        return draft === null ? null : { ...draft, storage: 'session' }
      } catch {
        return null
      }
    },
    write(spaceId, path, draft) {
      try {
        backing.setItem(keyOf(spaceId, path), JSON.stringify({
          content: draft.content,
          baseVersion: draft.baseVersion,
          savedAt: draft.savedAt,
        }))
        memoryFallback.remove(spaceId, path)
        return 'session'
      } catch {
        memoryFallback.write(spaceId, path, draft)
        return 'memory'
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
