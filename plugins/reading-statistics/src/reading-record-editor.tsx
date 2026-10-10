import { useEffect, useRef, useState } from 'react'
import type { RecipeModuleProps } from '@deepseek-ai/dsh-personal-workbench/client'
import type { ReadingRecord } from './reading-api.ts'
import { readingAppId } from './reading-api.ts'
import { requestReading, recordOrigin } from './reading-data-client.ts'
type Fields = Omit<ReadingRecord, 'id'>
const empty = (): Fields => ({ title: '', author: '', category: '', status: 'reading', minutes: 0, notes: '' })
export function ReadingRecordEditor({ appId, instanceId, preview }: RecipeModuleProps) {
  const activeScope = useRef(`${appId}:${instanceId}:${preview}`)
  activeScope.current = `${appId}:${instanceId}:${preview}`
  const [records,setRecords] = useState<ReadingRecord[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(''), [editing,setEditing] = useState<string|null|undefined>(), [fields,setFields] = useState(empty), [deleting,setDeleting] = useState<string>(), [notice,setNotice] = useState('')
  const read = async (signal?: AbortSignal) => { setBusy(true); setError(''); try { const row=await requestReading({action:'read',instanceId,preview},signal); if(!signal?.aborted)setRecords(row.records) } catch(e) { if(!signal?.aborted)setError(e instanceof Error?e.message:String(e)) } finally { if(!signal?.aborted)setBusy(false) } }
  useEffect(()=>{setEditing(undefined);setDeleting(undefined);setNotice('');const controller=new AbortController();if(appId===readingAppId)void read(controller.signal);return()=>controller.abort()},[appId,instanceId,preview])
  const mutate = async (body: Record<string,unknown>) => { if(preview||busy)return; const scope = activeScope.current;setBusy(true);setError('');try {const row=await requestReading({...body,action:String(body.action),instanceId,preview});if(activeScope.current!==scope)return;setRecords(row.records);setEditing(undefined);setDeleting(undefined);setNotice('阅读记录已保存')}catch(e){if(activeScope.current===scope)setError(e instanceof Error?e.message:String(e))}finally{if(activeScope.current===scope)setBusy(false)} }
  if(appId!==readingAppId)return <p role="alert">阅读管理模块属于阅读统计应用。</p>
  return <section data-reading-editor aria-busy={busy} style={{display:'grid',gap:12,minWidth:0}}>
    <p>实例：{instanceId} · 默认三条为示例；自录记录独立保存，可按“来源”筛选统计。</p>
    {preview&&<p role="status">预览只读，启用后可管理此实例的阅读记录。</p>}
    {error&&<div role="alert"><p>{error}</p><button data-pwb-button disabled={busy} onClick={()=>{setDeleting(undefined);void read()}}>重试加载阅读记录</button></div>}
    {notice&&<p role="status">{notice}</p>}
    {!preview&&<button data-pwb-button disabled={busy} onClick={()=>{setFields(empty());setEditing(null);setDeleting(undefined);setNotice('')}}>新增阅读记录</button>}
    {busy&&<p role="status">正在加载或保存阅读记录…</p>}
    {!records.length&&!busy&&!error&&<p>尚无阅读记录。</p>}
    <ul style={{padding:0,listStyle:'none',display:'grid',gap:8}}>{records.map(record=><li key={record.id} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',borderBottom:'1px solid var(--border-color,#ddd)',padding:'8px 0'}}><span style={{flex:'1 1 160px',overflowWrap:'anywhere'}}>{record.title} · {record.minutes} 分钟 · {recordOrigin(record.id)}</span>{!preview&&<><button data-pwb-button aria-label={'编辑阅读记录: '+record.id} disabled={busy} onClick={()=>{const{id,...rest}=record;setFields(rest);setEditing(id);setDeleting(undefined);setNotice('')}}>编辑</button><button data-pwb-button aria-label={'删除阅读记录: '+record.id} disabled={busy} onClick={()=>{setDeleting(record.id);setEditing(undefined);setNotice('')}}>删除</button></>}</li>)}</ul>
    {!preview&&editing!==undefined&&<form style={{display:'grid',gap:10}} onSubmit={event=>{event.preventDefault();void mutate({action:editing===null?'create':'update',...(editing?{recordId:editing}:{}),record:fields})}}><fieldset disabled={busy} style={{display:'grid',gap:10,border:0,padding:0,minWidth:0}}>
      {(['title','author','category'] as const).map(key=><label key={key}>{({title:'书名',author:'作者',category:'分类'})[key]}<input style={{width:'100%',boxSizing:'border-box'}} aria-label={({title:'书名',author:'作者',category:'分类'})[key]} required={key==='title'} maxLength={key==='category'?100:200} value={fields[key]} onChange={e=>setFields({...fields,[key]:e.target.value})}/></label>)}
      <label>状态<select aria-label="阅读状态" value={fields.status} onChange={e=>setFields({...fields,status:e.target.value as Fields['status']})}><option value="reading">正在阅读</option><option value="finished">已读完</option></select></label>
      <label>阅读分钟<input aria-label="阅读分钟" type="number" min="0" max="1000000" step="1" required value={fields.minutes} onChange={e=>setFields({...fields,minutes:Number(e.target.value)})}/></label>
      <label>阅读笔记<textarea style={{width:'100%',boxSizing:'border-box'}} aria-label="阅读笔记" maxLength={4000} value={fields.notes} onChange={e=>setFields({...fields,notes:e.target.value})}/></label>
      <div style={{display:'flex',gap:8}}><button data-pwb-button type="submit" disabled={!fields.title.trim()}>保存阅读记录</button><button data-pwb-button type="button" onClick={()=>setEditing(undefined)}>取消编辑</button></div>
    </fieldset></form>}
    {!preview&&deleting&&<div role="alertdialog" aria-label="确认删除阅读记录"><p>确定删除“{records.find(r=>r.id===deleting)?.title}”？此操作会移除此实例的记录。</p><button data-pwb-button disabled={busy} onClick={()=>void mutate({action:'delete',recordId:deleting,confirmed:true})}>确认删除阅读记录</button><button data-pwb-button disabled={busy} onClick={()=>setDeleting(undefined)}>取消删除</button></div>}
  </section>
}