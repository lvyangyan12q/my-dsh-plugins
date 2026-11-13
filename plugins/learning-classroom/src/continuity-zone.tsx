import { useEffect, useRef, useState } from 'react'
import type { ClassroomClient } from './classroom-client.ts'
import type { ClassroomLectureView, ClassroomSpaceView, SummaryView } from './contract.ts'

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
  /** Reopen the stored course file (or scroll to its saved offset). */
  onRestorePosition: (path: string) => void
}

/** Unsaved summary text, kept per learning space so a theme switch cannot lose it. */
interface SummaryDraft {
  summary: string
  nextStep: string
  editing: boolean
  /** Bumped on every local edit; a save only clears the draft it submitted. */
  revision: number
}

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
 * Drafts and errors are keyed by learning space so a late response for the
 * previous theme cannot write into the current one, and an unfinished edit
 * survives switching themes.
 */
export function ContinuityZone(props: ContinuityZoneProps) {
  const { client, space, busy = false, goal, lectures, currentPath, onRestorePosition } = props
  const canRead = typeof client.readSummary === 'function'
  const canSave = typeof client.saveSummary === 'function'

  const [summary, setSummary] = useState<SummaryView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [drafts, setDrafts] = useState<Record<string, SummaryDraft>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [notices, setNotices] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})

  const alive = useRef(true)
  const spaceIdRef = useRef(space.id)
  spaceIdRef.current = space.id
  const draftsRef = useRef(drafts)
  const generation = useRef(0)
  const revisionSeq = useRef(0)

  useEffect(() => { draftsRef.current = drafts }, [drafts])

  useEffect(() => {
    alive.current = true
    if (!canRead) return () => { alive.current = false }
    const mine = generation.current + 1
    generation.current = mine
    const controller = new AbortController()
    setSummary(null)
    setLoadError('')
    const current = () => alive.current && generation.current === mine && !controller.signal.aborted

    client.readSummary?.(space.id, controller.signal).then(next => {
      if (!current()) return
      setSummary(next)
      const draft = draftsRef.current[space.id]
      if (draft !== undefined && draft.editing) {
        // A reload never replaces text the learner is still writing.
        if (draft.summary !== next.summary || draft.nextStep !== next.nextStep) {
          setNotices(prev => ({ ...prev, [space.id]: '磁盘上的小结已更新；你的未保存草稿仍保留。' }))
        }
        return
      }
      const revision = revisionSeq.current + 1
      revisionSeq.current = revision
      setDrafts(prev => ({ ...prev, [space.id]: { summary: next.summary, nextStep: next.nextStep, editing: false, revision } }))
      setNotices(prev => {
        if (prev[space.id] === undefined) return prev
        const copy = { ...prev }
        delete copy[space.id]
        return copy
      })
    }).catch(cause => {
      if (current()) setLoadError(messageOf(cause))
    })

    return () => {
      alive.current = false
      controller.abort()
    }
  }, [canRead, client, space.id, reloadKey])

  const draft = drafts[space.id]
  const editing = draft?.editing ?? false
  const error = errors[space.id] ?? ''
  const notice = notices[space.id] ?? ''
  const isSaving = saving[space.id] === true
  // Injected/older views may omit the optional continuity fields; an unknown
  // position is simply "no reading record", never a crash.
  const position = space.readingPosition ?? { path: null, scrollTop: 0 }
  const positionTitle = position.path === null
    ? ''
    : lectures.find(row => row.path === position.path)?.title ?? position.path

  const nextRevision = (): number => {
    revisionSeq.current += 1
    return revisionSeq.current
  }

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

  const startEdit = (): void => {
    const revision = nextRevision()
    setDrafts(prev => ({
      ...prev,
      [space.id]: {
        summary: prev[space.id]?.summary ?? summary?.summary ?? '',
        nextStep: prev[space.id]?.nextStep ?? summary?.nextStep ?? '',
        editing: true,
        revision,
      },
    }))
    clearError(space.id)
  }

  const cancelEdit = (): void => {
    setDrafts(prev => {
      if (prev[space.id] === undefined) return prev
      const copy = { ...prev }
      delete copy[space.id]
      return copy
    })
    clearError(space.id)
    clearNotice(space.id)
  }

  const change = (field: 'summary' | 'nextStep', value: string): void => {
    const revision = nextRevision()
    setDrafts(prev => {
      const current = prev[space.id] ?? { summary: '', nextStep: '', editing: true, revision }
      return {
        ...prev,
        [space.id]: { ...current, [field]: value, editing: true, revision },
      }
    })
  }

  /**
   * Save explicitly through the versioned Host command. The request belongs to
   * the space that started it: a late success only updates that space's view,
   * and a late failure only lands in that space's error line.
   */
  const save = async (): Promise<void> => {
    if (!canSave || summary === null || isSaving) return
    const target = space.id
    const submitted = drafts[target]
    const text = {
      summary: submitted?.summary ?? summary.summary,
      nextStep: submitted?.nextStep ?? summary.nextStep,
    }
    const submittedRevision = submitted?.revision ?? null
    setSaving(prev => ({ ...prev, [target]: true }))
    clearError(target)
    try {
      const next = await client.saveSummary?.({
        action: 'summary-save',
        spaceId: target,
        summary: text.summary,
        nextStep: text.nextStep,
        version: summary.version,
      })
      if (next === undefined || !alive.current) return
      if (submittedRevision !== null) {
        setDrafts(prev => {
          const current = prev[target]
          // A newer local revision belongs to the learner; keep it.
          if (current === undefined || current.revision !== submittedRevision) return prev
          const copy = { ...prev }
          delete copy[target]
          return copy
        })
      }
      clearNotice(target)
      if (spaceIdRef.current === target) setSummary(next)
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
    if (!canRead || summary === null) return
    const target = space.id
    const mine = generation.current
    clearError(target)
    try {
      const next = await client.readSummary?.(target)
      if (next === undefined || !alive.current || generation.current !== mine) return
      if (spaceIdRef.current !== target) return
      setSummary(next)
      const revision = nextRevision()
      setDrafts(prev => ({ ...prev, [target]: { summary: next.summary, nextStep: next.nextStep, editing: true, revision } }))
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

      {editing && (
        <form className="lc-continuity-form" aria-label="编辑学习小结" onSubmit={event => { event.preventDefault(); void save() }}>
          <label>
            本次小结
            <textarea
              aria-label="本次小结"
              rows={3}
              value={draft?.summary ?? ''}
              disabled={isSaving}
              onChange={event => change('summary', event.target.value)}
            />
          </label>
          <label>
            下一步
            <textarea
              aria-label="下一步"
              rows={2}
              value={draft?.nextStep ?? ''}
              disabled={isSaving}
              onChange={event => change('nextStep', event.target.value)}
            />
          </label>
          <div className="lc-continuity-actions">
            <button type="submit" disabled={isSaving || summary === null}>{isSaving ? '保存中…' : '保存小结'}</button>
            <button type="button" className="lc-secondary" disabled={isSaving} onClick={() => { void reload() }}>
              重新加载小结（放弃我的修改）
            </button>
            <button type="button" className="lc-secondary" disabled={isSaving} onClick={cancelEdit}>取消</button>
          </div>
          <p className="lc-continuity-hint">保存会写入知识文件「{summary?.path ?? '学习小结.md'}」；不会自动生成或判断掌握。</p>
        </form>
      )}

      {error !== '' && <p className="lc-continuity-error" role="alert">{error}</p>}
      {notice !== '' && <p className="lc-continuity-hint" role="status">{notice}</p>}
    </section>
  )
}
