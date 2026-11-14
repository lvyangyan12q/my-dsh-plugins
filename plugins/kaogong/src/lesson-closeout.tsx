import {StudyPlanPanel} from './study-plan-panel.tsx'
import type {KaogongViewProps} from './kaogong-view.tsx'
import { useEffect, useRef, useState } from 'react'
import type { LessonView } from './lesson-schema.ts'
import type { CloseoutRecord } from './closeouts.ts'
import { useLearningHttp } from './view-context.tsx'
import { useBusinessState, useRequestOwner } from './view-state.tsx'

type Preview = LessonView & { operation: CloseoutRecord | null; candidates: {roundId:string;title:string;submittedAt:string;answered:number;unanswered:number;missingReflections:number}[] }
/** One closeout for the whole lesson: the learner writes the summary and confirms in the same place. */
export function LessonCloseout({ view, notes, onNotesChange, accept, onReturnToday, onOpenTeacher, onOpenPractice, onPractice }: {view:LessonView;notes:string;onNotesChange(value:string):void;accept(value:LessonView):void;onReturnToday?:()=>void;onOpenTeacher:KaogongViewProps['onOpenTeacher'];onOpenPractice?:()=>void;onPractice?:()=>void}) {
  const owner=useRequestOwner()
  return <OwnedCloseout key={JSON.stringify([owner.instanceId,owner.viewId,view.lesson.request.lessonId])} view={view} notes={notes} onNotesChange={onNotesChange} accept={accept} onReturnToday={onReturnToday} onOpenTeacher={onOpenTeacher} onOpenPractice={onOpenPractice} onPractice={onPractice}/>
}
function OwnedCloseout({ view, notes, onNotesChange, accept, onReturnToday, onOpenTeacher, onOpenPractice, onPractice }: {view:LessonView;notes:string;onNotesChange(value:string):void;accept(value:LessonView):void;onReturnToday?:()=>void;onOpenTeacher:KaogongViewProps['onOpenTeacher'];onOpenPractice?:()=>void;onPractice?:()=>void}) {
  const http = useLearningHttp(), owner = useRequestOwner()
  const [, setPage] = useBusinessState('study.page', null)
  const [preview, setPreview] = useState<Preview|null>(null)
  const draftKey='kaogong/closeout-choice/'+JSON.stringify([owner.instanceId,view.lesson.request.lessonId])
  const readDraft=()=>{try{return JSON.parse(window.localStorage.getItem(draftKey)??'null')}catch{return null}}
  const [joinRecall, setJoinRecall] = useState(readDraft()?.joinRecall===true), [roundId, setRoundId] = useState<string>(typeof readDraft()?.roundId==='string'?readDraft().roundId:'')
  useEffect(()=>{try{window.localStorage.setItem(draftKey,JSON.stringify({joinRecall,roundId}))}catch{}},[draftKey,joinRecall,roundId])
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const notesRef = useRef<HTMLTextAreaElement>(null), roundRef = useRef<HTMLSelectElement>(null), missingRef = useRef<HTMLDivElement>(null)
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
  /** Every missing condition names what is missing and carries the gesture that fixes it. */
  const selectedCandidate = preview?.candidates.find(row => row.roundId === roundId) ?? (preview?.candidates.length === 1 ? preview.candidates[0] : undefined)
  const missing: {key:string;text:string;action:string;run:()=>void}[] = []
  if (!operation && preview) {
    if (!notes.trim()) missing.push({key:'notes',text:'学习者总结还没写。',action:'去写总结',run:()=>notesRef.current?.focus()})
    if (view.lesson.request.requirePractice!==false&&!view.evidence.length&&!preview.candidates.length) missing.push({key:'practice',text:'尚缺本课已提交的练习。',action:'去做本课练习',run:()=>{if(onPractice)onPractice();else onOpenPractice?.()}})
    if (view.evidence.some(row=>!row.answered)||(selectedCandidate?.unanswered??0)>0) missing.push({key:'answered',text:'课堂练习还有未作答的题。',action:'去练习页补齐',run:()=>onOpenPractice?.()})
    if (view.lesson.request.requireReflections&&(view.evidence.some(row=>!row.reflectionsComplete)||(selectedCandidate?.missingReflections??0)>0)) missing.push({key:'reflections',text:'错题还缺错因反思。',action:'去练习结果补错因',run:()=>onOpenPractice?.()})
    if (preview.candidates.length>1&&!roundId) missing.push({key:'round',text:'本轮有多份已完成练习，需要选定本次依据。',action:'去选择完成依据',run:()=>roundRef.current?.focus()})
    if (!confirmed) missing.push({key:'confirm',text:'还没有勾选「我确认本次学习完成」。',action:'勾选确认',run:()=>setConfirmed(true)})
  }
  /** The pending operation already holds the learner's confirmation; retry it unchanged. */
  const blocked = !pending && (!notes.trim() || !confirmed)
  const confirm = () => {
    if (blocked) { (notes.trim() ? missingRef.current : notesRef.current)?.focus(); return }
    void submit()
  }
  return <section aria-label="学习收尾">
    <h3>确认本次学习</h3>
    <p style={{ margin: '4px 0 8px', color: '#667085', fontSize: 12.5 }}>总结和完成确认都在这里：一次确认即保存；失败可用同一个操作重试，不重复提交。</p>
    {!operation&&<label>学习者总结 / 未解决问题<textarea ref={notesRef} aria-label="学习者总结" maxLength={2000} value={notes} onChange={event=>onNotesChange(event.target.value)} style={{ display: 'block', width: '100%', minHeight: 72, boxSizing: 'border-box' }} /></label>}
    {!operation&&!preview&&!error&&<p role="status">正在读取本课的完成依据…</p>}
    {!operation&&!!missing.length&&<div data-closeout-missing role="status" ref={missingRef} tabIndex={-1} style={{ border: '1px solid #d8b46a', borderRadius: 8, padding: 10, background: '#fffaf0', display: 'grid', gap: 6 }}>
      <strong style={{ color: '#8a5c12' }}>还差这些才能确认完成</strong>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{missing.map(row=><li key={row.key}>{row.text} <button data-pwb-button type="button" onClick={row.run}>{row.action}</button></li>)}</ul>
    </div>}
    {!operation&&<>
      {preview?.candidates.length===1&&<p>已找到本次练习：{preview.candidates[0].title} · {preview.candidates[0].submittedAt}</p>}
      {!!preview&&preview.candidates.length>1&&<label>选择完成依据<select ref={roundRef} value={roundId} onChange={event=>setRoundId(event.target.value)}><option value="">请选择本次练习</option>{preview.candidates.map(row=><option key={row.roundId} value={row.roundId}>{row.title} · {row.submittedAt} · 已答{row.answered}/未答{row.unanswered} · 缺反思{row.missingReflections}</option>)}</select></label>}
      {view.lesson.request.knowledgePointId&&<label><input type="checkbox" checked={joinRecall} onChange={event=>setJoinRecall(event.target.checked)}/>同时加入知识点回忆；首次提醒：{new Date(Date.now()+86400000).toLocaleDateString()}（不占正式计划容量）</label>}
      <label><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>我确认本次学习完成</label>
    </>}
    {operation&&<div role="status"><p>学习记录：{operation.lessonSaved?'已保存':'待完成'}；计划：{operation.planSaved?'已保存':'待恢复'}；复习：{!operation.input.joinRecall?'未选择':operation.recallSaved?'已入队':'待恢复'}</p>{pending&&<p>本次确认的总结：{operation.input.notes}</p>}{operation.error&&<p>{operation.error}</p>}</div>}
    {!done&&<button disabled={busy||(!pending&&!preview)} onClick={confirm}>{pending?'重试未完成步骤':'确认完成并保存选择'}</button>}
    {done&&<p>本次学习已保存。未选择的复习可稍后在复习中心加入。</p>}
    {done&&<StudyPlanPanel nextOnly onPage={page=>setPage(page)} onOpenTeacher={onOpenTeacher}/>}
    {error&&<p role="alert">{error}</p>}
    <button onClick={()=>{setPage('overview');onReturnToday?.()}}>返回今日，选择下一项</button>
  </section>
}
