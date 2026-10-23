import {useEffect,useState} from 'react'
import type {Context} from '@deepseek-ai/cordis'

// Narrow structural view of the official ui-plugin-manager ConfigPageForm.
// The native row page owns namespace discovery, persistence and the revision fence.
type Values={managedAgentId:string;managedSkillId:string;roleWorkspace:string}
export interface NotesConfigForm {state:{status:string;value?:Record<string,unknown>;revision?:number;writable:boolean;mode:string};mutate(ops:readonly {op:'set';path:string[];value:string}[],revision?:number):Promise<boolean>}
type Props={view:'page'|'summary';form?:NotesConfigForm}
const fields=['managedAgentId','managedSkillId','roleWorkspace'] as const
const labels=['公共 Agent ID','公共 Skill ID','原生已登记 Workspace 绝对路径']
const values=(form?:NotesConfigForm):Values=>Object.fromEntries(fields.map(key=>[key,typeof form?.state.value?.[key]==='string'?form.state.value[key]:''])) as Values
export function NotesSettings({view,form}:Props){
 const [draft,setDraft]=useState(()=>values(form)),[revision,setRevision]=useState(form?.state.revision),[dirty,setDirty]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState('')
 useEffect(()=>{if(!dirty){setDraft(values(form));setRevision(form?.state.revision)}},[form?.state.value,form?.state.revision,dirty])
 if(view==='summary')return <span>显式选择公共 Agent、Skill 和工作区；保存不会创建会话或发送。</span>
 if(!form||form.state.status!=='ready')return <p role="status">原生配置服务尚未提供此行。请重试进入配置页；便签业务数据保留。</p>
 const save=async(event:{preventDefault():void})=>{event.preventDefault();if(pending||!form.state.writable||form.state.mode!=='host')return;setNotice('');const ids=[draft.managedAgentId,draft.managedSkillId];if(ids.some(id=>id&&!/^[a-z][a-z0-9.-]{0,79}$/.test(id))||Object.values(draft).some(Boolean)&&!Object.values(draft).every(Boolean)||draft.roleWorkspace&&!/^(?:[a-zA-Z]:[\\/]|\/)/.test(draft.roleWorkspace)){setNotice('请填写精确公共能力 ID 及原生已登记工作区的绝对路径，或将三项全部留空。');return}setPending(true);try{const ok=await form.mutate(fields.map(key=>({op:'set' as const,path:[key],value:draft[key]})),revision);if(ok){setDirty(false);setNotice('已由原生配置服务保存。刷新便签与权限后查看角色；保存不会新建或更换会话。')}else setNotice('未保存：配置已变化或写入被拒绝，草稿保留。重新进入配置页读取最新版本。')}catch(error){setNotice('未保存，草稿保留：'+(error instanceof Error?error.message:String(error)))}finally{setPending(false)}}
 return <form onSubmit={save}><p>复用已存在的公共管理记录。此配置属于整个项目便签应用；会话仍按实例隔离。</p>{fields.map((key,index)=><label key={key} style={{display:'block',marginBottom:12}}>{labels[index]}<input aria-label={labels[index]} value={draft[key]} disabled={pending} onChange={event=>{if(!dirty)setRevision(form.state.revision);setDirty(true);setDraft(before=>({...before,[key]:event.target.value}))}} style={{display:'block',width:'100%'}}/></label>)}<button type="submit" disabled={pending||!form.state.writable||form.state.mode!=='host'}>{pending?'保存中…':'保存角色配置'}</button>{notice&&<p role="status">{notice}</p>}</form>
}
type Slots={inject(name:string,register:()=>unknown):unknown;register(definition:{name:string;key:string},component:typeof NotesSettings):()=>void}
export function registerNotesSettings(ctx:Pick<Context,'inject'>){ctx.inject(['slots'],child=>{const slots=(child as unknown as {slots:Slots}).slots;slots.inject('plugins.row.config',()=>slots.register({name:'plugins.row.config',key:'@deepseek-ai/dsh-project-notes#project-notes'},NotesSettings))})}
