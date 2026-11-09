import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createDebouncer } from './autosave.ts'
import { classroomErrorCode, type ClassroomClient } from './classroom-client.ts'
import type { ClassroomSpaceView, NoteDocumentView, NoteSaveCommand, NoteSummaryView } from './contract.ts'

export type NoteSaveStatus = 'loading' | 'saved' | 'dirty' | 'saving' | 'failed' | 'conflict'

export interface NotesZoneProps {
  client: ClassroomClient
  space: ClassroomSpaceView
  /** Debounce for autosave; tests shorten it, the product uses the default. */
  debounceMs?: number
}

const defaultDebounceMs = 700

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
`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '笔记操作失败。'
}

/**
 * The learner's notes: a real Markdown file in the space's `笔记/` folder,
 * edited as text and saved through the Host file service. The version read from
 * disk travels with every save, so an external edit is refused, never silently
 * overwritten.
 */
export function NotesZone({ client, space, debounceMs = defaultDebounceMs }: NotesZoneProps) {
  const [notes, setNotes] = useState<NoteSummaryView[]>([])
  const [path, setPath] = useState(space.notePath)
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<NoteSaveStatus>('loading')
  const [message, setMessage] = useState('')
  const [conflict, setConflict] = useState(false)

  const alive = useRef(true)
  const contentRef = useRef('')
  const versionRef = useRef('')
  const pathRef = useRef(space.notePath)
  const statusRef = useRef<NoteSaveStatus>('loading')
  const conflictRef = useRef(false)
  const saveChain = useRef<Promise<void>>(Promise.resolve())
  const loadToken = useRef(0)
  const debouncer = useMemo(() => createDebouncer(debounceMs), [debounceMs])
  // Lets a debounce callback call the latest enqueueSave without capturing a
  // stale closure from the render that scheduled it.
  const enqueueSaveRef = useRef<(mode: 'auto' | 'explicit' | 'overwrite') => Promise<void>>(() => Promise.resolve())

  const updateStatus = useCallback((next: NoteSaveStatus) => {
    statusRef.current = next
    setStatus(next)
  }, [])

  const applyDocument = useCallback((document: NoteDocumentView) => {
    pathRef.current = document.path
    versionRef.current = document.version
    contentRef.current = document.content
    conflictRef.current = false
    setPath(document.path)
    setContent(document.content)
    setConflict(false)
    setMessage('')
    updateStatus('saved')
  }, [updateStatus])

  const load = useCallback(async (target?: string) => {
    const token = ++loadToken.current
    updateStatus('loading')
    setMessage('')
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
      const document = await client.readNote(space.id, chosen)
      if (!alive.current || token !== loadToken.current) return
      applyDocument(document)
    } catch (cause) {
      if (!alive.current || token !== loadToken.current) return
      updateStatus('failed')
      setMessage(messageOf(cause))
    }
  }, [applyDocument, client, space.id, updateStatus])

  const performSave = useCallback(async (mode: 'auto' | 'explicit' | 'overwrite') => {
    const target = pathRef.current
    if (target === '') return
    if (conflictRef.current && mode !== 'overwrite') return
    const expectedVersion = versionRef.current
    if (expectedVersion === '' && mode !== 'overwrite') {
      // Without a read version we cannot prove the write is safe; say so
      // instead of pretending the edit was saved.
      updateStatus('failed')
      setMessage('保存失败：还没有成功读取笔记文件，无法安全保存。请先重新加载。')
      return
    }
    const snapshot = contentRef.current
    updateStatus('saving')
    setMessage('')
    const command: NoteSaveCommand = {
      action: 'note-save',
      spaceId: space.id,
      path: target,
      content: snapshot,
      version: expectedVersion,
      ...(mode === 'overwrite' ? { overwrite: true } : {}),
    }
    try {
      const result = await client.saveNote(command)
      if (!alive.current || pathRef.current !== target) return
      versionRef.current = result.version
      if (conflictRef.current) {
        conflictRef.current = false
        setConflict(false)
      }
      if (contentRef.current === snapshot) {
        updateStatus('saved')
      } else {
        // Typing continued while the save was in flight; the debounce will
        // write the newer content next.
        updateStatus('dirty')
        debouncer.schedule(() => { void enqueueSaveRef.current('auto') })
      }
    } catch (cause) {
      if (!alive.current || pathRef.current !== target) return
      if (classroomErrorCode(cause) === 'note-conflict') {
        conflictRef.current = true
        setConflict(true)
        updateStatus('conflict')
        setMessage(messageOf(cause))
        return
      }
      updateStatus('failed')
      setMessage(`保存失败：${messageOf(cause)}`)
    }
  }, [client, debouncer, space.id, updateStatus])

  const enqueueSave = useCallback((mode: 'auto' | 'explicit' | 'overwrite') => {
    saveChain.current = saveChain.current.then(() => performSave(mode)).catch(() => undefined)
    return saveChain.current
  }, [performSave])

  enqueueSaveRef.current = enqueueSave

  useEffect(() => {
    alive.current = true
    pathRef.current = space.notePath
    contentRef.current = ''
    versionRef.current = ''
    conflictRef.current = false
    setPath(space.notePath)
    setContent('')
    setNotes([])
    setConflict(false)
    void load(space.notePath)
    return () => {
      alive.current = false
      // Do not lose the last keystrokes when the pane unmounts or the space
      // changes; the save itself is already guarded by version.
      debouncer.flush()
    }
  }, [debouncer, load, space.notePath])

  const onChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value
    contentRef.current = next
    setContent(next)
    setMessage('')
    updateStatus('dirty')
    if (conflictRef.current) return
    debouncer.schedule(() => { void enqueueSaveRef.current('auto') })
  }

  const reload = async () => {
    const token = ++loadToken.current
    updateStatus('loading')
    setMessage('')
    try {
      const document = await client.readNote(space.id, pathRef.current)
      if (!alive.current || token !== loadToken.current) return
      applyDocument(document)
    } catch (cause) {
      if (!alive.current || token !== loadToken.current) return
      updateStatus('conflict')
      setMessage(`重新加载失败：${messageOf(cause)}`)
    }
  }

  const switchTo = async (next: string) => {
    if (next === pathRef.current) return
    if (statusRef.current === 'dirty') await enqueueSave('auto')
    if (conflictRef.current) {
      setMessage('当前笔记存在未解决的保存冲突，请先选择重新加载或用我的覆盖。')
      return
    }
    if (statusRef.current === 'failed') {
      setMessage('当前笔记尚未保存成功，请先重试保存。')
      return
    }
    await load(next)
  }

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
          disabled={status === 'loading' || status === 'saving' || path === ''}
          onClick={() => { void enqueueSave('explicit') }}
        >
          保存
        </button>
      </div>

      <p className="lc-note-file">{path || space.notePath}</p>

      {conflict && (
        <div className="lc-alert" role="alert">
          <p>{message || '磁盘上的笔记已被外部修改，保存已被拒绝。'}</p>
          <div className="lc-note-actions">
            <button type="button" className="lc-secondary" onClick={() => { void reload() }}>重新加载</button>
            <button type="button" className="lc-secondary" onClick={() => { void enqueueSave('overwrite') }}>用我的覆盖</button>
          </div>
        </div>
      )}

      {!conflict && message !== '' && (
        <div className="lc-alert" role="alert">
          <p>{message}</p>
          {status === 'failed' && (
            <button type="button" className="lc-secondary" onClick={() => { void enqueueSave('explicit') }}>重试保存</button>
          )}
        </div>
      )}

      <p className="lc-note-status" role="status" aria-live="polite" data-state={status}>{statusLabel[status]}</p>

      <textarea
        className="lc-note-editor"
        aria-label="笔记编辑器"
        spellCheck={false}
        value={content}
        disabled={status === 'loading'}
        onChange={onChange}
      />
    </div>
  )
}
