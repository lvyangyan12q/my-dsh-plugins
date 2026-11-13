import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClassroomClient } from './classroom-client.ts'
import type { ClassroomLectureView, ClassroomSpaceView, ReadingPositionView, SummaryView } from './contract.ts'
import {
  allocateDraftRevision,
  clearDraftRisk,
  createSessionDraftStore,
  hasNonDurableDrafts,
  markDraftNonDurable,
  observeDraftRevision,
} from './note-drafts.ts'
import { createSummaryDraftStore, type SummaryDraftStore } from './summary-drafts.ts'
import { summaryFileName } from './summary.ts'

export interface ContinuityZoneProps {
  client: ClassroomClient
  space: ClassroomSpaceView
  /** True while the classroom is navigating; editing stays local and is never blocked. */
  busy?: boolean
  /** Current topic goal, shown next to the last reading position. */
  goal: string
  /** Course directory entries, used to name the stored last position. */
  lectures: readonly ClassroomLectureView[]
  /** Lecture currently open in the reader, if any. */
  currentPath: string | null
  /** Latest position known to the reader (may be newer than the saved space prop). */
  readingPosition?: ReadingPositionView
  /** Reopen the stored course file (or scroll to its saved offset). */
  onRestorePosition: (path: string) => void
  /** Recoverable draft store; defaults to the same session/memory store the notes use. */
  drafts?: SummaryDraftStore
}

/** Editing state for one learning space; text is also parked in the durable store. */
interface SummaryEdit {
  summary: string
  nextStep: string
  /** File version this text was authored against; null when no file existed. */
  baseVersion: string | null
  revision: number
  editing: boolean
}

const memoryDraftWarning = '浏览器存储不可用：未保存的小结草稿只在当前页面内存，关闭或刷新页面会丢失。请先保存或复制。'

const styles = `
.lc-continuity{display:flex;flex-direction:column;gap:6px;padding:8px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:var(--dsh-surface,#fff)}
.lc-continuity-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.lc-continuity-head h3{margin:0;font-size:13px}
.lc-continuity-head button,.lc-continuity-actions button{padding:3px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;font-size:12px;cursor:pointer}
.lc-continuity-head button:disabled,.lc-continuity-actions button:disabled{opacity:.5;cursor:default}
.lc-continuity p{margin:0;font-size:12px;line-height:1.6;overflow-wrap:anywhere}
.lc-continuity-hint{color:var(--dsh-text-secondary,#59636e)}
.lc-continuity-text{white-space:pre-wrap}
.lc-continuity-form{display:flex;flex-direction:column;gap:6px}
.lc-continuity-form label{display:flex;flex-direction:column;gap:4px;font-size:12px}
.lc-continuity-form textarea{box-sizing:border-box;display:block;width:100%;min-height:56px;max-height:180px;padding:6px 8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;font:inherit;line-height:1.5;resize:vertical}
.lc-continuity-actions{display:flex;flex-wrap:wrap;gap:6px}
.lc-continuity-error{color:#d1242f}
`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '学习接续操作失败。'
}

/**
 * Visible learning continuity: the topic goal, the last reading position and
 * the learner's explicitly saved summary/next step. The summary is an ordinary
 * Markdown knowledge file; saving it is always an explicit action, and the
 * component never infers mastery or schedules review.
 *
 * Drafts reuse the note editor's recoverable store: every edit is parked
 * synchronously under the current space, records the file version it was based
 * on, and is restored on a refresh/remount. A late response for the previous
 * theme can only touch that theme's entry.
 */
export function ContinuityZone(props: ContinuityZoneProps) {
  const { client, space, busy = false, goal, lectures, currentPath, onRestorePosition } = props
  const canRead = typeof client.readSummary === 'function'
  const canSave = typeof client.saveSummary === 'function'

  const draftStore = useMemo(
    () => props.drafts ?? createSummaryDraftStore(createSessionDraftStore()),
    [props.drafts],
  )

  const [summary, setSummary] = useState<SummaryView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [edits, setEdits] = useState<Record<string, SummaryEdit>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notices, setNotices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [pageRisk, setPageRisk] = useState(() => hasNonDurableDrafts())

  const alive = useRef(true)
  const spaceIdRef = useRef(space.id)
  spaceIdRef.current = space.id
  const generation = useRef(0)
  // Per-space operation epoch. Every learner action (edit, cancel, save,
  // reload) bumps it; a late reload/save response only applies when its epoch
  // is still current, so an old request can never reopen editing, clear a newer
  // draft, or overwrite text typed after it started.
  const ops = useRef<Record<string, number>>({})
  const bumpOp = (spaceId: string): number => {
    const next = (ops.current[spaceId] ?? 0) + 1
    ops.current[spaceId] = next
    return next
  }
  const opOf = (spaceId: string): number => ops.current[spaceId] ?? 0
  // Epoch of the last summary value applied by a save/reload. A load issued
  // before that write must not overwrite it with the older version it read.
  const summarySetOp = useRef<Record<string, number>>({})

  useEffect(() => {
    alive.current = true
    const mine = generation.current + 1
    generation.current = mine
    const controller = new AbortController()
    setSummary(null)
    setLoadError('')
    const loadOp = opOf(space.id)
    const current = () => alive.current && generation.current === mine && !controller.signal.aborted

    // Drafts survive a reload; restore the text and its baseline before the
    // disk read finishes so the learner can keep typing immediately.
    const stored = draftStore.read(space.id)
    if (stored !== null) {
      observeDraftRevision(space.id, summaryFileName, stored.revision)
      setEdits(prev => ({
        ...prev,
        [space.id]: {
          summary: stored.summary,
          nextStep: stored.nextStep,
          baseVersion: stored.baseVersion,
          revision: stored.revision,
          editing: true,
        },
      }))
      setPageRisk(hasNonDurableDrafts() || stored.storage === 'memory')
    } else {
      setEdits(prev => {
        const existing = prev[space.id]
        if (existing === undefined || !existing.editing) return prev
        return { ...prev, [space.id]: { ...existing, editing: false } }
      })
    }

    if (!canRead) return () => { alive.current = false }

    client.readSummary?.(space.id, controller.signal).then(next => {
      if (!current()) return
      // A save/reload that started after this load already applied a newer
      // version; the stale read must not roll the summary (and the next edit's
      // baseline) back to the version it happened to read.
      if ((summarySetOp.current[space.id] ?? 0) > loadOp) return
      setSummary(next)
      // A learner action after this load started owns the form; do not close an
      // editor they just opened or replace text they are writing.
      if (opOf(space.id) !== loadOp) return
      const draft = draftStore.read(space.id)
      if (draft !== null) {
        if (draft.baseVersion !== next.version) {
          setNotices(prev => ({
            ...prev,
            [space.id]: '磁盘上的小结已更新；你的草稿基于旧版本，保存会被拒绝。请先重新加载或核对后再决定。',
          }))
        } else {
          setNotices(prev => ({ ...prev, [space.id]: '已恢复上次未保存的小结草稿；它还没有写回磁盘。' }))
        }
        return
      }
      setEdits(prev => ({
        ...prev,
        [space.id]: {
          summary: next.summary,
          nextStep: next.nextStep,
          baseVersion: next.version,
          revision: prev[space.id]?.revision ?? 0,
          editing: false,
        },
      }))
    }).catch(cause => {
      if (current()) setLoadError(messageOf(cause))
    })

    return () => {
      alive.current = false
      controller.abort()
    }
  }, [canRead, client, draftStore, space.id, reloadKey])

  const edit = edits[space.id]
  const editing = edit?.editing ?? false
  const error = errors[space.id] ?? ''
  const notice = notices[space.id] ?? ''
  const isSaving = saving[space.id] === true
  // A new position saved by the reader is newer than the space prop until the
  // whole view is re-read; prefer the reader's copy for this theme only.
  const position = props.readingPosition ?? space.readingPosition ?? { path: null, scrollTop: 0 }
  const positionTitle = position.path === null
    ? ''
    : lectures.find(row => row.path === position.path)?.title ?? position.path

  const clearError = (spaceId: string): void => {
    setErrors(prev => {
      if (prev[spaceId] === undefined) return prev
      const copy = { ...prev }
      delete copy[spaceId]
      return copy
    })
  }

  const clearNotice = (spaceId: string): void => {
    setNotices(prev => {
      if (prev[spaceId] === undefined) return prev
      const copy = { ...prev }
      delete copy[spaceId]
      return copy
    })
  }

  /** Park the current text immediately; the browser refresh must not depend on React cleanup. */
  const park = (target: string, next: { summary: string; nextStep: string; baseVersion: string | null }): number => {
    const revision = allocateDraftRevision(target, summaryFileName)
    const result = draftStore.write(target, {
      summary: next.summary,
      nextStep: next.nextStep,
      baseVersion: next.baseVersion,
      revision,
      savedAt: new Date().toISOString(),
    })
    if (result === 'memory') {
      markDraftNonDurable(target, summaryFileName)
      setPageRisk(true)
    } else if (result === 'session') {
      clearDraftRisk(target, summaryFileName)
      setPageRisk(hasNonDurableDrafts())
    }
    return revision
  }

  const startEdit = (): void => {
    const target = space.id
    bumpOp(target)
    const revision = allocateDraftRevision(target, summaryFileName)
    const baseVersion = summary?.version ?? null
    setEdits(prev => ({
      ...prev,
      [target]: {
        summary: prev[target]?.summary ?? summary?.summary ?? '',
        nextStep: prev[target]?.nextStep ?? summary?.nextStep ?? '',
        baseVersion: prev[target]?.baseVersion ?? baseVersion,
        revision,
        editing: true,
      },
    }))
    clearError(target)
  }

  const cancelEdit = (): void => {
    const target = space.id
    bumpOp(target)
    draftStore.remove(target)
    clearDraftRisk(target, summaryFileName)
    setPageRisk(hasNonDurableDrafts())
    setEdits(prev => {
      if (prev[target] === undefined) return prev
      const copy = { ...prev }
      delete copy[target]
      return copy
    })
    clearError(target)
    clearNotice(target)
  }

  const change = (field: 'summary' | 'nextStep', value: string): void => {
    const target = space.id
    bumpOp(target)
    const current = edits[target] ?? {
      summary: summary?.summary ?? '',
      nextStep: summary?.nextStep ?? '',
      baseVersion: summary?.version ?? null,
      revision: 0,
      editing: true,
    }
    const nextText = { ...current, [field]: value, editing: true }
    const revision = park(target, {
      summary: nextText.summary,
      nextStep: nextText.nextStep,
      baseVersion: nextText.baseVersion,
    })
    setEdits(prev => ({ ...prev, [target]: { ...nextText, revision } }))
  }

  /**
   * Save explicitly through the versioned Host command, always using the draft's
   * own baseline version. A version re-read after the draft was written must not
   * become the overwrite guard: that would silently replace an external edit.
   */
  const save = async (): Promise<void> => {
    if (!canSave || edit === undefined || isSaving) return
    const target = space.id
    const submitted = edit
    const myOp = bumpOp(target)
    setSaving(prev => ({ ...prev, [target]: true }))
    clearError(target)
    try {
      const next = await client.saveSummary?.({
        action: 'summary-save',
        spaceId: target,
        summary: submitted.summary,
        nextStep: submitted.nextStep,
        version: submitted.baseVersion,
      })
      if (next === undefined || !alive.current) return
      summarySetOp.current[target] = myOp
      if (spaceIdRef.current === target) setSummary(next)
      // A newer edit/cancel/save owns the form now. Never delete its text or
      // draft merely because this older write reached the Host.
      if (opOf(target) !== myOp) return
      const stored = draftStore.read(target)
      if (stored === null || stored.revision <= submitted.revision) {
        draftStore.remove(target)
        clearDraftRisk(target, summaryFileName)
        setPageRisk(hasNonDurableDrafts())
      }
      setEdits(prev => {
        const copy = { ...prev }
        delete copy[target]
        return copy
      })
      clearNotice(target)
    } catch (cause) {
      if (alive.current) setErrors(prev => ({ ...prev, [target]: `保存小结失败：${messageOf(cause)}` }))
    } finally {
      if (alive.current) {
        setSaving(prev => {
          if (prev[target] === undefined) return prev
          const copy = { ...prev }
          delete copy[target]
          return copy
        })
      }
    }
  }

  /** Explicit choice after a conflict: drop the draft and read the disk copy. */
  const reload = async (): Promise<void> => {
    if (!canRead) return
    const target = space.id
    const mine = generation.current
    const myOp = bumpOp(target)
    const beforeRevision = draftStore.read(target)?.revision ?? null
    clearError(target)
    try {
      const next = await client.readSummary?.(target)
      if (next === undefined || !alive.current || generation.current !== mine) return
      if (spaceIdRef.current !== target) return
      // The learner typed, cancelled, saved or started another reload while this
      // read was in flight; its snapshot is no longer allowed to touch anything.
      if (opOf(target) !== myOp) return
      const afterRevision = draftStore.read(target)?.revision ?? null
      if (afterRevision !== beforeRevision) return
      draftStore.remove(target)
      clearDraftRisk(target, summaryFileName)
      setPageRisk(hasNonDurableDrafts())
      summarySetOp.current[target] = myOp
      setSummary(next)
      const revision = allocateDraftRevision(target, summaryFileName)
      setEdits(prev => ({
        ...prev,
        [target]: {
          summary: next.summary,
          nextStep: next.nextStep,
          baseVersion: next.version,
          revision,
          editing: true,
        },
      }))
      clearNotice(target)
    } catch (cause) {
      if (alive.current) setErrors(prev => ({ ...prev, [target]: `重新加载小结失败：${messageOf(cause)}` }))
    }
  }

  if (!canRead) return null

  return (
    <section className="lc-continuity" aria-label="学习接续">
      <style>{styles}</style>
      <div className="lc-continuity-head">
        <h3>学习接续</h3>
        {!editing && canSave && (
          <button type="button" className="lc-secondary" disabled={busy || summary === null || isSaving} onClick={startEdit}>
            编辑小结
          </button>
        )}
      </div>

      <p className="lc-continuity-hint">目标：{goal.trim() === '' ? '还没有填写学习目标。' : goal.trim()}</p>
      <p className="lc-continuity-hint">
        上次位置：
        {position.path === null
          ? '还没有阅读记录。'
          : `${positionTitle}（约 ${position.scrollTop} 像素）`}
      </p>
      {position.path !== null && (
        <div className="lc-continuity-actions">
          <button
            type="button"
            className="lc-secondary"
            disabled={busy}
            onClick={() => { if (position.path !== null) onRestorePosition(position.path) }}
          >
            {position.path === currentPath ? '回到上次阅读位置' : '打开上次阅读的讲义'}
          </button>
        </div>
      )}

      {loadError !== '' && <p className="lc-continuity-error" role="alert">无法读取学习小结：{loadError}</p>}
      {!editing && summary === null && loadError === '' && <p className="lc-continuity-hint" role="status">正在读取学习小结…</p>}
      {!editing && summary !== null && (
        <>
          {summary.fileMissing && (
            <p className="lc-continuity-hint">学习小结文件「{summary.path}」不见了；编辑并保存会重新创建它。</p>
          )}
          <p className="lc-continuity-hint">本次小结</p>
          <p className={summary.summary === '' ? 'lc-continuity-hint' : 'lc-continuity-text'}>
            {summary.summary === '' ? '还没有写本次小结。' : summary.summary}
          </p>
          <p className="lc-continuity-hint">下一步</p>
          <p className={summary.nextStep === '' ? 'lc-continuity-hint' : 'lc-continuity-text'}>
            {summary.nextStep === '' ? '还没有写下一步。' : summary.nextStep}
          </p>
        </>
      )}

      {summary !== null && (summary.extra ?? '') !== '' && (
        <>
          <p className="lc-continuity-hint">文件中的其他内容（保存时原样保留，可在 Obsidian 中编辑）：</p>
          <p className="lc-continuity-text">{summary.extra}</p>
        </>
      )}

      {editing && (
        <form className="lc-continuity-form" aria-label="编辑学习小结" onSubmit={event => { event.preventDefault(); void save() }}>
          <label>
            本次小结
            <textarea
              aria-label="本次小结"
              rows={3}
              value={edit?.summary ?? ''}
              disabled={isSaving}
              onChange={event => change('summary', event.target.value)}
            />
          </label>
          <label>
            下一步
            <textarea
              aria-label="下一步"
              rows={2}
              value={edit?.nextStep ?? ''}
              disabled={isSaving}
              onChange={event => change('nextStep', event.target.value)}
            />
          </label>
          <div className="lc-continuity-actions">
            <button type="submit" disabled={isSaving}>{isSaving ? '保存中…' : '保存小结'}</button>
            <button type="button" className="lc-secondary" disabled={isSaving} onClick={() => { void reload() }}>
              重新加载小结（放弃我的修改）
            </button>
            <button type="button" className="lc-secondary" disabled={isSaving} onClick={cancelEdit}>取消</button>
          </div>
          <p className="lc-continuity-hint">保存会写入知识文件「{summary?.path ?? summaryFileName}」；不会自动生成或判断掌握。</p>
        </form>
      )}

      {pageRisk && (
        <p className="lc-continuity-hint" role="note">{memoryDraftWarning}离开页面前会要求确认。</p>
      )}
      {error !== '' && <p className="lc-continuity-error" role="alert">{error}</p>}
      {notice !== '' && <p className="lc-continuity-hint" role="status">{notice}</p>}
    </section>
  )
}
