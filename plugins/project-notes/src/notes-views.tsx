import {useEffect,useRef,useState,useSyncExternalStore} from 'react'
import type {ApplicationViewProps} from 'dsh-worktable/sdk'
import {requestNotes,type NotesData} from './notes-data-client.ts'
type Preferences={search:string;selected:string;includeArchived:boolean}
type State=Preferences&{phase:'loading'|'ready'|'error';data:NotesData;error:string;warning:string}
function preferences(id:string):Preferences{try{const value=JSON.parse(globalThis.localStorage?.getItem('project-notes:view:1:'+id)??'null');if(value&&typeof value.search==='string'&&value.search.length<=200&&typeof value.selected==='string'&&typeof value.includeArchived==='boolean')return value}catch{}return {search:'',selected:'',includeArchived:false}}
class NotesState{
 snapshot:State;listeners=new Set<()=>void>();refs=0;generation=0;abort?:AbortController;views=new Map<string,number>()
 constructor(readonly id:string){this.snapshot={...preferences(id),phase:'loading',data:{schemaVersion:1,instanceId:id,notes:[],revision:'',connection:null},error:'',warning:''}}
 subscribe=(fn:()=>void)=>{this.listeners.add(fn);return()=>{this.listeners.delete(fn)}}
 getSnapshot=()=>this.snapshot
 publish(value:Partial<State>){this.snapshot={...this.snapshot,...value};for(const listener of this.listeners)listener()}
 set(value:Partial<Preferences>){this.publish(value);try{const {search,selected,includeArchived}=this.snapshot;globalThis.localStorage?.setItem('project-notes:view:1:'+this.id,JSON.stringify({search,selected,includeArchived}))}catch{this.publish({warning:'展示偏好未能保存；便签业务记录仍由Host保存。'})}}
 async reload(viewId:string){const generation=++this.generation;this.abort?.abort();const abort=new AbortController();this.abort=abort;try{const data=await requestNotes(viewId,this.id,'read',{},undefined,undefined,abort.signal);if(this.refs&&generation===this.generation&&!abort.signal.aborted)this.publish({data,phase:'ready',error:''})}catch(error){if(this.refs&&generation===this.generation&&!abort.signal.aborted)this.publish({data:{schemaVersion:1,instanceId:this.id,notes:[],revision:'',connection:null},phase:'error',error:String((error as Error).message)})}}
 retain(viewId:string){this.refs++;this.views.set(viewId,(this.views.get(viewId)??0)+1);if(this.refs===1)void this.reload(viewId);return()=>{const count=(this.views.get(viewId)??1)-1;if(count)this.views.set(viewId,count);else this.views.delete(viewId);if(--this.refs===0){this.generation++;this.abort?.abort()}}}
 async reloadActive(){const viewId=this.views.keys().next().value;if(viewId)await this.reload(viewId)}
 release(){this.generation++;this.abort?.abort();this.listeners.clear()}
}
export function createNotesViews(){
 const states=new Map<string,NotesState>();let disposed=false
 function NotesView({application,instance,view,tasks,summary=false}:ApplicationViewProps&{summary?:boolean}){
  const state=states.get(instance.id)??new NotesState(instance.id);if(!states.has(instance.id))states.set(instance.id,state)
  const value=useSyncExternalStore(state.subscribe,state.getSnapshot,state.getSnapshot),alive=useRef(false)
  const [draft,setDraft]=useState({id:'',title:'',body:'',revision:'',connectionRevision:undefined as number|undefined}),[busy,setBusy]=useState(false),[error,setError]=useState('')
  useEffect(()=>{alive.current=true;const release=state.retain(view.id);return()=>{alive.current=false;release()}},[instance.id,view.id,state])
  const notes=value.data.notes.filter(n=>(value.includeArchived||!n.archived)&&(!value.search||(n.title+' '+n.body).toLocaleLowerCase().includes(value.search.toLocaleLowerCase()))),selected=notes.find(n=>n.id===value.selected)
  const writable=!value.data.connection||value.data.connection.allowedActions.includes('update')
  async function write(action:string,payload:unknown,revision:string){setBusy(true);setError('');try{await requestNotes(view.id,instance.id,action,payload,revision,draft.connectionRevision??value.data.connection?.revision);if(!disposed){if(alive.current)setDraft({id:'',title:'',body:'',revision:'',connectionRevision:undefined});await state.reloadActive()}}catch(e){if(alive.current&&!disposed)setError((e as Error).message)}finally{if(alive.current&&!disposed)setBusy(false)}}
  return <section aria-label={summary?'便签摘要':'项目便签'} style={{padding:12,color:'inherit',font:'inherit'}}>
   <h2>{summary?'便签摘要':application.title}</h2>
   {value.phase==='loading'&&<p>正在读取便签…</p>}
   {value.phase==='error'&&<p role="alert">{value.error}</p>}
   {value.warning&&<p role="status">{value.warning}</p>}
   <p>便签：{notes.length}</p><p>已选：{selected?.title??'无'}</p>
   {!summary&&<><label>搜索<input aria-label="搜索便签" maxLength={200} value={value.search} onChange={e=>state.set({search:e.target.value})}/></label> <label><input type="checkbox" checked={value.includeArchived} onChange={e=>state.set({includeArchived:e.target.checked})}/>显示归档</label>
    <button onClick={()=>void state.reload(view.id)}>刷新便签与权限</button>
    {value.data.connection&&<p>共享来源：{value.data.connection.ownerInstanceId} · {writable?'已许可编辑':'只读'}</p>}
    <ul>{notes.map(n=><li key={n.id}><button aria-label={'选择便签 '+n.title} aria-pressed={n.id===selected?.id} onClick={()=>state.set({selected:n.id})}>{n.title}</button>{n.archived?'（已归档）':''}</li>)}</ul>
    {!notes.length&&value.phase==='ready'&&<p>尚无匹配的便签。</p>}
    {selected&&<article><h3>{selected.title}</h3><p style={{whiteSpace:'pre-wrap'}}>{selected.body}</p><button disabled={!writable||busy} onClick={()=>setDraft({...selected,revision:value.data.revision,connectionRevision:value.data.connection?.revision})}>编辑此便签</button> <button disabled={busy||!!value.data.connection&&!value.data.connection.allowedActions.includes('archive')} onClick={()=>void write('archive',{id:selected.id,archived:!selected.archived},value.data.revision)}>{selected.archived?'恢复此便签':'归档此便签'}</button></article>}
    <fieldset disabled={busy||!writable||value.phase!=='ready'}><legend>{draft.id?'编辑便签（保留开始编辑时版本）':'新建便签'}</legend>
     <label>标题<input aria-label="便签标题" value={draft.title} maxLength={200} onChange={e=>setDraft(s=>({...s,title:e.target.value,revision:s.revision||value.data.revision,connectionRevision:s.revision?s.connectionRevision:value.data.connection?.revision}))}/></label>
     <label>正文<textarea aria-label="便签正文" value={draft.body} maxLength={4000} onChange={e=>setDraft(s=>({...s,body:e.target.value,revision:s.revision||value.data.revision,connectionRevision:s.revision?s.connectionRevision:value.data.connection?.revision}))}/></label>
     <button aria-label="保存便签" disabled={!draft.title.trim()} onClick={()=>write(draft.id?'update':'create',{...(draft.id?{id:draft.id}:{}),note:{title:draft.title,body:draft.body}},draft.revision||value.data.revision)}>保存便签</button>
     <button onClick={()=>{setDraft({id:'',title:'',body:'',revision:'',connectionRevision:undefined});setError('')}}>放弃编辑</button>
    </fieldset>
    {!value.data.assistant?.configured&&<p role="status">整理助手未配置。请在原生插件配置中明确填写公共Agent、公共Skill及已登记工作区；便签浏览编辑仍可使用。</p>}
    {tasks&&<button disabled={busy||value.phase!=='ready'||!value.data.assistant?.configured} onClick={async()=>{setBusy(true);setError('');try{await tasks.prepare({roleId:'assistant',text:'请加载'+['project-notes-format',...(value.data.assistant?.skillIds??[])].join('、')+'，整理'+(selected?'所选':'当前筛选')+'便签，保留事实并列出待办和缺失信息。',contexts:[{resourceId:'project-notes-records',selection:{ids:selected?[selected.id]:[],filter:{search:value.search,includeArchived:value.includeArchived}}}]})}catch(e){if(alive.current)setError((e as Error).message)}finally{if(alive.current)setBusy(false)}}}>准备便签整理任务</button>}
    {error&&<p role="alert">{error}</p>}
   </>}
  </section>
 }
 return {views:{page:(props:ApplicationViewProps)=><NotesView key={props.view.id} {...props}/>,summary:(props:ApplicationViewProps)=><NotesView key={props.view.id} {...props} summary/>},dispose(){disposed=true;for(const state of states.values())state.release();states.clear()}}
}
