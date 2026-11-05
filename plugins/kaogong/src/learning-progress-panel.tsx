import {useContext,useEffect,useRef,useState} from 'react'
import {KaogongTransportContext,useLearningHttp} from './view-context.tsx'
import {PracticeStatisticsPanel} from './practice-statistics-panel.tsx'
import type {PracticeCounts} from './practice-statistics.ts'
import type {StudyPlanState} from './study-plan.ts'
import type {RecallRecord} from './recalls.ts'
import {canonicalKnowledgePoint} from './knowledge-point-identity.ts'
import {studyDate} from './study-date.ts'

type Point={id:string;subject:string;knowledgePoint:string;status:string}
type Wrong={id:string;subject:string;knowledgePoint:string;submittedAt:string;stem:string;errorReason:string;review:null|{dueAt:string;status:string;history:{id:string;confirmedAt?:string;correct:boolean;reflection:string}[]}}
type Data={dashboard:{practiceStatistics?:PracticeCounts & {errorReasons?:{reason:string;count:number}[]};weakPoints:{subject:string;knowledgePoint:string;wrongCount:number}[]};route:{coverage:{learned:number;total:number};points:Point[]};recalls:RecallRecord[];wrongs:Wrong[];plan:StudyPlanState}
type Props={onReview?:(target:{pointId?:string;occurrenceId?:string})=>void}
export function LearningProgressPanel(props:Props){
 const owner=useContext(KaogongTransportContext)
 return <OwnedProgress key={JSON.stringify([owner?.instanceId,owner?.viewId])} {...props}/>
}
function OwnedProgress({onReview}:Props){
 const http=useLearningHttp(),generation=useRef(0),alive=useRef(true)
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState<StudyPlanState['drafts'][number]|null>(null),[revision,setRevision]=useState(0)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++}},[])
 async function request(path:string,body?:unknown){
  const response=await http.fetch('/api/kaogong/'+path,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:undefined)
  const value=await response.json();if(!response.ok)throw Error(value.error??'读取学习进度失败');return value
 }
 useEffect(()=>{let current=true;setData(null);setError('');setPreview(null);setBusy(false);generation.current++
  void Promise.all(['dashboard','route','recall','errors','plan'].map(path=>request(path))).then(([dashboard,route,recalls,wrongs,plan])=>{if(current)setData({dashboard,route,recalls:recalls.items??[],wrongs:wrongs.occurrences??[],plan})}).catch(cause=>{if(current)setError(String(cause))})
  return()=>{current=false;generation.current++}
 },[http,revision])
 async function adjust(subject:string){
  if(!data||busy)return
  const token=++generation.current;setBusy(true);setError('');setPreview(null)
  try{const goal=data.plan.goal;if(!goal?.examDate)throw Error('考试日期未设置，可先在学习路线自主学习或设置目标。')
   const subjects=goal.subjects.some(row=>row.name===subject)?goal.subjects.map(row=>row.name===subject?{...row,weight:Math.min(100,row.weight+1)}:row):[...goal.subjects,{name:subject,weight:1}]
   const result=await request('plan',{action:'preview',baseRevision:data.plan.revision,operation:'adjust',goal:{...goal,subjects}})
   if(alive.current&&token===generation.current)setPreview(result)
  }catch(cause){if(alive.current&&token===generation.current)setError(String(cause))}finally{if(alive.current&&token===generation.current)setBusy(false)}
 }
 async function confirm(){
  if(!preview||busy)return;const token=++generation.current;setBusy(true);setError('')
  try{await request('plan',{action:'confirm',id:preview.id,revision:preview.baseRevision,confirmed:true});if(alive.current&&token===generation.current){setPreview(null);setRevision(v=>v+1)}}catch(cause){if(alive.current&&token===generation.current){setError(String(cause));setPreview(null)}}finally{if(alive.current&&token===generation.current)setBusy(false)}
 }
 if(!data)return <section aria-label="学习进度"><h1>学习进度</h1>{error?<p role="alert">{error}</p>:<p>正在读取真实学习记录…</p>}</section>
 const {route,recalls,wrongs,plan,dashboard}=data,now=new Date().toISOString()
 const dueRecall=recalls.filter(row=>row.dueAt<=now).length,dueWrong=wrongs.filter(row=>row.review&&row.review.status!=='consolidated'&&row.review.dueAt<=now).length
 const recallCount=recalls.reduce((sum,row)=>sum+row.history.length,0),wrongCount=wrongs.reduce((sum,row)=>sum+(row.review?.history.filter(h=>h.confirmedAt).length??0),0)
 return <section aria-label="学习进度" className="kg-progress"><h1>学习进度</h1><p>学习覆盖、客观作答与复习活动分别记录，不折算成掌握率。</p>
  <section aria-label="学习覆盖"><h2>学习覆盖</h2><p><strong>{route.coverage.learned} / {route.coverage.total}</strong> 个知识点已确认学习；包含缺资料知识点，重复学习只计一次。</p><p>复习未记住不会撤销已学。</p>{[...new Set(route.points.map(p=>p.subject))].map(subject=><p key={subject}>{subject}：{route.points.filter(p=>p.subject===subject&&p.status==='learned').length} / {route.points.filter(p=>p.subject===subject).length}</p>)}</section>
  <PracticeStatisticsPanel statistics={dashboard.practiceStatistics} detailed/>
  <section aria-label="复习活动统计"><h2>复习活动</h2><p>到期回忆 {dueRecall} 项 · 到期错题 {dueWrong} 项</p><p>累计已确认回忆 {recallCount} 次 · 已确认错题复习 {wrongCount} 次</p><p>累计确认与当前到期数量不构成完成率；自评不进入练习正确率。</p></section>
  <section><h2>反复出错知识点</h2>{!dashboard.weakPoints?.length&&<p>尚无已答错误记录。</p>}{dashboard.weakPoints?.map(row=>{const matches=wrongs.filter(w=>w.subject===row.subject&&w.knowledgePoint===row.knowledgePoint),point=route.points.find(p=>p.subject===row.subject&&p.knowledgePoint===canonicalKnowledgePoint(row.subject,row.knowledgePoint));return <article key={row.subject+row.knowledgePoint}><h3>{row.subject} · {row.knowledgePoint}</h3><p>历史已提交轮次中有 {row.wrongCount} 次已答错误，建议检查错因。</p><details><summary>查看真实错题记录</summary>{matches.length?matches.map(w=><div key={w.id}><p>{w.submittedAt} · {w.stem} · {w.errorReason||'尚未保存错因'}</p>{onReview&&<button onClick={()=>onReview({occurrenceId:w.id})}>查看或重做此错题</button>}</div>):<p>暂无可显示的错题发生项，统计仍来自已提交轮次。</p>}</details>{point&&recalls.some(row=>row.pointId===point.id)&&onReview&&<button onClick={()=>onReview({pointId:point.id})}>查看知识点回忆</button>}<button disabled={busy} onClick={()=>void adjust(row.subject)}>预览本科目未来安排</button><p>仅增加本科目调度权重；不承诺指定知识点自动加练。已完成、进行中及今日以前任务受保护。</p></article>})}</section>
  {preview&&<section aria-label="未来调整预览"><h2>未来调整预览</h2>{preview.diff.map(change=><p key={change.id}>{change.after?.title??change.before?.title}：{change.before?.date??'待安排'} → {change.after?.date??'容量不足，待安排'}</p>)}<p>未排入 {preview.overflow.length} 项</p><button disabled={busy} onClick={()=>void confirm()}>确认未来调整</button><button disabled={busy} onClick={()=>{generation.current++;setPreview(null)}}>取消预览</button></section>}
  {error&&<p role="alert">{error}</p>}
  <section><h2>学习与复习记录</h2>{recalls.map(row=><details key={row.pointId}><summary>{route.points.find(p=>p.id===row.pointId)?.knowledgePoint??'知识点'} · 回忆历史</summary>{row.history.map(h=><p key={h.cycleId}>{h.confirmedAt} · 自评：{{forgotten:'未记住',fuzzy:'模糊',remembered:'记住'}[h.rating]} · {h.recall}</p>)}</details>)}{wrongs.flatMap(row=>(row.review?.history??[]).filter(h=>h.confirmedAt).map(h=><p key={row.id+h.id}>{h.confirmedAt} · {row.knowledgePoint} · 错题复习{h.correct?'答对':'待订正'} · {h.reflection}</p>))}{plan.tasks.filter(t=>t.status==='completed').map(task=><p key={task.id}>已确认完成 · {task.title} · 原计划日期 {task.date??'自主学习'}</p>)}</section>
  <section><h2>未来 7 天安排</h2>{plan.tasks.filter(t=>t.date&&t.date>studyDate()&&t.date<=studyDate(new Date(Date.now()+7*86400000))).map(t=><p key={t.id}>{t.date} · {t.title} · {t.status==='pending'?'未开始':t.status==='in-progress'?'进行中':'已完成'}</p>)}{!plan.goal?.examDate&&<p>考试日期未设置；自主学习仍可继续。</p>}</section>
  <section aria-label="外部模考自报"><h2>外部模考 · 学习者自报</h2><p>与系统判分分开，不计入练习正确率。</p>{plan.externalMocks.length?plan.externalMocks.map(row=><p key={row.id}>{row.date} · {row.title} · {row.score} / {row.maximum}</p>):<p>暂无外部自报成绩。</p>}</section>
 </section>
}
