import { useEffect } from 'react'
import { BookOpen, Plus, Save, Check, Link, RefreshCw, Play } from 'lucide-react'
import { useBusinessState, useRequestOwner } from './view-state.tsx'
import { TAXONOMY } from './taxonomy.ts'
import type { LessonView } from './lesson-schema.ts'
import type { KaogongViewProps, PracticeContext } from './kaogong-view.tsx'

/** Only Host responses supply lesson state; browser draft fields never supply scores. */
export async function lessonRequest<T>(action: string, body: unknown): Promise<T> {
  const response = await fetch('/api/kaogong/lesson/' + action, { method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  let value: T & { error?: string }
  try { value = JSON.parse(await response.text()) }
  catch { throw new Error('课堂服务暂不可用；未创建替代课堂') }
  if (!response.ok) throw new Error(value.error ?? `课堂请求失败 (${response.status})`)
  return value
}

/** Shared default-instance lesson UI; practice starts through the existing request/draft owner. */
export function LessonPanel({ active, onPractice, onOpenTeacher }: { active: boolean; onPractice: (context: PracticeContext) => Promise<void>; onOpenTeacher: KaogongViewProps['onOpenTeacher'] }) {
  const owner = useRequestOwner()
  const [view, setView] = useBusinessState('lesson.view', null)
  const [list, setList] = useBusinessState('lesson.list', [])
  const [form, setForm] = useBusinessState('lesson.form', false)
  const [draft, setDraft] = useBusinessState('lesson.draft', { id: '', subject: TAXONOMY[0].subject, objective: '', knowledgePoint: '', reflections: true, material: false, legacyNoteId: '' })
  const [notes, setNotes] = useBusinessState('lesson.notes', '')
  const [, setNotesDirty] = useBusinessState('lesson.notesDirty', false)
  const [error, setError] = useBusinessState('lesson.error', '')
  const [busy, setBusy] = useBusinessState('lesson.busy', false)
  const [confirmed, setConfirmed] = useBusinessState('lesson.confirmed', false)
  const [material] = useBusinessState('reader.entry', null)
  const [practice] = useBusinessState('practice', null)
  const [result] = useBusinessState('result', null)
  const [roles] = useBusinessState('roles', null)
  const accept = (value: LessonView, resetNotes = false) => {
    setView(value)
    if (resetNotes || !owner.cell('lesson.notesDirty', false).value) { setNotes(value.lesson.notes); setNotesDirty(false) }
    setConfirmed(false)
  }
  const run = async (command: () => Promise<void>) => {
    const release = owner.beginPracticeCommand()
    if (!release) return
    owner.request('lesson'); setBusy(true); setError('')
    try { await command() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '课堂保存失败') }
    finally { release(); setBusy(false) }
  }
  useEffect(() => {
    if (!active) return
    const current = owner.request('lesson')
    void (async () => {
      try {
        const rows = await lessonRequest<typeof list>('list', {})
        if (!current()) return
        setList(rows)
        const id = owner.cell('lesson.view', null).value?.lesson.request.lessonId
        const value = id ? await lessonRequest<LessonView>('read', { lessonId: id }) : await lessonRequest<LessonView | null>('current', {})
        if (value) {
          if (current()) {
            setView(value)
            // An accepted record refresh must not overwrite an unsaved shared summary draft.
            if (!owner.cell('lesson.notesDirty', false).value) setNotes(value.lesson.notes)
          }
        }
      } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : '课堂读取失败') }
    })()
    return () => { if (current()) owner.request('lesson') }
  }, [active, owner])
  const context = view ? { subject: view.lesson.request.subject, title: view.lesson.request.objective, limit: 10,
    ...(view.lesson.request.knowledgePoint ? { knowledgePoint: view.lesson.request.knowledgePoint } : {}) } : null
  const create = () => run(async () => {
    const lessonId = draft.id || crypto.randomUUID()
    setDraft({ ...draft, id: lessonId })
    if (draft.material && !material) throw new Error('请先选择材料')
    const value = await lessonRequest<LessonView>('create', { lessonId, subject: draft.subject, objective: draft.objective,
      ...(draft.knowledgePoint.trim() ? { knowledgePoint: draft.knowledgePoint.trim() } : {}), requireReflections: draft.reflections,
      materialIds: draft.material && material ? [material.id] : [], ...(draft.legacyNoteId.trim() ? { legacyNoteId: draft.legacyNoteId.trim() } : {}) })
    accept(value, true); setForm(false); setDraft({ ...draft, id: '', objective: '', legacyNoteId: '' })
    setList(await lessonRequest<typeof list>('list', {}))
  })
  return <section aria-label="课堂与课后任务" style={{ borderTop: '1px solid #ddd', padding: '16px 0', marginBottom: 16, minWidth: 0, overflowWrap: 'anywhere', fontSize: 13 }}>
    <style>{`[aria-label="课堂与课后任务"] input:not([type=checkbox]),[aria-label="课堂与课后任务"] select{max-width:100%;box-sizing:border-box}[aria-label="课堂与课后任务"] form label{display:flex;flex-wrap:wrap;align-items:center;gap:6px}[aria-label="课堂与课后任务"] button{display:inline-flex;align-items:center;gap:4px;min-height:30px;max-width:100%;white-space:normal}`}</style>
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>课堂与课后任务</h2>
      <button title="新建课堂" aria-label="新建课堂" disabled={busy} onClick={() => setForm(!form)}><Plus size={16} /></button>
      <button title="刷新课堂" aria-label="刷新课堂" disabled={busy} onClick={() => void run(async () => { setList(await lessonRequest<typeof list>('list', {})); if (view) setView(await lessonRequest<LessonView>('read', { lessonId: view.lesson.request.lessonId })) })}><RefreshCw size={16} /></button>
      {list.length > 0 && <select aria-label="持久课堂" value={view?.lesson.request.lessonId ?? ''} disabled={busy} style={{ maxWidth: '100%' }} onChange={event => { if (event.target.value) void run(async () => accept(await lessonRequest<LessonView>('select', { lessonId: event.target.value }), true)) }}>
        <option value="">选择课堂</option>{list.map(row => <option key={row.id} value={row.id}>{row.completed ? '已完成' : '待继续'} · {row.objective}</option>)}
      </select>}
    </header>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {form && <form onSubmit={event => { event.preventDefault(); void create() }} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <label>科目 <select aria-label="课堂科目" value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })}>{TAXONOMY.map(row => <option key={row.subject}>{row.subject}</option>)}</select></label>
      <label>学习目标 <input required maxLength={500} aria-label="学习目标" value={draft.objective} onChange={event => setDraft({ ...draft, objective: event.target.value })} style={{ width: '100%', boxSizing: 'border-box' }} /></label>
      <label>限定考点 <input maxLength={500} aria-label="限定考点" value={draft.knowledgePoint} onChange={event => setDraft({ ...draft, knowledgePoint: event.target.value })} /></label>
      <label><input type="checkbox" checked={draft.reflections} onChange={event => setDraft({ ...draft, reflections: event.target.checked })} />课后任务要求保存全部错题错因</label>
      <label><input type="checkbox" checked={draft.material} onChange={event => setDraft({ ...draft, material: event.target.checked })} />关联当前材料{material ? `：${material.title}` : '（未选择）'}</label>
      <label>旧课堂笔记 ID <input maxLength={500} aria-label="旧课堂笔记 ID" value={draft.legacyNoteId} onChange={event => setDraft({ ...draft, legacyNoteId: event.target.value })} /></label>
      <button disabled={busy} type="submit" style={{ justifySelf: 'start' }}><Save size={14} />确认目标并保存课堂</button>
    </form>}
    {!view && !form && <p role="status">暂无选中的课堂</p>}
    {view && context && <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <strong>{view.lesson.request.objective}</strong>
      <span>{view.lesson.request.subject} · {view.lesson.completion ? '学习者已确认完成' : '课后任务未完成'}</span>
      <small>课堂 {view.lesson.request.lessonId} · 目标 {view.lesson.objectiveId}</small>
      {view.lesson.materials.map(row => <span key={row.id}>材料：{row.title} · {row.source} · {row.id}</span>)}
      {view.lesson.legacyNote && <span>旧笔记引用：{view.lesson.legacyNote.id}（不推断完成状态）</span>}
      <span>课后任务：提交一轮本科目真实作答{view.lesson.request.requireReflections ? '，保存全部错题错因' : ''}，再明确确认；不代表长期掌握。</span>
      {view.evidence.map(row => <div key={row.roundId}>{row.roundId} · {row.correct}/{row.total} 正确 · {row.answered ? '已作答' : '存在未作答'} · {row.reflectionsComplete ? '反思齐全' : '待补反思'}{row.projection === 'pending' ? ' · 错题本同步待恢复' : ''}</div>)}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button disabled={busy || !!view.lesson.completion} onClick={() => void onPractice(context).catch(cause => setError(String(cause)))}><Play size={14} />课后练习</button>
        <button disabled={busy || !result || result.roundId !== practice?.roundId || !!view.lesson.completion} onClick={() => void run(async () => accept(await lessonRequest<LessonView>('link', { lessonId: view.lesson.request.lessonId, roundId: practice!.roundId })))}><Link size={14} />关联当前已提交轮次</button>
        <button disabled={busy || !roles} onClick={() => void run(async () => {
          let value = await lessonRequest<LessonView>('prepare', { lessonId: view.lesson.request.lessonId })
          await roles!.ensure(value.lesson.roleKey)
          value = await lessonRequest<LessonView>('prepare', { lessonId: view.lesson.request.lessonId })
          if (!value.lesson.binding) throw new Error('角色关联尚未就绪')
          accept(value)
          await onOpenTeacher('/kaogong-teach 继续同一课堂；读取已保存的目标与证据，不自动宣布完成。', { kind: 'lesson', context,
            lessonEvidence: { id: value.lesson.request.lessonId, title: context.title, source: 'kaogong/default/lesson-summary', content: value.summary } })
        })}><BookOpen size={14} />继续原课堂</button>
      </div>
      {!roles && <span role="status">角色服务不可用；课堂任务和练习仍可保存。</span>}
      <label>学习者总结 / 未解决问题<textarea aria-label="学习者总结" maxLength={2000} value={notes} onChange={event => { setNotes(event.target.value); setNotesDirty(true) }} style={{ display: 'block', width: '100%', minHeight: 72, boxSizing: 'border-box' }} /></label>
      <button disabled={busy} style={{ justifySelf: 'start' }} onClick={() => void run(async () => {
        const value = await lessonRequest<LessonView>('summary', { lessonId: view.lesson.request.lessonId, notes })
        if (owner.cell('lesson.notes', '').value === notes) setNotesDirty(false)
        accept(value)
      })}><Save size={14} />保存总结</button>
      {!view.lesson.completion && <label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />我确认本课任务已完成</label>}
      <button disabled={busy || !confirmed || !view.canConfirm || !!view.lesson.completion} style={{ justifySelf: 'start' }} onClick={() => void run(async () => {
        accept(await lessonRequest<LessonView>('confirm', { lessonId: view.lesson.request.lessonId, confirmed: true }))
        setList(await lessonRequest<typeof list>('list', {}))
      })}><Check size={14} />确认完成课后任务</button>
      <details><summary>共享证据摘要</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>{view.summary}</pre></details>
    </div>}
  </section>
}
