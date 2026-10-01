import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { TeachingEvidence, RoleBindingKey } from '@deepseek-ai/dsh-personal-workbench/client'
import { KaogongView } from './kaogong-view.tsx'
import type { KaogongViewProps, KaogongTeachingRequest } from './kaogong-view.tsx'
import type { Entry } from './knowledge-reader.tsx'
import { useBusinessState, useRequestOwner } from './view-state.tsx'

export const classroomTeacherKey: RoleBindingKey = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher' }
/** Only explicit submitted review results contain answers; drafts never enter this evidence. */
export function buildTeachingEvidence(request: KaogongTeachingRequest, material: Entry | null): TeachingEvidence {
  return { kind: request.kind, context: { ...request.context },
    ...(material ? { material: { id: material.id, title: material.title, source: material.source, content: material.content } } : {}),
    ...(request.kind === 'review' ? { result: { total: request.result.totalCount, correct: request.result.correctCount, accuracy: request.result.accuracyRate,
      results: request.result.results.map(row => ({ id: row.id, knowledgePoint: row.knowledgePoint, correct: row.correct, correctAnswer: row.correctAnswer, explanation: row.explanation })) } } : {}),
  }
}

/** Both surfaces share the existing owner. The native pane stays mounted across page changes. */
export function KaogongClassroom(props: Omit<KaogongViewProps, 'onOpenTeacher'> & Partial<PropsRenderFactories> & { onOpenTeacher?: KaogongViewProps['onOpenTeacher'] }) {
  const [roles] = useBusinessState('roles', null)
  const state = useRequestOwner()
  const classroom = !props.pageId || props.pageId === 'classroom'
  const teach: KaogongViewProps['onOpenTeacher'] = props.onOpenTeacher ?? (async (_prompt, request) => {
    if (!roles) throw new Error('固定老师服务不可用；练习和讲义仍可使用。')
    props.onSelectPage?.('classroom')
    await roles.teach(classroomTeacherKey, buildTeachingEvidence(request, state.cell('reader.entry', null).value))
  })
  return <div className="kg-classroom" data-single={!classroom} style={{ minWidth: 0, minHeight: 0, height: '100%' }}>
    <style>{`.kg-classroom{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));grid-auto-rows:minmax(320px,1fr);letter-spacing:0}.kg-classroom[data-single=true]{grid-template-columns:minmax(0,1fr);grid-auto-rows:minmax(0,1fr)}.kg-classroom>div,.kg-classroom>aside{min-width:0;min-height:0;overflow:auto}.kg-classroom>aside{border:1px solid #ddd}.kg-classroom h1{font-size:18px!important;overflow-wrap:anywhere}.kg-classroom header{flex-wrap:wrap}.kg-classroom button{max-width:100%;white-space:normal;overflow-wrap:anywhere}`}</style>
    <div><KaogongView {...props} onOpenTeacher={teach} /></div>
    <aside hidden={!classroom} aria-label="课堂老师">
      {roles && props.renderFactorySlot ? props.renderFactorySlot('personal-workbench.role-conversation', { bindingKey: classroomTeacherKey, active: (props.active ?? true) && classroom }, { fallback: <p role="alert">固定老师原生组件不可用。</p> }) : <p role="status">固定老师服务不可用；练习和讲义仍可使用。</p>}
    </aside>
  </div>
}
