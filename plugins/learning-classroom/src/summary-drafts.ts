import type { DraftStorage, DraftWriteResult, NoteDraftStore } from './note-drafts.ts'
import { summaryFileName } from './summary.ts'

/**
 * Recoverable drafts for the summary's two text fields. This is the same
 * mechanism the note editor uses: every edit is parked synchronously in
 * sessionStorage (falling back to a shared memory store), keyed by learning
 * space, with a monotonic revision so a late failure cannot replace newer text.
 * The draft records the file version it was written against; saving always uses
 * that baseline, never a version that was re-read after the draft existed.
 */
export interface SummaryDraft {
  summary: string
  nextStep: string
  /** File version the draft was authored against; null when no file existed. */
  baseVersion: string | null
  revision: number
  savedAt: string
  /** Where the copy was read from; never persisted into the payload. */
  storage?: DraftStorage
}

export interface SummaryDraftStore {
  read(spaceId: string): SummaryDraft | null
  write(spaceId: string, draft: Omit<SummaryDraft, 'storage'>): DraftWriteResult
  remove(spaceId: string): void
}

interface SummaryPayload {
  summary: string
  nextStep: string
}

function parsePayload(content: string): SummaryPayload | null {
  try {
    const parsed: unknown = JSON.parse(content)
    if (parsed === null || typeof parsed !== 'object') return null
    const value = parsed as { summary?: unknown; nextStep?: unknown }
    if (typeof value.summary !== 'string' || typeof value.nextStep !== 'string') return null
    return { summary: value.summary, nextStep: value.nextStep }
  } catch {
    return null
  }
}

/**
 * One summary draft per learning space. The summary file is always at the space
 * root with a fixed name, so the space id is the whole key; reusing the note
 * draft store keeps the storage, fallback and risk guard identical to ticket 04.
 */
export function createSummaryDraftStore(noteDrafts: NoteDraftStore): SummaryDraftStore {
  const draftPath = summaryFileName
  return {
    read(spaceId) {
      const draft = noteDrafts.read(spaceId, draftPath)
      if (draft === null) return null
      const payload = parsePayload(draft.content)
      if (payload === null) return null
      return {
        summary: payload.summary,
        nextStep: payload.nextStep,
        baseVersion: draft.baseVersion === '' ? null : draft.baseVersion,
        revision: draft.revision,
        savedAt: draft.savedAt,
        storage: draft.storage,
      }
    },
    write(spaceId, draft) {
      return noteDrafts.write(spaceId, draftPath, {
        content: JSON.stringify({ summary: draft.summary, nextStep: draft.nextStep }),
        baseVersion: draft.baseVersion ?? '',
        revision: draft.revision,
        savedAt: draft.savedAt,
      })
    },
    remove(spaceId) {
      noteDrafts.remove(spaceId, draftPath)
    },
  }
}
