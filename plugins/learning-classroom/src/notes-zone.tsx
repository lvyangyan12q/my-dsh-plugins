import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createDebouncer, createSerialQueue } from './autosave.ts'
import { classroomErrorCode, type ClassroomClient } from './classroom-client.ts'
import type { ClassroomSpaceView, NoteDocumentView, NoteSaveCommand, NoteSummaryView } from './contract.ts'
import { createSessionDraftStore, type DraftStorage, type NoteDraftStore } from './note-drafts.ts'
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

  const persistDraft = useCallback((spaceId: string, notePath: string, body: string, baseVersion: string): DraftStorage | 'failed' => {
    if (notePath === '') return 'failed'
    try {
      return draftStore.write(spaceId, notePath, { content: body, baseVersion, savedAt: new Date().toISOString() })
    } catch {
      // A store failure must not break editing, but it must be reported: the
      // text is only in the editor now and may be lost if the pane unmounts.
      return 'failed'
    }
  }, [draftStore])

  const clearDraft = useCallback((spaceId: string, notePath: string) => {
    try {
      draftStore.remove(spaceId, notePath)
    } catch {
      // Ignore storage failures here too; the visible save state is the truth.
    }
  }, [draftStore])

  const applyDocument = useCallback((document: NoteDocumentView, restoreDraft = true) => {
    const storeId = spaceIdRef.current
    const key = fileKey(storeId, document.path)
    versions.current.set(key, document.version)
    readEpochs.current.set(key, (readEpochs.current.get(key) ?? 0) + 1)
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
      let draft: { content: string; baseVersion: string; storage?: DraftStorage } | null = null
      try {
        draft = draftStore.read(storeId, document.path)
      } catch {
        draft = null
      }
      if (draft !== null && draft.content !== document.content) {
        contentRef.current = draft.content
        setContent(draft.content)
        if (draft.storage === 'memory') setDraftWarning(memoryDraftWarning)
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
    // Invalidate writes queued for the file we are about to read. A queued
    // save must not run against a version captured before this read.
    const targetKey = fileKey(space.id, target ?? pathRef.current)
    readEpochs.current.set(targetKey, (readEpochs.current.get(targetKey) ?? 0) + 1)
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
      const document = await client.readNote(space.id, chosen)
      if (!alive.current || token !== loadToken.current || generation.current !== mine) return
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
      mode: saveMode,
    }
  }

  const isCurrent = (request: SaveRequest): boolean => alive.current
    && generation.current === request.generation
    && spaceIdRef.current === request.spaceId
    && pathRef.current === request.path

  const isSameFile = (request: SaveRequest): boolean => alive.current
    && spaceIdRef.current === request.spaceId
    && pathRef.current === request.path

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
    setDiskContent(null)
    setDiskStatus('loading')
    setDiskMessage('')
    try {
      const document = await client.readNote(spaceId, notePath)
      if (!alive.current || generation.current !== mine || spaceIdRef.current !== spaceId || pathRef.current !== notePath) return
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
    // A newer read of this file (reload, topic/file re-entry) invalidates a
    // write that was queued before it; applying it would bind old text to a new
    // version and overwrite content the learner just chose to load.
    if ((readEpochs.current.get(key) ?? 0) !== request.readEpoch) return
    // Use the latest version this panel knows for the file at execution time.
    // The save ahead in the queue may have advanced it since this request was
    // captured; using the stale captured version would conflict with our own
    // successful save.
    const expectedVersion = versions.current.get(key) ?? request.version
    if (expectedVersion === '' && request.mode !== 'overwrite') {
      // Without a read version we cannot prove the write is safe; say so
      // instead of pretending the edit was saved.
      // An empty editor with no read version has nothing to park; do not create
      // an empty draft that would later look like a conflict.
      const storage = request.content === '' && expectedVersion === ''
        ? null
        : persistDraft(request.spaceId, request.path, request.content, expectedVersion)
      if (isCurrent(request)) {
        if (storage === 'memory') setDraftWarning(memoryDraftWarning)
        if (storage === 'failed') setDraftWarning(failedDraftWarning)
        updateStatus('failed')
        setMessage('保存失败：还没有成功读取笔记文件，无法安全保存。请先重新加载。')
      }
      return
    }
    const snapshot = request.content
    if (isCurrent(request)) {
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
      versions.current.set(key, result.version)
      if (request.mode === 'overwrite') conflictedKeys.current.delete(key)
      if (isSameFile(request)) {
        if (contentRef.current === snapshot) clearDraft(request.spaceId, request.path)
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
        // The learner already moved on. Keep a newer draft, but this exact
        // snapshot is now on disk, so an identical parked draft is obsolete.
        try {
          const parked = draftStore.read(request.spaceId, request.path)
          if (parked === null || parked.content === snapshot) clearDraft(request.spaceId, request.path)
        } catch {
          // Ignore; the next load reconciles a draft with the disk version.
        }
      }
    } catch (cause) {
      const storage = persistDraft(request.spaceId, request.path, snapshot, expectedVersion)
      if (!isCurrent(request)) return
      if (storage === 'memory') setDraftWarning(memoryDraftWarning)
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
  }, [clearDraft, client, draftStore, fetchDiskVersion, persistDraft, scheduleAutosave, updateStatus])

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
        persistDraft(leavingSpaceId, leavingPath, leavingContent, leavingVersion)
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
          mode: 'auto',
        }
        if (!isAlreadyQueued(leavingRequest)) void enqueueSaveRef.current(leavingRequest)
      }
      alive.current = false
    }
  }, [client, debouncer, draftStore, load, persistDraft, space.id, space.notePath])

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value
    contentRef.current = next
    setContent(next)
    setMessage('')
    updateStatus('dirty')
    if (conflictRef.current) return
    scheduleAutosave()
  }

  const reload = useCallback(async () => {
    const token = ++loadToken.current
    const mine = ++generation.current
    const key = fileKey(spaceIdRef.current, pathRef.current)
    readEpochs.current.set(key, (readEpochs.current.get(key) ?? 0) + 1)
    updateStatus('loading')
    setMessage('')
    setDraftNotice(false)
    setDiskStatus('idle')
    setDraftWarning('')
    try {
      const document = await client.readNote(spaceIdRef.current, pathRef.current)
      if (!alive.current || token !== loadToken.current || generation.current !== mine) return
      applyDocument(document, false)
    } catch (cause) {
      if (!alive.current || token !== loadToken.current) return
      updateStatus('conflict')
      setMessage(`重新加载失败：${messageOf(cause)}`)
    }
  }, [applyDocument, client, updateStatus])

  const switchTo = useCallback(async (next: string) => {
    if (next === pathRef.current) return
    const leaving = captureRequest('auto')
    let persistence: DraftStorage | 'failed' | null = null
    if (leaving.path !== '' && (leaving.content !== '' || leaving.version !== '')
      && ['dirty', 'saving', 'failed', 'conflict'].includes(statusRef.current)) {
      persistence = persistDraft(leaving.spaceId, leaving.path, leaving.content, leaving.version)
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
    // Keep the non-durable warning visible in the new file too: the parked
    // draft is still only in memory until a successful save or storage recovery.
    if (persistence === 'memory') setDraftWarning(memoryDraftWarning)
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
