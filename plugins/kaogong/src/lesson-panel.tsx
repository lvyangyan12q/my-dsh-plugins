import {readLessonNotesDraft} from './learner-draft.ts'
import {LessonCloseout} from './lesson-closeout.tsx'
import {HandoutView} from './lesson-handout.tsx'
import {resolveLessonContent,LESSON_CONTENTS} from './lesson-content.ts'
import {QuizPanel,emptyQuizAnswers} from './lesson-quiz.tsx'
import type {QuizAnswer,QuizQuestion} from './lesson-quiz.tsx'
import {LessonTasks} from './lesson-tasks.tsx'
import { useEffect,useState } from 'react'
import { BookOpen, Plus, Save, Check, Link, RefreshCw, Play } from 'lucide-react'
import { useBusinessState, useRequestOwner } from './view-state.tsx'
import { TAXONOMY } from './taxonomy.ts'
import type { LessonView } from './lesson-schema.ts'
import type { StudyPlanState } from './study-plan.ts'
import type { KaogongViewProps, PracticeContext } from './kaogong-view.tsx'
import {useLearningHttp,useViewServices} from './view-context.tsx'
import {pickCurrentLearningTask,readRecentTaskIds,rememberRecentTask,taskStartRevision} from './task-classroom.ts'

/** Only Host responses supply lesson state; browser draft fields never supply scores. */
export async function lessonRequest<T>(action: string, body: unknown,send:(input:string,init?:RequestInit)=>Promise<Response>=fetch): Promise<T> {
  const response = await send('/api/kaogong/lesson/' + action, { method: 'POST', credentials: 'same-origin',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  let value: T & { error?: string }
  try { value = JSON.parse(await response.text()) }
  catch { throw new Error('课堂服务暂不可用；未创建替代课堂') }
  if (!response.ok) throw new Error(value.error ?? `课堂请求失败 (${response.status})`)
  return value
}

/** Restore saved in-class answers by stable question ID; a record without quiz stays all-unanswered. */
export function lessonQuizAnswers(value: LessonView | null, questions: readonly QuizQuestion[]): QuizAnswer[] {
  const rows = value?.lesson.quiz ?? []
  return questions.map(question => {
    const row = rows.find(item => item.questionId === question.id)
    return row ? row.choice : null
  })
}

/** Shared instance-owned lesson UI; practice starts through the existing request/draft owner. */
export function LessonPanel({ active, onPractice, onOpenTeacher, onClassroomTask, onReturnToday, onOpenPractice, taskCentered=false }: { onReturnToday?:()=>void; active: boolean; onPractice: (context: PracticeContext) => Promise<void>; onOpenTeacher: KaogongViewProps['onOpenTeacher']; onClassroomTask?: KaogongViewProps['onClassroomTask']; onOpenPractice?:()=>void; taskCentered?:boolean }) {
  const http=useLearningHttp()
  const requestLesson=lessonRequest
  const request=<T,>(action:string,body:unknown)=>requestLesson<T>(action,body,http.fetch)
  const owner = useRequestOwner()
  const [storedView, setView] = useBusinessState('lesson.view', null)
  const [list, setList] = useBusinessState('lesson.list', [])
  const [form, setForm] = useBusinessState('lesson.form', false)
  /** A task classroom only renders its own task; a historical view is not silently reused. */
  const taskView=!!storedView?.lesson.request.taskId
  const view=taskCentered&&!taskView?null:storedView
  /** Announce only this classroom's task identity; the parent never guesses a global Session. */
  useEffect(() => {
    if (!onClassroomTask) return
    const taskId = view?.lesson.request.taskId
    if (!taskId) { onClassroomTask(null); return }
    onClassroomTask({id: taskId, subject: view!.lesson.request.subject})
    return () => onClassroomTask(null)
  }, [view?.lesson.request.taskId, view?.lesson.request.subject, onClassroomTask])
  const showForm=form&&!taskCentered
  const [taskStatus,setTaskStatus]=useState<'idle'|'loading'|'empty'|'error'>('idle')
  const [taskError,setTaskError]=useState('')
  const [draft, setDraft] = useBusinessState('lesson.draft', { id: '', subject: TAXONOMY[0].subject, objective: '', knowledgePoint: '', reflections: true, material: false, legacyNoteId: '' })
  const [notes, setNotes] = useBusinessState('lesson.notes', '')
  const [, setNotesDirty] = useBusinessState('lesson.notesDirty', false)
  const [error, setError] = useBusinessState('lesson.error', '')
  const [busy, setBusy] = useBusinessState('lesson.busy', false)
  /** 旧课堂只作为次级历史入口只读查看；当前任务课堂永远是主内容。 */
  const [historyOpen,setHistoryOpen]=useState(false)
  const [historyLoaded,setHistoryLoaded]=useState(false)
  const [historyRows,setHistoryRows]=useState<typeof list>([])
  const [historyView,setHistoryView]=useState<LessonView|null>(null)
  const [historyError,setHistoryError]=useState('')
  const [historyBusy,setHistoryBusy]=useState(false)
  const [confirmed, setConfirmed] = useBusinessState('lesson.confirmed', false)
  const [tab, setTab] = useState<'handout' | 'quiz'>('handout')
  const [jump, setJump] = useState<{ anchorId: string; token: number } | null>(null)
  /** 「读」只由学习者明确确认；渲染、浏览和切页签都不标记已读完成。 */
  const [readDone, setReadDone] = useBusinessState('lesson.readDone', false)
  /** 作答按课堂归属：切课后立刻回到该课记录，不拿上一课的作答渲染。 */
  const [quizState, setQuizState] = useState<{ lessonId: string | null; answers: QuizAnswer[] }>({ lessonId: null, answers: [] })
  /** In-class evidence save errors stay visible without blocking the next answer. */
  const [quizError, setQuizError] = useState('')
  const [material] = useBusinessState('reader.entry', null)
  const [practice] = useBusinessState('practice', null)
  const [result] = useBusinessState('result', null)
  const [legacyRoles] = useBusinessState('roles', null)
  const services=useViewServices()
  const roles=services?services.roles:legacyRoles
  const lessonId = view?.lesson.request.lessonId
  /** 讲义与检测都来自内容注册表：命中哪一课就渲染哪一课，都不命中则只有空态。 */
  const content = resolveLessonContent(view?.lesson.request)
  const questions = content?.quiz ?? []
  const answers = lessonId && quizState.lessonId === lessonId ? quizState.answers : lessonQuizAnswers(view, questions)
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
  /** 历史课堂按需加载且只读；不主动切换当前任务课堂，也不发教学请求。 */
  const toggleHistory = async () => {
    if (historyOpen) { setHistoryOpen(false); return }
    setHistoryOpen(true)
    if (historyLoaded) return
    setHistoryBusy(true); setHistoryError('')
    try { setHistoryRows(await request<typeof list>('list', {})); setHistoryLoaded(true) }
    catch (cause) { setHistoryError(cause instanceof Error ? cause.message : '历史课堂读取失败') }
    finally { setHistoryBusy(false) }
  }
  const readHistory = async (historyId: string) => {
    setHistoryBusy(true); setHistoryError('')
    try { setHistoryView(await request<LessonView>('read', { lessonId: historyId })) }
    catch (cause) { setHistoryError(cause instanceof Error ? cause.message : '历史课堂读取失败') }
    finally { setHistoryBusy(false) }
  }
  useEffect(() => {
    if (!active || !taskCentered) return
    const live = owner.request('classroom')
    if (owner.cell('lesson.view', null).value?.lesson.request.taskId) { setTaskStatus('idle'); setTaskError(''); return }
    const current = owner.request('lesson')
    setTaskStatus('loading'); setTaskError('')
    void (async () => {
      try {
        const planResponse = await http.fetch('/api/kaogong/plan', { credentials: 'same-origin' })
        if (!planResponse.ok) throw new Error(`学习计划读取失败 (${planResponse.status})`)
        const plan = await planResponse.json() as StudyPlanState
        if (!current() || !live()) return
        if (!Array.isArray(plan?.tasks)) throw new Error('学习计划暂不可用，请稍后重试')
        const task = pickCurrentLearningTask(plan.tasks, readRecentTaskIds(owner.instanceId))
        if (!task) { if (current() && live()) setTaskStatus('empty'); return }
        const startResponse = await http.fetch('/api/kaogong/plan/start', { method: 'POST', credentials: 'same-origin',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: task.id, revision: taskStartRevision(task, plan.revision) }) })
        const value = await startResponse.json() as { error?: string; lesson?: LessonView }
        if (!startResponse.ok) throw new Error(value.error ?? '恢复学习任务失败')
        // Another task entered while this restore was in flight; keep the newer classroom.
        if (!current() || !live()) return
        const entered = owner.cell('lesson.view', null).value
        if (entered?.lesson.request.taskId && entered.lesson.request.taskId !== task.id) { setTaskStatus('idle'); return }
        if (value.lesson) {
          const id=value.lesson.lesson.request.lessonId
          const same=(entered?.lesson.request.lessonId??owner.cell('lesson.resumeId',null).value)===id
          const saved=readLessonNotesDraft(owner.instanceId,id)
          owner.resumeLesson(value.lesson,same?owner.cell('lesson.notes','').value:saved?.notes??value.lesson.lesson.notes,same?owner.cell('lesson.notesDirty',false).value:saved?.notesDirty??false)
          rememberRecentTask(owner.instanceId, task.id)
          setTaskStatus('idle')
        } else setTaskStatus('empty')
      } catch (cause) {
        if (current() && live()) { setTaskError(cause instanceof Error ? cause.message : '恢复学习任务失败'); setTaskStatus('error') }
      }
    })()
    return () => { owner.request('lesson') }
  }, [active, taskCentered, owner, http])
  useEffect(() => {
    if (!active) return
    if (taskCentered) return
    const current = owner.request('lesson')
    void (async () => {
      try {
        const rows = await request<typeof list>('list', {})
        if (!current()) return
        setList(rows)
        const id = owner.cell('lesson.view', null).value?.lesson.request.lessonId??owner.cell('lesson.resumeId',null).value
        const value = id ? await request<LessonView>('read', { lessonId: id }) : await request<LessonView | null>('current', {})
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
  }, [active, owner,http,taskCentered])
  const context = view ? { subject: view.lesson.request.subject, title: view.lesson.request.objective, limit: 10,
    ...(view.lesson.request.taskId?{taskId:view.lesson.request.taskId,planRevision:view.lesson.request.planRevision}:{}),
    ...(view.lesson.request.knowledgePoint ? { knowledgePoint: view.lesson.request.knowledgePoint } : {}) } : null
  const startPractice = () => {
    if (!context) return
    void onPractice(context).catch(cause => setError(String(cause)))
  }
  /** 「练」的证据：已关联到本课的已提交轮次，或当前页已有真实提交的练习轮次。 */
  const practiceDone = !!view && (view.evidence.length > 0 || (!!result && !!practice && result.roundId === practice.roundId))
  /** 回跳：先切到讲义页签，再由下面的 effect 滚动并高亮目标小节 1.6 秒。 */
  const jumpToSection = (anchorId: string) => {
    setTab('handout')
    setJump(current => ({ anchorId, token: (current?.token ?? 0) + 1 }))
  }
  /** 内容注册表没命中时只有空态，没有讲义也没有检测。 */
  const handoutMatched = content !== null
  const answerQuiz = (index: number, option: number) => {
    const question = questions[index]
    if (!question || !lessonId || answers[index] !== null) return
    setQuizState({ lessonId, answers: answers.map((value, at) => at === index ? option : value) })
    setQuizError('')
    // The local answer is already visible; a failed write is surfaced, never thrown back into the quiz.
    void request<LessonView>('quiz', { lessonId, entry: {
      questionId: question.id, index, choice: option, correct: option === question.answer,
      section: question.anchorId, answeredAt: new Date().toISOString() } })
      .catch(cause => setQuizError(`检测作答保存失败；继续答题不受影响：${cause instanceof Error ? cause.message : String(cause)}`))
  }
  const retakeQuiz = () => { setQuizState({ lessonId: lessonId ?? null, answers: emptyQuizAnswers(questions) }); setTab('quiz') }
  /** 针对当堂检测的错题补讲：仍走本任务的课堂答疑与任务会话，不另开一套对话。 */
  const explainQuizStep = (question: QuizQuestion, chosen: number) => {
    if (!view || !context) return
    const ordinal = questions.findIndex(item => item.id === question.id) + 1
    void run(async () => {
      await onOpenTeacher(
        `/kaogong-teach 请针对本任务的当堂检测补讲这一步：第 ${ordinal} 题“${question.prompt}”我选了“${question.options[chosen] ?? '未作答'}”；解析是“${question.why}”，对应讲义小节 ${question.anchorId}。先定位这一步错在哪，再带我重做同类题；不要自动宣布完成。`,
        { kind: 'lesson', context, quizIntent:{questionId:question.id,section:question.anchorId,choice:chosen}, lessonEvidence: { id: view.lesson.request.lessonId, title: context.title,
          source: 'kaogong/' + owner.instanceId + '/lesson-summary', content: view.summary } },
      )
    })
  }
  // 渲染、浏览、切页签都不标记已读；只有学习者明确确认读完才点亮「读」。
  useEffect(() => {
    setQuizError(''); setReadDone(false); setTab('handout'); setJump(null)
  }, [lessonId])
  useEffect(() => {
    if (!jump || tab !== 'handout') return
    const node = document.getElementById(jump.anchorId)
    if (!node) return
    node.setAttribute('data-section-highlight', 'true')
    if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start' })
    const timer = setTimeout(() => { node.removeAttribute('data-section-highlight') }, 1600)
    return () => {
      clearTimeout(timer)
      node.removeAttribute('data-section-highlight')
    }
  }, [jump, tab])
  const create = () => run(async () => {
    const lessonId = draft.id || crypto.randomUUID()
    setDraft({ ...draft, id: lessonId })
    if (draft.material && !material) throw new Error('请先选择材料')
    const value = await request<LessonView>('create', { lessonId, subject: draft.subject, objective: draft.objective,
      ...(draft.knowledgePoint.trim() ? { knowledgePoint: draft.knowledgePoint.trim() } : {}), requireReflections: draft.reflections,requirePractice:draft.practice===true,
      materialIds: draft.material && material ? [material.id] : [], ...(draft.legacyNoteId.trim() ? { legacyNoteId: draft.legacyNoteId.trim() } : {}) })
    accept(value, true); setForm(false); setDraft({ ...draft, id: '', objective: '', legacyNoteId: '' })
    setList(await request<typeof list>('list', {}))
  })
  return <section aria-label="课堂与课后任务" style={{ borderTop: '1px solid #ddd', padding: '16px 0', marginBottom: 16, minWidth: 0, overflowWrap: 'anywhere', fontSize: 13 }}>
    <style>{`[aria-label="课堂与课后任务"] input:not([type=checkbox]),[aria-label="课堂与课后任务"] select{max-width:100%;box-sizing:border-box}[aria-label="课堂与课后任务"] form label{display:flex;flex-wrap:wrap;align-items:center;gap:6px}[aria-label="课堂与课后任务"] button{display:inline-flex;align-items:center;gap:4px;min-height:30px;max-width:100%;white-space:normal}[data-section-highlight="true"]{outline:2px solid #b8892f;outline-offset:4px;border-radius:6px;background:#fffaf0}`}</style>
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <h2 style={{ margin: 0, fontSize: 16 }}>课堂与课后任务</h2>
      {taskCentered && <span className="kg-role-note" data-role="task-teacher" style={{ margin: 0 }}>老师负责本任务的讲课、答疑与讲评</span>}
      {!taskCentered && <button data-pwb-button data-variant="primary" title="新建课堂" aria-label="新建课堂" disabled={busy} onClick={() => setForm(!form)}><Plus size={16} />新建课堂</button>}
      <button data-pwb-button title="刷新课堂" aria-label="刷新课堂" disabled={busy} onClick={() => void run(async () => { setList(await request<typeof list>('list', {})); if (view) setView(await request<LessonView>('read', { lessonId: view.lesson.request.lessonId })) })}><RefreshCw size={16} />刷新课堂</button>
      {!taskCentered && list.length > 0 && <select aria-label="持久课堂" value={view?.lesson.request.lessonId ?? ''} disabled={busy} style={{ maxWidth: '100%' }} onChange={event => { if (event.target.value) void run(async () => accept(await request<LessonView>('select', { lessonId: event.target.value }), true)) }}>
        <option value="">选择课堂</option>{list.map(row => <option key={row.id} value={row.id}>{row.completed ? '已完成' : '待继续'} · {row.objective}</option>)}
      </select>}
    </header>
    {error && <p role="alert" style={{ color: '#b42318' }}>{error}</p>}
    {quizError && <p role="alert" style={{ color: '#b42318' }}>{quizError}</p>}
    {showForm && <form onSubmit={event => { event.preventDefault(); void create() }} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
      <label>科目 <select aria-label="课堂科目" value={draft.subject} onChange={event => setDraft({ ...draft, subject: event.target.value })}>{TAXONOMY.map(row => <option key={row.subject}>{row.subject}</option>)}</select></label>
      <label>学习目标 <input required maxLength={500} aria-label="学习目标" value={draft.objective} onChange={event => setDraft({ ...draft, objective: event.target.value })} style={{ width: '100%', boxSizing: 'border-box' }} /></label>
      <label>限定考点 <input maxLength={500} aria-label="限定考点" value={draft.knowledgePoint} onChange={event => setDraft({ ...draft, knowledgePoint: event.target.value })} /></label>
      <label><input type="checkbox" checked={draft.reflections} onChange={event => setDraft({ ...draft, reflections: event.target.checked })} />课后任务要求保存全部错题错因</label>
      <label><input type="checkbox" checked={draft.practice===true} onChange={event=>setDraft({...draft,practice:event.target.checked})}/>本课要求课后练习（未选则保存总结并确认即可）</label>
      <label><input type="checkbox" checked={draft.material} onChange={event => setDraft({ ...draft, material: event.target.checked })} />关联当前材料{material ? `：${material.title}` : '（未选择）'}</label>
      <label>旧课堂笔记 ID <input maxLength={500} aria-label="旧课堂笔记 ID" value={draft.legacyNoteId} onChange={event => setDraft({ ...draft, legacyNoteId: event.target.value })} /></label>
      <button data-pwb-button data-variant="primary" disabled={busy} type="submit" style={{ justifySelf: 'start' }}><Save size={14} />确认目标并保存课堂</button>
    </form>}
    {!view && !showForm && (taskCentered
      ? <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
        {taskStatus === 'error'
          ? <><p role="alert">{taskError}</p>{onReturnToday && <button data-pwb-button type="button" onClick={onReturnToday}>去今日学习</button>}</>
          : taskStatus === 'empty'
            ? <><p role="status">还没有学习任务。</p>{onReturnToday && <button data-pwb-button type="button" onClick={onReturnToday}>去今日学习</button>}</>
            : <p role="status">正在恢复学习任务…</p>}
      </div>
      : <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <p role="status">还没有选中的课堂。下面先读第 1 课；新建或选择课堂后，讲义与检测按本课目标匹配。</p>
      <div role="tablist" aria-label="课堂页签" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button data-pwb-button type="button" role="tab" aria-selected={tab === 'handout'} onClick={() => setTab('handout')}>讲义</button>
        <button data-pwb-button type="button" role="tab" aria-selected={tab === 'quiz'} onClick={() => setTab('quiz')}>当堂检测</button>
      </div>
      {tab === 'handout'
        ? <HandoutView handout={LESSON_CONTENTS[0].handout} />
        : <p role="status">检测要记到课堂记录上：先新建或选择一个课堂，再来做当堂检测。</p>}
    </div>)}
    {view && context && <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
      <div role="tablist" aria-label="课堂页签" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button data-pwb-button type="button" role="tab" aria-selected={tab === 'handout'} onClick={() => setTab('handout')}>讲义</button>
        <button data-pwb-button type="button" role="tab" aria-selected={tab === 'quiz'} onClick={() => setTab('quiz')}>当堂检测</button>
      </div>
      {tab === 'handout'
        ? <>{content ? <HandoutView handout={content.handout} /> : <p role="status">本课暂无讲义。</p>}
          {handoutMatched && <div data-read-gate style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '8px 10px', border: '1px solid ' + (readDone ? '#a9cdb5' : '#dbe2d8'), borderRadius: 8, background: readDone ? '#f2f8f4' : '#fff' }}>
            <span style={{ fontSize: 12.5, color: '#667085' }}>{readDone ? '你已确认读完本节，可以去当堂检测。' : '读完后由你确认：浏览或渲染不会自动标记已读。'}</span>
            <button data-pwb-button type="button" style={{ marginLeft: 'auto' }} onClick={() => { setReadDone(true); setTab('quiz') }}>{readDone ? '去做当堂检测' : '读完本节，开始检测'}</button>
          </div>}</>
        : <QuizPanel questions={questions} provenance={content?.quizProvenance} answers={answers} onAnswer={answerQuiz} onJump={jumpToSection} onPractice={startPractice} onExplain={explainQuizStep} />}
      <strong>{view.lesson.request.objective}</strong>
      <span>{view.lesson.request.subject} · {view.lesson.completion ? '学习者已确认完成' : '课后任务未完成'}</span>
      <small>课堂 {view.lesson.request.lessonId} · 目标 {view.lesson.objectiveId}</small>
      {view.lesson.materials.map(row => <span key={row.id}>材料：{row.title} · {row.source} · {row.id}</span>)}
      {view.lesson.legacyNote && <span>旧笔记引用：{view.lesson.legacyNote.id}（不推断完成状态）</span>}
      <span>课后任务：{view.lesson.request.requirePractice===false?'保存本次学习总结后明确确认':'保存学习总结、提交一轮本科目真实作答'+(view.lesson.request.requireReflections?'，保存全部错题错因':'')+'，再明确确认'}；不代表长期掌握。</span>
      {view.evidence.map(row => <div key={row.roundId}>{row.roundId} · {row.correct}/{row.total} 正确 · {row.answered ? '已作答' : '存在未作答'} · {row.reflectionsComplete ? '反思齐全' : '待补反思'}{row.projection === 'pending' ? ' · 错题本同步待恢复' : ''}</div>)}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button data-pwb-button disabled={busy || !!view.lesson.completion} onClick={startPractice}><Play size={14} />课后练习</button>
        <button data-pwb-button disabled={busy || !result || result.roundId !== practice?.roundId || !!view.lesson.completion} onClick={() => void run(async () => accept(await request<LessonView>('link', { lessonId: view.lesson.request.lessonId, roundId: practice!.roundId })))}><Link size={14} />关联当前已提交轮次</button>
        <button data-pwb-button disabled={busy || !roles} onClick={() => void run(async () => {
          const value = await request<LessonView>('prepare', { lessonId: view.lesson.request.lessonId })
          accept(value)
          await onOpenTeacher('/kaogong-teach 继续同一课堂；读取已保存的目标与证据，不自动宣布完成。', { kind: 'lesson', context,
            lessonEvidence: { id: value.lesson.request.lessonId, title: context.title, source: 'kaogong/'+owner.instanceId+'/lesson-summary', content: value.summary } }, {
              beforeSend: async () => { await request<LessonView>('prepare', { lessonId: value.lesson.request.lessonId }) },
              afterSend: async () => { accept(await request<LessonView>('prepare', { lessonId: value.lesson.request.lessonId })) },
            })
        })}><BookOpen size={14} />继续原课堂</button>
      </div>
      {!roles && <span role="status">角色服务不可用；课堂任务和练习仍可保存。</span>}
      {!view.lesson.completion && <LessonTasks questions={questions} answers={answers} readDone={readDone} practiceDone={practiceDone} onJump={jumpToSection} onPractice={startPractice} onExplain={explainQuizStep} onRetake={retakeQuiz}/>}
      <LessonCloseout onOpenTeacher={onOpenTeacher} onReturnToday={onReturnToday} view={view} notes={notes}
        onNotesChange={value => { setNotes(value); setNotesDirty(true) }} onPractice={startPractice} onOpenPractice={onOpenPractice}
        accept={value => { accept(value); setNotesDirty(false) }}/>
      <details><summary>共享证据摘要</summary><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12 }}>{view.summary}</pre></details>
    </div>}
    {taskCentered && <section className="kg-classroom-history" aria-label="历史课堂与会话">
      <button data-pwb-button type="button" aria-expanded={historyOpen} onClick={() => void toggleHistory()}>历史课堂与会话</button>
      {historyOpen && <>
        <p>日常课堂只显示当前任务；旧课堂记录保留为只读，不改写、不迁移。历史角色会话仍在原生会话列表中，本页不删除、不搬运历史消息。</p>
        {historyError && <p role="alert">{historyError}</p>}
        {historyBusy && <p role="status">正在读取历史记录…</p>}
        {historyLoaded && historyRows.filter(row => row.id !== lessonId).length === 0 && <p>没有更早的课堂记录。</p>}
        {historyRows.filter(row => row.id !== lessonId).map(row => <article key={row.id}>
          <strong>{row.completed ? '已完成' : '未完成'} · {row.subject}</strong>
          <p>{row.objective} · {row.updatedAt}</p>
          <button data-pwb-button type="button" disabled={historyBusy} onClick={() => void readHistory(row.id)}>查看记录</button>
        </article>)}
        {historyView && <article aria-label="历史课堂只读记录">
          <strong>{historyView.lesson.request.objective}</strong>
          <p>完成状态：{historyView.lesson.completion ? '学习者已确认完成' : '未完成'} · 记录版本 {historyView.lesson.revision}</p>
          <p>学习者总结：{historyView.lesson.notes || '尚未保存'}</p>
          <p>共享摘要：{historyView.summary || '无'}</p>
          <button data-pwb-button type="button" onClick={() => setHistoryView(null)}>收起记录</button>
        </article>}
      </>}
    </section>}
  </section>
}
