import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createDebouncer, createSerialQueue } from './autosave.ts'
import { classroomErrorCode, type ClassroomClient } from './classroom-client.ts'
import type { ClassroomSpaceView, NoteDocumentView, NoteSaveCommand, NoteSummaryView } from './contract.ts'
import {
  allocateDraftRevision,
  clearDraftRisk,
  createSessionDraftStore,
  draftRevisionClock,
  hasNonDurableDrafts,
  markDraftNonDurable,
  observeDraftRevision,
  type DraftStorage,
  type DraftWriteResult,
  type NoteDraft,
  type NoteDraftStore,
} from './note-drafts.ts'
import { NotePreview } from './notes-preview.tsx'

export type NoteSaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'failed' | 'conflict'

/** One-shot request to open a note; a new token re-opens the same path. */
export interface NoteOpenRequest {
  path: string
  token: number
}

export interface NotesZoneProps {
  client: ClassroomClient
  space: ClassroomSpaceView
  /** Debounce for autosave; tests shorten it, the product uses the default. */
  debounceMs?: number
  /** Ask the notes pane to open a specific note, e.g. from a canvas file node. */
  openRequest?: NoteOpenRequest | null
  /** Where unsaved input is parked when the file, topic or classroom is left. */
  drafts?: NoteDraftStore
}

type SaveMode = 'auto' | 'explicit' | 'overwrite'

interface SaveRequest {
  spaceId: string
  path: string
  content: string
  version: string
  generation: number
  /** Per-file read epoch; a write queued before a re-read must not apply after it. */
  readEpoch: number
  /** Draft revision this snapshot belongs to; older failures may not replace newer drafts. */
  draftRevision: number
  mode: SaveMode
}

const defaultDebounceMs = 700

const memoryDraftWarning = '浏览器存储不可用：未保存草稿只保存在当前页面内存，关闭或刷新页面会丢失。请先保存或复制。'
const failedDraftWarning = '草稿保存失败：请先保存到磁盘或复制内容，离开后无法恢复。'

function fileKey(spaceId: string, notePath: string): string {
  return `${spaceId}\u0000${notePath}`
}

const statusLabel: Record<NoteSaveStatus, string> = {
  loading: '正在读取笔记…',
  saved: '已保存',
  dirty: '有未保存的修改',
  saving: '保存中…',
  failed: '保存失败',
  conflict: '保存冲突',
}

const styles = `
.lc-notes-root{display:flex;flex-direction:column;gap:8px;min-height:0;flex:1}
.lc-notes-bar{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;flex-wrap:wrap}
.lc-notes-bar label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-notes-bar select{max-width:100%;padding:4px 6px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit}
.lc-note-status{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-note-status[data-state="failed"],.lc-note-status[data-state="conflict"]{color:#d1242f;font-weight:600}
.lc-note-editor{flex:1;min-height:220px;resize:vertical;padding:10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:var(--dsh-surface,#fff);color:inherit;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px;line-height:1.6}
.lc-note-actions{display:flex;gap:8px;flex-wrap:wrap}
.lc-note-tabs{display:flex;gap:6px}
.lc-note-tab{padding:3px 12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:999px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer;font-size:12px}
.lc-note-tab[aria-selected="true"]{background:var(--dsh-accent,#0969da);border-color:var(--dsh-accent,#0969da);color:#fff}
.lc-note-compare{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:0}
.lc-note-compare section{display:flex;flex-direction:column;gap:4px;min-width:0}
.lc-note-compare h3{margin:0;font-size:12px}
.lc-note-compare pre{margin:0;max-height:260px;overflow:auto;padding:8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);white-space:pre-wrap;word-break:break-word;font-size:12px}
`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '笔记操作失败。'
}

/**
 * The learner's notes: a real Markdown file in the space's `笔记/` folder,
 * edited as text or previewed from the same body and saved through the Host
 * file service. The version read from disk travels with every save, so an
 * external edit is refused, never silently overwritten. Unsaved input is also
 * parked as a draft when switching file/topic or leaving the classroom, so a
 * failed or in-flight save cannot silently discard it.
 */
export function NotesZone({ client, space, debounceMs = defaultDebounceMs, openRequest = null, drafts }: NotesZoneProps) {
  const draftStore = useMemo(() => drafts ?? createSessionDraftStore(), [drafts])
  const [notes, setNotes] = useState<NoteSummaryView[]>([])
  const [path, setPath] = useState(space.notePath)
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [status, setStatus] = useState<NoteSaveStatus>('loading')
  const [message, setMessage] = useState('')
  const [conflict, setConflict] = useState(false)
  const [diskContent, setDiskContent] = useState<string | null>(null)
  const [diskMessage, setDiskMessage] = useState('')
  const [diskStatus, setDiskStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const [draftNotice, setDraftNotice] = useState(false)
  const [draftWarning, setDraftWarning] = useState('')
  // Page-level risk, not per topic: switching themes must keep warning that a
  // draft exists only in memory.
  const [pageRisk, setPageRisk] = useState(() => hasNonDurableDrafts())

  const alive = useRef(true)
  const contentRef = useRef('')
  const versionRef = useRef('')
  const pathRef = useRef(space.notePath)
  const spaceIdRef = useRef(space.id)
  const statusRef = useRef<NoteSaveStatus>('loading')
  const conflictRef = useRef(false)
  const saveQueue = useMemo(() => createSerialQueue(), [])
  // The most recently queued write, so a completed older save does not queue a
  // duplicate of content that is already waiting behind it.
  const queuedRef = useRef<{ spaceId: string; path: string; content: string } | null>(null)
  // Latest known on-disk version per file. A queued save must use the version
  // produced by the save ahead of it, not the version captured at enqueue time.
  const versions = useRef(new Map<string, string>())
  // Files whose unresolved conflict forbids non-explicit writes. Keyed by
  // space+path so leaving/re-entering or unmounting cannot bypass the guard.
  const conflictedKeys = useRef(new Set<string>())
  // Per-file read counter: re-reading a file invalidates older queued writes so
  // they cannot be blindly rebound to the newly read version.
  const readEpochs = useRef(new Map<string, number>())
  // Epoch of the last *successful* read. A request captured after a failed load
  // has no valid read identity even if an older version remains in `versions`.
  const readOkEpochs = useRef(new Map<string, number>())
  // Epoch of a successful *comparison* read. It permits an explicit overwrite
  // after reload failed, without pretending the editor has a normal read
  // identity (autosave/保存 stay blocked by the conflict guard).
  const compareOkEpochs = useRef(new Map<string, number>())
  // Incremented whenever a save succeeds; a load that started before that save
  // must not apply its now-stale snapshot.
  const ledgerSeq = useRef(new Map<string, number>())
  const generation = useRef(0)
  const loadToken = useRef(0)
  const handledOpen = useRef<number | null>(null)
  const debouncer = useMemo(() => createDebouncer(debounceMs), [debounceMs])
  // Lets a debounce callback call the latest enqueueSave without capturing a
  // stale closure from the render that scheduled it.
  const enqueueSaveRef = useRef<(request: SaveRequest) => Promise<void>>(() => Promise.resolve())

  const updateStatus = useCallback((next: NoteSaveStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const persistDraft = useCallback((
    spaceId: string,
    notePath: string,
    body: string,
    baseVersion: string,
    revision: number,
  ): DraftWriteResult | 'failed' => {
    if (notePath === '') return 'failed'
    let result: DraftWriteResult | 'failed'
    try {
      result = draftStore.write(spaceId, notePath, { content: body, baseVersion, revision, savedAt: new Date().toISOString() })
    } catch {
      // A store failure must not break editing, but it must be reported: the
      // text is only in the editor now and may be lost if the pane unmounts.
      result = 'failed'
    }
    if (result === 'memory' || result === 'failed') markDraftNonDurable(spaceId, notePath)
    if (result === 'session') clearDraftRisk(spaceId, notePath)
    if (alive.current) setPageRisk(hasNonDurableDrafts())
    return result
  }, [draftStore])

  const clearDraft = useCallback((spaceId: string, notePath: string) => {
    try {
      draftStore.remove(spaceId, notePath)
    } catch {
      // Ignore storage failures here too; the visible save state is the truth.
    }
    clearDraftRisk(spaceId, notePath)
    if (alive.current) setPageRisk(hasNonDurableDrafts())
  }, [draftStore])

  /** Clear only if no newer draft was parked after this revision. */
  const clearDraftIfOlder = useCallback((spaceId: string, notePath: string, revision: number) => {
    try {
      const existing = draftStore.read(spaceId, notePath)
      if (existing === null || existing.revision <= revision) clearDraft(spaceId, notePath)
    } catch {
      // Ignore; the next load reconciles a draft with the disk version.
    }
  }, [clearDraft, draftStore])

  const applyDocument = useCallback((document: NoteDocumentView, restoreDraft = true) => {
    const storeId = spaceIdRef.current
    const key = fileKey(storeId, document.path)
    versions.current.set(key, document.version)
    // The read attempt epoch was incremented by load/reload; this is the epoch
    // that a request must carry to prove it is based on a successful read.
    readOkEpochs.current.set(key, readEpochs.current.get(key) ?? 0)
    compareOkEpochs.current.delete(key)
    // Applying a freshly read document resolves any prior conflict for this
    // file; restoring an older draft adds it back below.
    conflictedKeys.current.delete(key)

    pathRef.current = document.path
    versionRef.current = document.version
    contentRef.current = document.content
    conflictRef.current = false
    setPath(document.path)
    setContent(document.content)
    setConflict(false)
    setDiskContent(null)
    setDiskStatus('idle')
    setDiskMessage('')
    setMessage('')
    setDraftNotice(false)
    setDraftWarning('')

    if (restoreDraft) {
      let draft: NoteDraft | null = null
      try {
        draft = draftStore.read(storeId, document.path)
      } catch {
        draft = null
      }
      // Raise the shared clock even if this draft turns out to equal disk and
      // is cleared: clearing must not let a later mount reuse a lower revision.
      if (draft !== null) observeDraftRevision(storeId, document.path, draft.revision)
      if (draft !== null && draft.content !== document.content) {
        contentRef.current = draft.content
        setContent(draft.content)
        if (draft.storage === 'memory') {
          markDraftNonDurable(storeId, document.path)
          setPageRisk(hasNonDurableDrafts())
        }
        if (draft.baseVersion !== document.version) {
          // The draft was authored against an older disk version. Binding it to
          // the current version would let the next save silently replace an
          // external edit, so this is an explicit conflict before any save.
          conflictRef.current = true
          conflictedKeys.current.add(key)
          // Keep the draft's own base version, not the current disk version:
          // edits made while comparing must stay an explicit conflict if the
          // learner leaves and comes back, instead of becoming a silent save.
          versionRef.current = draft.baseVersion
          setConflict(true)
          setDiskContent(document.content)
          setDiskStatus('ready')
          setMessage('磁盘上的笔记在草稿保存后已被外部修改；请比较后选择重新加载或用我的覆盖。')
          updateStatus('conflict')
          return
        }
        setDraftNotice(true)
        setMessage('已恢复上次未保存的草稿；它还没有写回磁盘。')
        updateStatus('dirty')
        return
      }
      if (draft !== null) clearDraft(storeId, document.path)
    } else {
      clearDraft(storeId, document.path)
    }
    updateStatus('saved')
  }, [clearDraft, draftStore, updateStatus])

  const load = useCallback(async (target?: string) => {
    const token = ++loadToken.current
    const mine = ++generation.current
    // Invalidate writes queued for the file we are about to read. This also
    // removes the read identity while the read is unresolved, so a request
    // captured during a failed load cannot borrow an older version from the map.
    const targetKey = fileKey(space.id, target ?? pathRef.current)
    readEpochs.current.set(targetKey, (readEpochs.current.get(targetKey) ?? 0) + 1)
    readOkEpochs.current.delete(targetKey)
    compareOkEpochs.current.delete(targetKey)
    // A path that is about to change must not keep the previous file's body or
    // version: if the read fails, saving must not write A's text into B.
    contentRef.current = ''
    versionRef.current = ''
    setContent('')
    setDiskContent(null)
    setDiskStatus('idle')
    setDiskMessage('')
    setDraftWarning('')
    updateStatus('loading')
    setMessage('')
    setDraftNotice(false)
    try {
      const list = await client.listNotes(space.id)
      if (!alive.current || token !== loadToken.current) return
      setNotes(list.notes)
      const wanted = target ?? pathRef.current
      const chosen = list.notes.find(note => note.path === wanted)?.path
        ?? list.notes.find(note => note.path === list.defaultPath)?.path
        ?? list.notes[0]?.path
      if (chosen === undefined) {
        updateStatus('failed')
        setMessage(`这个学习空间的「笔记/」目录里还没有 Markdown 文件。`)
        return
      }
      pathRef.current = chosen
      setPath(chosen)
      const chosenKey = fileKey(space.id, chosen)
      if (chosenKey !== targetKey) {
        readEpochs.current.set(chosenKey, (readEpochs.current.get(chosenKey) ?? 0) + 1)
        readOkEpochs.current.delete(chosenKey)
        compareOkEpochs.current.delete(chosenKey)
      }
      const readSeq = ledgerSeq.current.get(chosenKey) ?? 0
      const document = await client.readNote(space.id, chosen)
      if (!alive.current || token !== loadToken.current || generation.current !== mine) return
      if ((ledgerSeq.current.get(chosenKey) ?? 0) !== readSeq) {
        // A save for this file completed while the read was in flight; the
        // snapshot can be older than disk. Read again instead of showing stale
        // text that a later save could write back.
        void load(chosen)
        return
      }
      applyDocument(document)
    } catch (cause) {
      if (!alive.current || token !== loadToken.current) return
      updateStatus('failed')
      setMessage(messageOf(cause))
    }
  }, [applyDocument, client, space.id, updateStatus])

  const captureRequest = (saveMode: SaveMode): SaveRequest => {
    const spaceId = spaceIdRef.current
    const notePath = pathRef.current
    return {
      spaceId,
      path: notePath,
      content: contentRef.current,
      version: versionRef.current,
      generation: generation.current,
      readEpoch: readEpochs.current.get(fileKey(spaceId, notePath)) ?? 0,
      draftRevision: draftRevisionClock(spaceId, notePath),
      mode: saveMode,
    }
  }

  const isCurrent = (request: SaveRequest): boolean => alive.current
    && generation.current === request.generation
    && spaceIdRef.current === request.spaceId
    && pathRef.current === request.path

  /** True only when the request was captured from a successfully read version of this file. */
  const ownsRead = (request: SaveRequest): boolean => {
    const key = fileKey(request.spaceId, request.path)
    const epoch = readEpochs.current.get(key) ?? 0
    const ok = readOkEpochs.current.get(key) ?? 0
    return request.version !== '' && epoch !== 0 && epoch === request.readEpoch && ok === request.readEpoch
  }

  /** A successful comparison read permits only the explicit overwrite path. */
  const ownsCompare = (request: SaveRequest): boolean => {
    if (request.mode !== 'overwrite') return false
    const key = fileKey(request.spaceId, request.path)
    const epoch = readEpochs.current.get(key) ?? 0
    const ok = compareOkEpochs.current.get(key) ?? 0
    return epoch !== 0 && epoch === request.readEpoch && ok === request.readEpoch
  }

  const ownsWrite = (request: SaveRequest): boolean => ownsRead(request) || ownsCompare(request)

  const isAlreadyQueued = (request: SaveRequest): boolean => {
    const queued = queuedRef.current
    return queued !== null
      && queued.spaceId === request.spaceId
      && queued.path === request.path
      && queued.content === request.content
  }

  const scheduleAutosave = useCallback(() => {
    debouncer.schedule(() => {
      if (!alive.current || conflictRef.current) return
      void enqueueSaveRef.current(captureRequest('auto'))
    })
  }, [debouncer])

  const fetchDiskVersion = useCallback(async (spaceId: string, notePath: string, mine: number) => {
    if (!alive.current || generation.current !== mine || spaceIdRef.current !== spaceId || pathRef.current !== notePath) return
    const key = fileKey(spaceId, notePath)
    compareOkEpochs.current.delete(key)
    setDiskContent(null)
    setDiskStatus('loading')
    setDiskMessage('')
    try {
      const document = await client.readNote(spaceId, notePath)
      if (!alive.current || generation.current !== mine || spaceIdRef.current !== spaceId || pathRef.current !== notePath) return
      // A successful comparison establishes the explicit-overwrite identity and
      // the version to send, without granting normal save/autosave authority.
      versions.current.set(key, document.version)
      compareOkEpochs.current.set(key, readEpochs.current.get(key) ?? 0)
      setDiskContent(document.content)
      setDiskStatus('ready')
    } catch (cause) {
      if (!alive.current || generation.current !== mine || spaceIdRef.current !== spaceId || pathRef.current !== notePath) return
      setDiskContent(null)
      setDiskStatus('failed')
      setDiskMessage(`无法读取磁盘上的版本：${messageOf(cause)}`)
    }
  }, [client])

  const performSave = useCallback(async (request: SaveRequest) => {
    if (request.path === '') return
    const key = fileKey(request.spaceId, request.path)
    if (request.mode !== 'overwrite' && conflictedKeys.current.has(key)) {
      // While a conflict is unresolved the local text may only replace disk
      // through the explicit overwrite action, never through autosave/保存.
      // The guard is keyed by file, so unmounting or leaving cannot bypass it.
      return
    }
    const viewOwns = isCurrent(request)
    if (!ownsWrite(request)) {
      // This request has no successful read identity of its own. Never let a
      // stale version map revive it; a path that was read once and later failed
      // to load must not save its empty editor over the old file.
      if (viewOwns) {
        updateStatus('failed')
        setMessage('保存失败：还没有成功读取笔记文件，无法安全保存。请先重新加载。')
      }
      // Park typed text only when the read itself failed. If a newer read
      // succeeded, this queued request belongs to an explicitly replaced view;
      // resurrecting it as a draft would undo that reload.
      const newerReadSucceeded = (readOkEpochs.current.get(key) ?? 0) !== 0
      if (alive.current && request.content !== '' && !newerReadSucceeded) {
        const storage = persistDraft(request.spaceId, request.path, request.content, '', request.draftRevision)
        if (viewOwns && storage === 'failed') setDraftWarning(failedDraftWarning)
      }
      return
    }
    // Use the latest version this panel knows for the file at execution time,
    // but only because the request itself proved a successful read (or, for an
    // explicit overwrite, a successful comparison) above. A queued save picks
    // up the version produced by the save ahead of it.
    const expectedVersion = versions.current.get(key) ?? request.version
    if (expectedVersion === '') {
      if (viewOwns) {
        updateStatus('failed')
        setMessage('保存失败：还没有可用于这次保存的磁盘版本。请先重新加载。')
      }
      return
    }
    const snapshot = request.content
    if (viewOwns) {
      updateStatus('saving')
      setMessage('')
    }
    const command: NoteSaveCommand = {
      action: 'note-save',
      spaceId: request.spaceId,
      path: request.path,
      content: snapshot,
      version: expectedVersion,
      ...(request.mode === 'overwrite' ? { overwrite: true } : {}),
    }
    try {
      const result = await client.saveNote(command)
      // The ledger always learns the successful write, even when an old
      // generation no longer owns the view. Reads that started before this
      // point use ledgerSeq to detect and re-read their stale snapshot.
      versions.current.set(key, result.version)
      ledgerSeq.current.set(key, (ledgerSeq.current.get(key) ?? 0) + 1)
      const viewOwnedAfterWrite = isCurrent(request) && ownsWrite(request)
      if (request.mode === 'overwrite') {
        conflictedKeys.current.delete(key)
        compareOkEpochs.current.delete(key)
        if (viewOwnedAfterWrite) {
          // The explicit overwrite wrote a known version into the current view;
          // promote this epoch to a normal read identity so the next autosave or
          // explicit save does not get rejected as having no successful read.
          readOkEpochs.current.set(key, readEpochs.current.get(key) ?? 0)
        }
      }

      if (viewOwnedAfterWrite) {
        if (contentRef.current === snapshot) clearDraftIfOlder(request.spaceId, request.path, request.draftRevision)
        versionRef.current = result.version
        if (conflictRef.current) {
          conflictRef.current = false
          setConflict(false)
          setDiskContent(null)
          setDiskMessage('')
        }
        if (contentRef.current === snapshot) {
          setDraftNotice(false)
          setDraftWarning('')
          updateStatus('saved')
          setMessage('')
        } else {
          // Typing continued while the save was in flight. If that newer text
          // is already queued, wait for it; otherwise debounce one more save.
          updateStatus('dirty')
          const queued = queuedRef.current
          const alreadyQueued = queued !== null
            && queued.spaceId === request.spaceId
            && queued.path === request.path
            && queued.content === contentRef.current
          if (!alreadyQueued) scheduleAutosave()
        }
      } else {
        // The learner already moved on or the view was re-read. Keep a newer
        // draft, but this exact older snapshot is now on disk, so it is
        // obsolete; never clear a draft with a higher revision.
        try {
          const parked = draftStore.read(request.spaceId, request.path)
          if (parked !== null && parked.content === snapshot && parked.revision <= request.draftRevision) {
            clearDraft(request.spaceId, request.path)
          }
        } catch {
          // Ignore; the next load reconciles a draft with the disk version.
        }
      }
    } catch (cause) {
      // A late failure may only park a draft if this request still owns the
      // file's read lineage; revision CAS prevents it from replacing a newer
      // draft that was parked after switching away.
      // Unmount revokes write ownership: the cleanup already parked the latest
      // editor state, and a late failure from the dead mount must not touch it.
      const stillOwnsWrite = alive.current && ownsWrite(request)
      const storage = stillOwnsWrite && (snapshot !== '' || expectedVersion !== '')
        ? persistDraft(request.spaceId, request.path, snapshot, expectedVersion, request.draftRevision)
        : 'stale'
      if (!isCurrent(request) || !stillOwnsWrite) return
      if (storage === 'failed') setDraftWarning(failedDraftWarning)
      if (classroomErrorCode(cause) === 'note-conflict') {
        conflictedKeys.current.add(key)
        conflictRef.current = true
        setConflict(true)
        setDiskContent(null)
        setDiskStatus('loading')
        setDiskMessage('')
        updateStatus('conflict')
        setMessage(messageOf(cause))
        void fetchDiskVersion(request.spaceId, request.path, request.generation)
        return
      }
      updateStatus('failed')
      setMessage(`保存失败：${messageOf(cause)}`)
    }
  }, [clearDraft, clearDraftIfOlder, client, draftStore, fetchDiskVersion, persistDraft, scheduleAutosave, updateStatus, versions])

  const enqueueSave = useCallback((request: SaveRequest) => {
    queuedRef.current = { spaceId: request.spaceId, path: request.path, content: request.content }
    return saveQueue.run(() => performSave(request))
  }, [performSave, saveQueue])

  enqueueSaveRef.current = enqueueSave

  useEffect(() => {
    alive.current = true
    spaceIdRef.current = space.id
    pathRef.current = space.notePath
    contentRef.current = ''
    versionRef.current = ''
    conflictRef.current = false
    generation.current += 1
    setPath(space.notePath)
    setContent('')
    setNotes([])
    setConflict(false)
    setDiskContent(null)
    setDiskStatus('idle')
    setDiskMessage('')
    setDraftNotice(false)
    setDraftWarning('')
    // Risk is page-scoped and must survive topic switches; never clear it here.
    setPageRisk(hasNonDurableDrafts())
    setMode('edit')
    void load(space.notePath)
    return () => {
      // Save first, then leave a recoverable draft if the save has not
      // succeeded. The captured space/path keeps a queued save from being
      // redirected to the next topic.
      const leavingSpaceId = space.id
      const leavingPath = pathRef.current
      const leavingContent = contentRef.current
      const leavingVersion = versionRef.current
      const leavingStatus = statusRef.current
      const leavingConflict = conflictRef.current
      const leavingGeneration = generation.current
      if (leavingPath !== '' && (leavingContent !== '' || leavingVersion !== '')
        && ['dirty', 'saving', 'failed', 'conflict'].includes(leavingStatus)) {
        persistDraft(leavingSpaceId, leavingPath, leavingContent, leavingVersion,
          draftRevisionClock(leavingSpaceId, leavingPath))
      }
      debouncer.cancel()
      if ((leavingStatus === 'dirty' || leavingStatus === 'saving') && !leavingConflict) {
        // Do not lose the last keystrokes when the pane unmounts or the topic
        // changes; the save itself is guarded by version and by the captured key.
        const leavingRequest: SaveRequest = {
          spaceId: leavingSpaceId,
          path: leavingPath,
          content: leavingContent,
          version: leavingVersion,
          generation: leavingGeneration,
          readEpoch: readEpochs.current.get(fileKey(leavingSpaceId, leavingPath)) ?? 0,
          draftRevision: draftRevisionClock(leavingSpaceId, leavingPath),
          mode: 'auto',
        }
        if (!isAlreadyQueued(leavingRequest)) void enqueueSaveRef.current(leavingRequest)
      }
      alive.current = false
    }
  }, [client, debouncer, draftStore, load, persistDraft, space.id, space.notePath])

  useEffect(() => {
    if (typeof window === 'undefined') return
    // beforeunload is owned by the page-scoped draft risk manager, so it stays
    // active after this component unmounts while a memory-only draft exists.
    const pagehide = () => {
      // Supplementary to the per-edit synchronous park; pagehide is not the
      // only path and is not guaranteed on every browser kill.
      if (!alive.current) return
      if (pathRef.current === '') return
      if (!['dirty', 'saving', 'failed', 'conflict'].includes(statusRef.current)) return
      if (contentRef.current === '' && versionRef.current === '') return
      persistDraft(spaceIdRef.current, pathRef.current, contentRef.current, versionRef.current,
        draftRevisionClock(spaceIdRef.current, pathRef.current))
    }
    window.addEventListener('pagehide', pagehide)
    return () => {
      window.removeEventListener('pagehide', pagehide)
    }
  }, [persistDraft])

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value
    contentRef.current = next
    setContent(next)
    setMessage('')
    updateStatus('dirty')
    // Synchronously park every edit before any timer or HTTP work: a browser
    // reload within the debounce window does not run React cleanup. Every edit
    // also earns a newer revision, so an older failure cannot replace it.
    const revision = allocateDraftRevision(spaceIdRef.current, pathRef.current)
    const parked = persistDraft(spaceIdRef.current, pathRef.current, next, versionRef.current, revision)
    if (parked === 'failed') setDraftWarning(failedDraftWarning)
    if (conflictRef.current) return
    scheduleAutosave()
  }

  const reload = useCallback(async () => {
    const token = ++loadToken.current
    const mine = ++generation.current
    const key = fileKey(spaceIdRef.current, pathRef.current)
    readEpochs.current.set(key, (readEpochs.current.get(key) ?? 0) + 1)
    readOkEpochs.current.delete(key)
    compareOkEpochs.current.delete(key)
    const readSeq = ledgerSeq.current.get(key) ?? 0
    updateStatus('loading')
    setMessage('')
    setDraftNotice(false)
    setDiskStatus('idle')
    setDraftWarning('')
    try {
      const document = await client.readNote(spaceIdRef.current, pathRef.current)
      if (!alive.current || token !== loadToken.current || generation.current !== mine) return
      if ((ledgerSeq.current.get(key) ?? 0) !== readSeq) {
        // A save completed while reload was reading; discard the stale
        // snapshot and read the version it wrote.
        void reload()
        return
      }
      applyDocument(document, false)
    } catch (cause) {
      if (!alive.current || token !== loadToken.current) return
      // Keep the conflict UI and offer a comparison retry; the failed reload
      // must not look like a resolved conflict or leave overwrite enabled.
      setDiskContent(null)
      setDiskStatus('failed')
      setDiskMessage(`重新加载失败：${messageOf(cause)}`)
      updateStatus('conflict')
      setMessage(`重新加载失败：${messageOf(cause)}`)
    }
  }, [applyDocument, client, updateStatus])

  const switchTo = useCallback(async (next: string) => {
    if (next === pathRef.current) return
    const leaving = captureRequest('auto')
    let persistence: DraftWriteResult | 'failed' | null = null
    if (leaving.path !== '' && (leaving.content !== '' || leaving.version !== '')
      && ['dirty', 'saving', 'failed', 'conflict'].includes(statusRef.current)) {
      persistence = persistDraft(leaving.spaceId, leaving.path, leaving.content, leaving.version, leaving.draftRevision)
    }
    debouncer.cancel()
    if ((statusRef.current === 'dirty' || statusRef.current === 'saving') && !conflictRef.current && !isAlreadyQueued(leaving)) {
      void enqueueSave(leaving)
    }
    // Move the view immediately so an in-flight save of the previous file can
    // never be mistaken for a save of the new one.
    generation.current += 1
    pathRef.current = next
    setPath(next)
    setConflict(false)
    conflictRef.current = false
    setDiskContent(null)
    setDiskStatus('idle')
    setDiskMessage('')
    setDraftNotice(false)
    setMessage('')
    updateStatus('loading')
    await load(next)
    // Page-level risk is global and survives this switch; only a hard failure
    // needs the per-file warning line.
    if (persistence === 'failed') setDraftWarning(failedDraftWarning)
  }, [debouncer, enqueueSave, load, persistDraft, updateStatus])

  // A request from the canvas opens that specific note once; the token keeps
  // repeated opens of the same path observable without resetting manual edits.
  useEffect(() => {
    if (openRequest === null) return
    if (handledOpen.current === openRequest.token) return
    handledOpen.current = openRequest.token
    if (openRequest.path === pathRef.current) return
    void switchTo(openRequest.path)
  }, [openRequest, switchTo])

  const knownOption = notes.some(note => note.path === path)
  return (
    <div className="lc-notes-root">
      <style>{styles}</style>
      <div className="lc-notes-bar">
        <label>
          笔记文件
          <select
            aria-label="笔记文件"
            value={path}
            disabled={status === 'loading' || notes.length === 0}
            onChange={event => { void switchTo(event.target.value) }}
          >
            {!knownOption && path !== '' && <option value={path}>{path.replace(/^笔记\//, '')}</option>}
            {notes.map(note => <option key={note.path} value={note.path}>{note.name}</option>)}
          </select>
        </label>
        <button
          type="button"
          className="lc-secondary"
          disabled={status === 'loading' || status === 'saving' || status === 'conflict' || path === ''}
          onClick={() => { void enqueueSave(captureRequest('explicit')) }}
        >
          保存
        </button>
      </div>

      <p className="lc-note-file">{path || space.notePath}</p>

      {conflict && (
        <div className="lc-alert" role="alert">
          <p>{message || '磁盘上的笔记已被外部修改，保存已被拒绝。'}</p>
          <div className="lc-note-compare" aria-label="保存冲突比较">
            <section aria-label="我的编辑内容">
              <h3>我的编辑（未保存）</h3>
              <pre>{content}</pre>
            </section>
            <section aria-label="磁盘上的内容">
              <h3>磁盘上的版本</h3>
              {diskStatus === 'ready' && diskContent !== null && <pre>{diskContent}</pre>}
              {diskStatus === 'loading' && <p>正在读取磁盘上的版本…</p>}
              {diskStatus === 'failed' && (
                <>
                  <p>{diskMessage || '无法读取磁盘上的版本。'}</p>
                  <button
                    type="button"
                    className="lc-secondary"
                    onClick={() => { void fetchDiskVersion(spaceIdRef.current, pathRef.current, generation.current) }}
                  >
                    重试读取磁盘版本
                  </button>
                </>
              )}
            </section>
          </div>
          <div className="lc-note-actions">
            <button type="button" className="lc-secondary" onClick={() => { void reload() }}>重新加载</button>
            <button
              type="button"
              className="lc-secondary"
              disabled={diskStatus !== 'ready'}
              title={diskStatus === 'ready' ? undefined : '需要先读出磁盘上的版本并完成比较'}
              onClick={() => { void enqueueSave(captureRequest('overwrite')) }}
            >
              用我的覆盖
            </button>
          </div>
        </div>
      )}

      {!conflict && draftNotice && (
        <div className="lc-alert">
          <p>{message || '已恢复上次未保存的草稿；它还没有写回磁盘。'}</p>
          <div className="lc-note-actions">
            <button type="button" className="lc-secondary" onClick={() => { void enqueueSave(captureRequest('explicit')) }}>保存草稿</button>
            <button type="button" className="lc-secondary" onClick={() => { void reload() }}>放弃草稿</button>
          </div>
        </div>
      )}

      {!conflict && !draftNotice && message !== '' && (
        <div className="lc-alert" role="alert">
          <p>{message}</p>
          {status === 'failed' && (
            <button type="button" className="lc-secondary" onClick={() => { void enqueueSave(captureRequest('explicit')) }}>重试保存</button>
          )}
        </div>
      )}

      {pageRisk && (
        <div className="lc-alert" role="note">
          <p>{memoryDraftWarning}离开页面前会要求确认；请尽快保存到磁盘。</p>
        </div>
      )}

      {draftWarning !== '' && (
        <div className="lc-alert" role="note">
          <p>{draftWarning}</p>
        </div>
      )}

      <p className="lc-note-status" role="status" aria-live="polite" data-state={status}>{statusLabel[status]}</p>

      <div className="lc-note-tabs" role="tablist" aria-label="笔记视图">
        <button type="button" role="tab" className="lc-note-tab" aria-selected={mode === 'edit'} onClick={() => setMode('edit')}>编辑</button>
        <button type="button" role="tab" className="lc-note-tab" aria-selected={mode === 'preview'} onClick={() => setMode('preview')}>预览</button>
      </div>

      {mode === 'edit'
        ? (
          <textarea
            className="lc-note-editor"
            aria-label="笔记编辑器"
            spellCheck={false}
            value={content}
            disabled={status === 'loading'}
            onChange={onChange}
          />
        )
        : <NotePreview content={content} />}
    </div>
  )
}
