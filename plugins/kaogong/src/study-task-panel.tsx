import {useCallback,useEffect,useState} from 'react'
import type {StudyTask,TaskFacade} from './study-client-contracts.ts'

export function TeachingTasks({tasks,sessionId}:{tasks:TaskFacade;sessionId:string}){
  const [rows,setRows]=useState<StudyTask[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const refresh=useCallback(async()=>{setRows((await tasks.list()).filter(row=>row.sessionId===sessionId))},[tasks,sessionId])
  useEffect(()=>{let current=true;void tasks.list().then(value=>{if(current)setRows(value.filter(row=>row.sessionId===sessionId))}).catch(cause=>{if(current)setError(String(cause.message??cause))});return()=>{current=false}},[tasks,sessionId])
  const run=async(operation:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');try{await operation();await refresh()}catch(cause){setError(cause instanceof Error?cause.message:'教学任务操作失败')}finally{setBusy(false)}}
  return <section aria-label="待发送教学任务"><h3>教学任务</h3><button type="button" disabled={busy} onClick={()=>void run(refresh)}>刷新教学任务</button>{error&&<p role="alert">{error}</p>}{rows.length===0&&<p>尚无待发送任务。可从课堂目标、资料或练习结果准备。</p>}{rows.map(row=><TaskDraft key={row.id+':'+row.revision} task={row} disabled={busy} onSave={input=>run(()=>tasks.edit(input))} onSend={()=>run(()=>tasks.submit(row.id,row.revision))} onDiscard={()=>run(()=>tasks.discard(row.id,row.revision))} onRecover={()=>run(()=>tasks.recover(row.id))}/>)}</section>
}

function TaskDraft({task,disabled,onSave,onSend,onDiscard,onRecover}:{task:StudyTask;disabled:boolean;onSave(input:{id:string;revision:number;text:string;contexts:StudyTask['contexts']}):void;onSend():void;onDiscard():void;onRecover():void}){
  const[text,setText]=useState(task.text),[contexts,setContexts]=useState(task.contexts)
  const dirty=text!==task.text||JSON.stringify(contexts)!==JSON.stringify(task.contexts)
  return <article className="kg-task-draft"><strong>{task.roleId} · {task.status==='submitting'?'unknown':task.status}</strong>{task.notice&&<p>{task.notice}</p>}{task.status==='prepared'?<><label>待发送内容<textarea aria-label="待发送教学内容" disabled={disabled} value={text} onChange={event=>setText(event.target.value)}/></label>{contexts.map(item=><div key={item.id}><label>{item.title}<textarea aria-label={'教学资料 '+item.title} disabled={disabled} value={item.text} onChange={event=>setContexts(current=>current.map(row=>row.id===item.id?{...row,text:event.target.value}:row))}/></label><button type="button" disabled={disabled} onClick={()=>setContexts(current=>current.filter(row=>row.id!==item.id))}>移除资料</button></div>)}<div className="kg-actions"><button type="button" disabled={disabled||!dirty} onClick={()=>onSave({id:task.id,revision:task.revision,text,contexts})}>保存待发送修改</button><button type="button" disabled={disabled||dirty} onClick={onSend}>发送到原生对话</button><button type="button" disabled={disabled} onClick={onDiscard}>放弃待发送任务</button></div></>:<p>{task.status==='accepted'?'已发送，继续原生对话。':'发送状态待核实，请查看原生会话；不会自动重发。'}</p>}{task.status==='accepted'&&task.ownerFinalization!=='done'&&<button type="button" disabled={disabled} onClick={onRecover}>完成发送回执</button>}</article>
}
