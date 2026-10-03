import { useRef, useState } from 'react'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import { PreparedTaskEditor } from '@deepseek-ai/dsh-personal-workbench/client'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PreparedTask, RoleBindingKey } from '@deepseek-ai/dsh-personal-workbench/client'
import { KaogongView } from './kaogong-view.tsx'
import type { KaogongViewProps, KaogongTeachingRequest } from './kaogong-view.tsx'
import type { Entry } from './knowledge-reader.tsx'
import { useBusinessState, useRequestOwner } from './view-state.tsx'
import { TAXONOMY } from './taxonomy.ts'
import { GraduationCap, BookOpen, HeartHandshake } from 'lucide-react'

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
const taskTranslate = (key: string) => taskLabels[key] ?? key

/** Both surfaces share the existing owner. The native pane stays mounted across page changes. */
export function KaogongClassroom(props: Omit<KaogongViewProps, 'onOpenTeacher'> & Partial<PropsRenderFactories> & { onOpenTeacher?: KaogongViewProps['onOpenTeacher']; ctx?: ClientContext }) {
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
  })
  return <div ref={root} className="kg-classroom" style={{ gridTemplateColumns: `minmax(0, ${leftWidth}fr) 7px minmax(0, ${100 - leftWidth}fr)`, minWidth: 0, minHeight: 0, height: '100%', width: '100%', flex: 1 }}>
    <style>{`.kg-classroom{display:grid;letter-spacing:0}.kg-classroom>div,.kg-classroom>aside{min-width:0;min-height:0;overflow:auto}.kg-classroom>aside{border-left:1px solid #ddd}.kg-classroom h1{font-size:18px!important;overflow-wrap:anywhere}.kg-classroom header{flex-wrap:wrap}.kg-classroom button{max-width:100%;white-space:normal;overflow-wrap:anywhere}.kg-divider{cursor:col-resize;background:#eef0f3;touch-action:none}.kg-divider:hover,.kg-divider:focus-visible{background:#93b4f5;outline:none}`}</style>
    <div><KaogongView {...props} onOpenTeacher={teach} /></div>
    <div role="separator" aria-label="调整学习内容与角色对话宽度" aria-orientation="vertical" aria-valuemin={35} aria-valuemax={70} aria-valuenow={leftWidth} tabIndex={0} className="kg-divider"
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const rect = root.current?.getBoundingClientRect(); if (rect?.width) resize((event.clientX - rect.left) / rect.width * 100) }}
      onPointerUp={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); resize(leftWidth + (event.key === 'ArrowLeft' ? -2 : 2)) } }} />
    <aside aria-label="角色对话" style={{ display: 'flex', flexDirection: 'column' }}>
      {roles && <nav aria-label="学习角色" style={{ display: 'flex', flexWrap: 'wrap', flexShrink: 0, gap: 4, padding: 6 }}>
        {([{ id: 'class-advisor', label: '班主任', Icon: GraduationCap }, { id: 'teacher', label: '任课老师', Icon: BookOpen }, { id: 'counselor', label: '辅导员', Icon: HeartHandshake }]).map(role => <button key={role.id} title={role.label} aria-pressed={selected.roleId === role.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 30 }} onClick={() => select({ ...classroomTeacherKey, roleId: role.id, ...(role.id === 'teacher' && selected.subject ? { subject: selected.subject } : {}) })}><role.Icon size={15} />{role.label}</button>)}
        {selected.roleId === 'teacher' && <select aria-label="教师科目" value={selected.subject ?? ''} onChange={event => select({ ...classroomTeacherKey, ...(event.target.value ? { subject: event.target.value } : {}) })}><option value="">默认老师</option>{TAXONOMY.map(row => <option key={row.subject}>{row.subject}</option>)}</select>}
      </nav>}
      {!props.renderFactorySlot && props.ctx && tasks && <PreparedTaskEditor ctx={props.ctx} bindingKey={selected} t={taskTranslate} />}
      {roles && props.renderFactorySlot ? opened.map(key => <div key={JSON.stringify(key)} hidden={!same(key, selected)} style={{ flex: 1, minHeight: 0, minWidth: 0, display: same(key, selected) ? 'flex' : 'none', flexDirection: 'column' }}>
        {props.ctx && tasks && <PreparedTaskEditor ctx={props.ctx} bindingKey={key} t={taskTranslate} />}
        {props.renderFactorySlot!('personal-workbench.role-conversation', { bindingKey: key, label: key.subject ?? (key.roleId === 'teacher' ? '默认老师' : key.roleId === 'class-advisor' ? '班主任' : '辅导员'), active: (props.active ?? true) && same(key, selected) }, { fallback: <p role="alert">角色原生组件不可用。</p> })}
      </div>) : <p role="status">角色服务不可用；练习和讲义仍可使用。</p>}
    </aside>
  </div>
}
