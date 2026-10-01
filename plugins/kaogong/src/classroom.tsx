import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { TeachingEvidence, RoleBindingKey } from '@deepseek-ai/dsh-personal-workbench/client'
import { KaogongView } from './kaogong-view.tsx'
import type { KaogongViewProps, KaogongTeachingRequest } from './kaogong-view.tsx'
import type { Entry } from './knowledge-reader.tsx'
import { useBusinessState, useRequestOwner } from './view-state.tsx'
import { TAXONOMY } from './taxonomy.ts'
import { GraduationCap, BookOpen, HeartHandshake } from 'lucide-react'

export const classroomTeacherKey: RoleBindingKey = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher' }
/** Only explicit submitted review results contain answers; drafts never enter this evidence. */
export function buildTeachingEvidence(request: KaogongTeachingRequest, material: Entry | null): TeachingEvidence {
  return { kind: request.kind, context: { ...request.context },
    ...(request.kind === 'review' ? { material: { id: request.result.roundId, title: request.context.title, source: 'kaogong/default/committed-practice',
      content: JSON.stringify({ roundId: request.result.roundId, subject: request.context.subject, results: request.result.results.filter(row => !row.correct) }) } }
      : material ? { material: { id: material.id, title: material.title, source: material.source, content: material.content } } : {}),
    ...(request.kind === 'review' ? { result: { total: request.result.totalCount, correct: request.result.correctCount, accuracy: request.result.accuracyRate,
      results: request.result.results.map(row => ({ id: row.id, knowledgePoint: row.knowledgePoint, correct: row.correct, correctAnswer: row.correctAnswer, explanation: row.explanation })) } } : {}),
  }
}

/** Both surfaces share the existing owner. The native pane stays mounted across page changes. */
export function KaogongClassroom(props: Omit<KaogongViewProps, 'onOpenTeacher'> & Partial<PropsRenderFactories> & { onOpenTeacher?: KaogongViewProps['onOpenTeacher'] }) {
  const [roles] = useBusinessState('roles', null)
  const [selected, setSelected] = useBusinessState('roles.selected', classroomTeacherKey)
  const [opened, setOpened] = useBusinessState('roles.opened', [classroomTeacherKey])
  const same = (a: RoleBindingKey, b: RoleBindingKey) => a.roleId === b.roleId && a.subject === b.subject
  const select = (key: RoleBindingKey) => { setSelected(key); setOpened(values => values.some(value => same(value, key)) ? values : [...values, key]) }
  const state = useRequestOwner()
  const classroom = !props.pageId || props.pageId === 'classroom'
  const teach: KaogongViewProps['onOpenTeacher'] = props.onOpenTeacher ?? (async (_prompt, request) => {
    if (!roles) throw new Error('固定老师服务不可用；练习和讲义仍可使用。')
    props.onSelectPage?.('classroom')
    const key: RoleBindingKey = request.kind === 'review'
      ? { appId: 'kaogong', instanceId: 'default', roleId: 'counselor' }
      : { ...classroomTeacherKey, ...(request.context.subject ? { subject: request.context.subject } : {}) }
    select(key)
    await roles.teach(key, buildTeachingEvidence(request, state.cell('reader.entry', null).value))
  })
  return <div className="kg-classroom" data-single={!classroom} style={{ minWidth: 0, minHeight: 0, height: '100%' }}>
    <style>{`.kg-classroom{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));grid-auto-rows:minmax(320px,1fr);letter-spacing:0}.kg-classroom[data-single=true]{grid-template-columns:minmax(0,1fr);grid-auto-rows:minmax(0,1fr)}.kg-classroom>div,.kg-classroom>aside{min-width:0;min-height:0;overflow:auto}.kg-classroom>aside{border:1px solid #ddd}.kg-classroom h1{font-size:18px!important;overflow-wrap:anywhere}.kg-classroom header{flex-wrap:wrap}.kg-classroom button{max-width:100%;white-space:normal;overflow-wrap:anywhere}`}</style>
    <div><KaogongView {...props} onOpenTeacher={teach} /></div>
    <aside hidden={!classroom} aria-label="课堂角色会话" style={{ display: classroom ? 'flex' : 'none', flexDirection: 'column' }}>
      {roles && <nav aria-label="课堂角色" style={{ display: 'flex', flexWrap: 'wrap', flexShrink: 0, gap: 4, padding: 6 }}>
        {([{ id: 'class-advisor', label: '班主任', Icon: GraduationCap }, { id: 'teacher', label: '任课老师', Icon: BookOpen }, { id: 'counselor', label: '辅导员', Icon: HeartHandshake }]).map(role => <button key={role.id} title={role.label} aria-pressed={selected.roleId === role.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 30 }} onClick={() => select({ ...classroomTeacherKey, roleId: role.id, ...(role.id === 'teacher' && selected.subject ? { subject: selected.subject } : {}) })}><role.Icon size={15} />{role.label}</button>)}
        {selected.roleId === 'teacher' && <select aria-label="教师科目" value={selected.subject ?? ''} onChange={event => select({ ...classroomTeacherKey, ...(event.target.value ? { subject: event.target.value } : {}) })}><option value="">默认老师（旧课堂）</option>{TAXONOMY.map(row => <option key={row.subject}>{row.subject}</option>)}</select>}
      </nav>}
      {roles && props.renderFactorySlot ? opened.map(key => <div key={JSON.stringify(key)} hidden={!same(key, selected)} style={{ flex: 1, minHeight: 320, minWidth: 0 }}>
        {props.renderFactorySlot!('personal-workbench.role-conversation', { bindingKey: key, label: key.subject ?? (key.roleId === 'teacher' ? '默认老师（旧课堂）' : key.roleId === 'class-advisor' ? '班主任' : '辅导员'), active: (props.active ?? true) && classroom && same(key, selected) }, { fallback: <p role="alert">角色原生组件不可用。</p> })}
      </div>) : <p role="status">角色服务不可用；练习和讲义仍可使用。</p>}
    </aside>
  </div>
}
