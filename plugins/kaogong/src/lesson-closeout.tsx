import {StudyPlanPanel} from './study-plan-panel.tsx'
import type {KaogongViewProps} from './kaogong-view.tsx'
import { useEffect, useRef, useState } from 'react'
import type { LessonView } from './lesson-schema.ts'
import type { CloseoutRecord } from './closeouts.ts'
import { useLearningHttp } from './view-context.tsx'
import { useBusinessState, useRequestOwner } from './view-state.tsx'

type Preview = LessonView & { operation: CloseoutRecord | null; candidates: {roundId:string;title:string;submittedAt:string;answered:number;unanswered:number;missingReflections:number}[] }
export function LessonCloseout({ view, notes, accept, onReturnToday, onOpenTeacher }: {view:LessonView;notes:string;accept(value:LessonView):void;onReturnToday?:()=>void;onOpenTeacher:KaogongViewProps['onOpenTeacher']}) {
  return <OwnedCloseout key={view.lesson.request.lessonId} view={view} notes={notes} accept={accept} onReturnToday={onReturnToday} onOpenTeacher={onOpenTeacher}/>
}
function OwnedCloseout({ view, notes, accept, onReturnToday, onOpenTeacher }: {view:LessonView;notes:string;accept(value:LessonView):void;onReturnToday?:()=>void;onOpenTeacher:KaogongViewProps['onOpenTeacher']}) {
  const http = useLearningHttp(), owner = useRequestOwner()
  const [, setPage] = useBusinessState('study.page', null)
  const [preview, setPreview] = useState<Preview|null>(null)
  const draftKey='kaogong/closeout-choice/'+JSON.stringify([owner.instanceId,view.lesson.request.lessonId])
  const readDraft=()=>{try{return JSON.parse(window.localStorage.getItem(draftKey)??'null')}catch{return null}}
  const [joinRecall, setJoinRecall] = useState(readDraft()?.joinRecall===true), [roundId, setRoundId] = useState<string>(typeof readDraft()?.roundId==='string'?readDraft().roundId:'')
  useEffect(()=>{try{window.localStorage.setItem(draftKey,JSON.stringify({joinRecall,roundId}))}catch{}},[draftKey,joinRecall,roundId])
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;owner.request('closeout')}},[owner,http])
  const id = view.lesson.request.lessonId
  const key = 'kaogong/closeout/'+JSON.stringify([owner.instanceId,id])
  const [operationId] = useState(() => {
    try { const old = window.localStorage.getItem(key); if (old) return old } catch {}
    const value = crypto.randomUUID(); try { window.localStorage.setItem(key,value) } catch {} return value
  })
  async function request(action:string, body:unknown) {
    const response = await http.fetch('/api/kaogong/lesson/'+action,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
    const value = await response.json(); if (!response.ok) throw Error(value.error??'收尾保存失败'); return value
  }
  useEffect(() => {
    let alive=true
    void request('closeout-preview',{lessonId:id}).then(value=>{if(alive)setPreview(value)}).catch(cause=>{if(alive)setError(String(cause))})
    return()=>{alive=false}
  },[id,http,view.lesson.revision])
  async function submit() {
    const current=owner.request('closeout'); setBusy(true); setError('')
    try {
      const input = preview?.operation?.input ?? {operationId,lessonId:id,notes,confirmed:true,joinRecall,...(roundId?{roundId}:{})}
      const value=await request('closeout',input)
      if(!alive.current||!current())return
      setPreview({...value,candidates:preview?.candidates??[]}); accept(value)
    } catch(cause) { if(alive.current&&current())setError(String(cause)) }
    finally {if(alive.current&&current())setBusy(false)}
  }
  const operation=preview?.operation
  const pending=operation?.status==='pending', done=operation?.status==='complete'
  return <section aria-label="学习收尾">
    <h3>确认本次学习</h3>
    {!operation&&<>
      {preview?.candidates.length===1&&<p>已找到本次练习：{preview.candidates[0].title} · {preview.candidates[0].submittedAt}</p>}
      {!!preview&&preview.candidates.length>1&&<label>选择完成依据<select value={roundId} onChange={event=>setRoundId(event.target.value)}><option value="">请选择本次练习</option>{preview.candidates.map(row=><option key={row.roundId} value={row.roundId}>{row.title} · {row.submittedAt} · 已答{row.answered}/未答{row.unanswered} · 缺反思{row.missingReflections}</option>)}</select></label>}
      {!notes.trim()&&<p>请先填写学习者总结。</p>}
      {view.lesson.request.requirePractice!==false&&!view.evidence.length&&!preview?.candidates.length&&<p>尚缺本课已提交练习，请先完成作答。</p>}
      {view.evidence.some(row=>!row.answered)&&<p>课堂练习仍有未作答题，请返回练习补齐。</p>}
      {view.lesson.request.requireReflections&&view.evidence.some(row=>!row.reflectionsComplete)&&<p>尚缺错因反思，请在练习结果中补充。</p>}
      {view.lesson.request.knowledgePointId&&<label><input type="checkbox" checked={joinRecall} onChange={event=>setJoinRecall(event.target.checked)}/>同时加入知识点回忆；首次提醒：{new Date(Date.now()+86400000).toLocaleDateString()}（不占正式计划容量）</label>}
      <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>我确认本次学习完成</label>
    </>}
    {operation&&<div role="status"><p>学习记录：{operation.lessonSaved?'已保存':'待完成'}；计划：{operation.planSaved?'已保存':'待恢复'}；复习：{!operation.input.joinRecall?'未选择':operation.recallSaved?'已入队':'待恢复'}</p>{operation.error&&<p>{operation.error}</p>}</div>}
    {!done&&<button disabled={busy||(!pending&&(!confirmed||!notes.trim()||!preview))} onClick={()=>void submit()}>{pending?'重试未完成步骤':'确认完成并保存选择'}</button>}
    {done&&<p>本次学习已保存。未选择的复习可稍后在复习中心加入。</p>}
    {done&&<StudyPlanPanel nextOnly onPage={page=>setPage(page)} onOpenTeacher={onOpenTeacher}/>}
    {error&&<p role="alert">{error}</p>}
    <button onClick={()=>{setPage('overview');onReturnToday?.()}}>返回今日，选择下一项</button>
  </section>
}
