/**
 * Recoverable drafts for note text that has not reached disk. A draft is not a
 * second source of truth: it only bridges a failed, in-flight or interrupted
 * save, and is dropped as soon as the same text is confirmed on disk.
 */
export interface NoteDraft {
  content: string
  /** Version the editor had read when the draft was parked (diagnostics only). */
  baseVersion: string
  savedAt: string
}

export interface NoteDraftStore {
  read(spaceId: string, path: string): NoteDraft | null
  write(spaceId: string, path: string, draft: NoteDraft): void
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

/** In-memory store; the fallback when no web storage is available. */
export function createMemoryDraftStore(): NoteDraftStore {
  const files = new Map<string, NoteDraft>()
  return {
    read(spaceId, path) {
      return files.get(keyOf(spaceId, path)) ?? null
    },
    write(spaceId, path, draft) {
      files.set(keyOf(spaceId, path), { ...draft })
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
 * page refresh in the same tab, and disappear when the tab closes. Note bodies
 * are never copied into plugin state or a second persistent file.
 */
export function createSessionDraftStore(storage: WebStorageLike | null = browserSessionStorage()): NoteDraftStore {
  if (storage === null) return createMemoryDraftStore()
  return {
    read(spaceId, path) {
      try {
        return parseDraft(storage.getItem(keyOf(spaceId, path)))
      } catch {
        return null
      }
    },
    write(spaceId, path, draft) {
      try {
        storage.setItem(keyOf(spaceId, path), JSON.stringify(draft))
      } catch {
        // Quota or privacy failure: the editor still holds the text.
      }
    },
    remove(spaceId, path) {
      try {
        storage.removeItem(keyOf(spaceId, path))
      } catch {
        // Ignore; a stale draft is reconciled against disk on the next load.
      }
    },
  }
}
