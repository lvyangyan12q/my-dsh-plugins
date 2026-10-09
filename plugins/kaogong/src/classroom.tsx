import { useEffect, useRef, useState } from 'react'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import { optionalWorkbenchClient } from './optional-workbench-client.ts'
const PreparedTaskEditor = optionalWorkbenchClient?.PreparedTaskEditor
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PreparedTask, RoleBindingKey } from '@deepseek-ai/dsh-personal-workbench/client'
import { KaogongView } from './kaogong-view.tsx'
import type { KaogongViewProps, KaogongTeachingRequest } from './kaogong-view.tsx'
import type { Entry } from './knowledge-reader.tsx'
import { useBusinessState, useRequestOwner } from './view-state.tsx'
import { TAXONOMY } from './taxonomy.ts'
import { GraduationCap, BookOpen, HeartHandshake, Maximize2, X } from 'lucide-react'
import { learningStyles } from './learning-styles.ts'

export const classroomTeacherKey: RoleBindingKey = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher' }
/** All business evidence stays visible and removable; the Host supplies only the trusted teaching driver. */
export function buildTeachingTask(request: KaogongTeachingRequest, material: Entry | null): PreparedTask {
  const document = request.kind === 'lesson' ? request.lessonEvidence ?? material : null
  return { key: request.kind === 'review' ? { appId: 'kaogong', instanceId: 'default', roleId: 'counselor' } : { ...classroomTeacherKey, ...(request.context.subject ? { subject: request.context.subject } : {}) },
    teaching: true, task: request.kind === 'review' ? '请作为辅导员，结合保留的证据讲评本轮作答；不重复提交成绩，不自动打卡。' : '请围绕保留的学习目标和材料带我学习；先诊断并等待回答，保留图表和来源，不代答、不提前泄露答案、不自动打卡。',
    source: { pageId: request.kind === 'review' ? 'practice' : 'classroom', moduleId: request.kind === 'review' ? 'practice.review' : 'lesson.teaching', label: request.kind === 'review' ? '已提交练习讲评' : '考公课堂讲解' },
    context: [{ id: 'teaching.target', label: '学习目标', source: 'kaogong/default', text: JSON.stringify(request.context) },
      ...(document ? [{ id: 'teaching.material', label: document.title + ' · ' + document.id, source: document.source, text: document.content }] : []),
      ...(request.kind === 'review' ? [{ id: 'teaching.result', label: '真实讲评结果', source: 'kaogong/default/committed-practice', text: JSON.stringify(request.result) }] : [])],
  }
}
const taskLabels: Record<string, string> = { taskPrepared: '待发送教学任务', taskTarget: '目标角色', taskSource: '上下文来源', taskText: '教学任务', taskRemove: '移除资料', taskSend: '发送教学任务', taskDiscard: '取消准备', taskUnavailable: '教学任务服务不可用', retry: '重试' }
const taskRoleLabel = (key: RoleBindingKey) => key.roleId === 'teacher' ? '任课老师' : key.roleId === 'class-advisor' ? '班主任' : '辅导员'
const taskTranslate = (key: string) => taskLabels[key] ?? key

/** Both surfaces share the existing owner. The native pane stays mounted across page changes. */
export function KaogongClassroom(props: Omit<KaogongViewProps, 'onOpenTeacher'> & Partial<PropsRenderFactories> & { onOpenTeacher?: KaogongViewProps['onOpenTeacher']; ctx?: ClientContext }) {
  const [studyOpen, setStudyOpen] = useBusinessState('study.open', false)
  const [studyPage, setStudyPage] = useBusinessState('study.page', 'classroom')
  const studyRoot = useRef<HTMLElement>(null)
  const studyLauncher = useRef<HTMLButtonElement>(null)
  const wasStudyOpen = useRef(studyOpen)
  useEffect(() => {
    if (studyOpen && (props.active ?? true)) studyRoot.current?.focus()
    else if (wasStudyOpen.current && (props.active ?? true)) studyLauncher.current?.focus()
    wasStudyOpen.current = studyOpen
  }, [studyOpen, props.active])
  const closeStudy = () => setStudyOpen(false)
  const [roles] = useBusinessState('roles', null)
  const [tasks] = useBusinessState('tasks', null)
  const [selected, setSelected] = useBusinessState('roles.selected', classroomTeacherKey)
  const [opened, setOpened] = useBusinessState('roles.opened', [classroomTeacherKey])
  const same = (a: RoleBindingKey, b: RoleBindingKey) => a.roleId === b.roleId && a.subject === b.subject
  const select = (key: RoleBindingKey) => { setSelected(key); setOpened(values => values.some(value => same(value, key)) ? values : [...values, key]) }
  const state = useRequestOwner()
  const root = useRef<HTMLDivElement>(null)
  const [leftWidth, setLeftWidth] = useState(() => {
    try { const saved = Number(localStorage.getItem('kaogong.split.left')); return saved >= 35 && saved <= 70 ? saved : 60 } catch { return 60 }
  })
  const resize = (value: number) => {
    const width = Math.max(35, Math.min(70, Math.round(value)))
    setLeftWidth(width)
    try { localStorage.setItem('kaogong.split.left', String(width)) } catch { /* Storage may be disabled. */ }
  }
  const teach: KaogongViewProps['onOpenTeacher'] = props.onOpenTeacher ?? (async (_prompt, request, options) => {
    if (!roles || !tasks) throw new Error('固定老师或任务准备服务不可用；练习和讲义仍可使用。')
    const task = buildTeachingTask(request, state.cell('reader.entry', null).value)
    tasks.prepare(task, options)
    select(task.key)
    setStudyPage(request.kind === 'review' ? 'errors' : 'classroom')
    setStudyOpen(true)
  })
  return <section ref={studyRoot} className="kg-study-shell" data-study={studyOpen} hidden={!(props.active ?? true)} role={studyOpen ? 'dialog' : 'region'} aria-label={studyOpen ? '独立学习窗口' : '考公学习内容'} tabIndex={-1} onKeyDown={event => { if (studyOpen && !event.defaultPrevented && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeStudy() } }}>
    <style>{learningStyles}</style>
    <header className="kg-study-toolbar">
      <div><strong>{studyOpen ? '学习窗口' : '考公学习'}</strong><span>{studyOpen ? '专注课堂、资料与老师对话' : '查看进度，进入独立窗口学习'}</span></div>
      {studyOpen ? <button data-pwb-button type="button" onClick={closeStudy} aria-label="关闭学习窗口"><X size={16} />返回统计面板</button> : <button data-pwb-button data-variant="primary" ref={studyLauncher} type="button" className="kg-study-launch" onClick={() => { if (['practice', 'materials', 'errors'].includes(props.pageId ?? '')) setStudyPage(props.pageId!); setStudyOpen(true) }}><Maximize2 size={16} />打开学习窗口</button>}
    </header>
    {studyOpen && <nav className="kg-study-pages" aria-label="学习窗口页面">{[{ id: 'classroom', label: '课堂' }, { id: 'materials', label: '讲义' }, { id: 'practice', label: '练习' }, { id: 'errors', label: '错题' }].map(page => <button data-pwb-button type="button" key={page.id} aria-pressed={studyPage === page.id} onClick={() => setStudyPage(page.id)}>{page.label}</button>)}</nav>}
    <div ref={root} className="kg-classroom" style={{ gridTemplateColumns: studyOpen ? `minmax(0, ${leftWidth}fr) 7px minmax(0, ${100 - leftWidth}fr)` : 'minmax(0, 1fr)', minWidth: 0, minHeight: 0, height: '100%', width: '100%', flex: 1 }}>
    <style>{`.kg-classroom{display:grid;letter-spacing:0}.kg-classroom>div,.kg-classroom>aside{min-width:0;min-height:0;overflow:auto}.kg-classroom>aside{border-left:1px solid #ddd}.kg-classroom h1{font-size:18px!important;overflow-wrap:anywhere}.kg-classroom header{flex-wrap:wrap}.kg-classroom button{max-width:100%;white-space:normal;overflow-wrap:anywhere}.kg-divider{cursor:col-resize;background:#eef0f3;touch-action:none}.kg-divider:hover,.kg-divider:focus-visible{background:#93b4f5;outline:none}`}</style>
    <div className="kg-study-content"><KaogongView {...props} focusedStudy={studyOpen} pageId={studyOpen ? studyPage : props.pageId} onSelectPage={studyOpen ? setStudyPage : props.onSelectPage} onOpenTeacher={teach} /></div>
    <div hidden={!studyOpen} style={{ display: studyOpen ? 'block' : 'none' }} role="separator" aria-label="调整学习内容与角色对话宽度" aria-orientation="vertical" aria-valuemin={35} aria-valuemax={70} aria-valuenow={leftWidth} tabIndex={0} className="kg-divider"
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = root.current?.getBoundingClientRect(); if (rect?.width) resize((event.clientX - rect.left) / rect.width * 100) }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize(leftWidth + (event.key === 'ArrowLeft' ? -2 : 2)) } }} />
    <aside hidden={!studyOpen} aria-label="角色对话" style={{ display: studyOpen ? 'flex' : 'none', flexDirection: 'column' }}>
      {roles && <nav aria-label="学习角色" style={{ display: 'flex', flexWrap: 'wrap', flexShrink: 0, gap: 4, padding: 6 }}>
        {([{ id: 'class-advisor', label: '班主任', Icon: GraduationCap }, { id: 'teacher', label: '任课老师', Icon: BookOpen }, { id: 'counselor', label: '辅导员', Icon: HeartHandshake }]).map(role => <button data-pwb-button key={role.id} title={role.label} aria-pressed={selected.roleId === role.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 30 }} onClick={() => select({ ...classroomTeacherKey, roleId: role.id, ...(role.id === 'teacher' && selected.subject ? { subject: selected.subject } : {}) })}><role.Icon size={15} />{role.label}</button>)}
        {selected.roleId === 'teacher' && <select aria-label="教师科目" value={selected.subject ?? ''} onChange={event => select({ ...classroomTeacherKey, ...(event.target.value ? { subject: event.target.value } : {}) })}><option value="">默认老师</option>{TAXONOMY.map(row => <option key={row.subject}>{row.subject}</option>)}</select>}
      </nav>}
      {!props.renderFactorySlot && props.ctx && tasks && PreparedTaskEditor && <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, maxHeight: '50%', overflow: 'hidden', padding: '8px' }}><PreparedTaskEditor ctx={props.ctx} bindingKey={selected} label={taskRoleLabel(selected)} t={taskTranslate} /></div>}
      {roles && props.renderFactorySlot ? opened.map(key => <div key={JSON.stringify(key)} hidden={!same(key, selected)} style={{ flex: 1, minHeight: 0, minWidth: 0, display: same(key, selected) ? 'flex' : 'none', flexDirection: 'column' }}>
        {props.ctx && tasks && PreparedTaskEditor && <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0, minHeight: 0, maxHeight: '50%', overflow: 'hidden', padding: '8px' }}><PreparedTaskEditor ctx={props.ctx} bindingKey={key} label={taskRoleLabel(key)} t={taskTranslate} /></div>}
        {props.renderFactorySlot!('personal-workbench.role-conversation', { bindingKey: key, label: key.subject ?? (key.roleId === 'teacher' ? '默认老师' : key.roleId === 'class-advisor' ? '班主任' : '辅导员'), active: studyOpen && (props.active ?? true) && same(key, selected) }, { fallback: <p role="alert">角色原生组件不可用。</p> })}
      </div>) : <p role="status">角色服务不可用；练习和讲义仍可使用。</p>}
    </aside>
  </div>
  </section>
}
