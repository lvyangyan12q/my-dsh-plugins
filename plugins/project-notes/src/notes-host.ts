import {randomUUID,createHash} from 'node:crypto'
import type {Context} from '@deepseek-ai/cordis'
import type {ResourceOwner} from 'dsh-worktable/sdk'
import {defineDomain,domainTable} from '@deepseek-ai/dsh-storage-domain'
import {z} from 'zod'
const id=z.string().min(1).max(160).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
const note=z.object({id,title:z.string().trim().min(1).max(200),body:z.string().max(4000),archived:z.boolean()}).strict()
const row=z.object({instanceId:id,generation:z.number().int().min(0),notes:z.array(note).max(2000)}).strict()
const domainDefinition=defineDomain({name:'project_notes',version:1,tables:{instances:domainTable<string,z.infer<typeof row>>(row)}})
export type Note=z.infer<typeof note>
export type NotesSnapshot={schemaVersion:1;instanceId:string;notes:Note[];revision:string;assistant?:{configured:boolean;skillIds:string[]}}
export async function installNotes(ctx:Pick<Context,'storageDomain'>,assistant:()=>{configured:boolean;skillIds:string[]}=()=>({configured:false,skillIds:[]})){
 const domain=await ctx.storageDomain.open(domainDefinition),table=domain.table('instances')
 let tail:Promise<unknown>=Promise.resolve(),closing=false,closed:Promise<void>|undefined
 const read=(instanceId:string):NotesSnapshot=>{id.parse(instanceId);const value=structuredClone(table.get(instanceId)??{instanceId,generation:0,notes:[]});return {schemaVersion:1,instanceId,notes:value.notes,revision:value.generation+':'+createHash('sha256').update(JSON.stringify(value)).digest('hex'),assistant:assistant()}}
 const enqueue=<T,>(operation:()=>Promise<T>):Promise<T>=>{if(closing)return Promise.reject(new Error('便签资料已退出，记录保留。'));const task=tail.catch(()=>{}).then(operation);tail=task;return task}
 const withTaskLease=<T,>(operation:()=>Promise<T>)=>enqueue(operation)
 const resource:ResourceOwner<NotesSnapshot>={appId:'project-notes',resourceId:'project-notes-records',actions:['create','update','archive'],read,withTaskLease,
  mutate:(instanceId,action,payload,expectedRevision,authorize)=>enqueue(async()=>{
   await authorize();const current=read(instanceId);if(current.revision!==expectedRevision)throw new Error('便签资料已更新，请保留草稿并刷新后重试。')
   const data=z.object({id:id.optional(),note:note.omit({id:true,archived:true}).optional(),archived:z.boolean().optional()}).strict().parse(payload)
   const notes=structuredClone(current.notes)
   if(action==='create'){if(!data.note)throw new Error('请填写便签标题与正文。');if(notes.length>=2000)throw new Error('便签数量已达上限。');notes.push({id:randomUUID(),...data.note,archived:false})}
   else{const index=notes.findIndex(item=>item.id===data.id);if(index<0)throw new Error('便签不存在于此实例。');if(action==='update'){if(!data.note)throw new Error('请填写便签标题与正文。');notes[index]={...notes[index]!,...data.note}}else if(action==='archive'){if(typeof data.archived!=='boolean')throw new Error('请明确归档或恢复。');notes[index]={...notes[index]!,archived:data.archived}}else throw new Error('不支持此便签动作。')}
   const saved=table.get(instanceId);await authorize();await table.put(instanceId,{instanceId,generation:(saved?.generation??0)+1,notes});return read(instanceId)
  }),
  taskContext:(value,selection)=>{
   const chosen=z.object({ids:z.array(id).max(20),filter:z.object({search:z.string().max(200),includeArchived:z.boolean()}).strict()}).strict().parse(selection)
   const matching=value.notes.filter(item=>(chosen.filter.includeArchived||!item.archived)&&(!chosen.filter.search||(item.title+' '+item.body).toLocaleLowerCase().includes(chosen.filter.search.toLocaleLowerCase())))
   if(new Set(chosen.ids).size!==chosen.ids.length||chosen.ids.some(key=>!matching.some(item=>item.id===key)))throw new Error('便签选择已变化，请重新选择并准备。')
   const notes=chosen.ids.length?matching.filter(item=>chosen.ids.includes(item.id)):matching.slice(0,20)
   const text=JSON.stringify({filter:chosen.filter,selectedIds:chosen.ids,notes,truncated:!chosen.ids.length&&matching.length>20},null,2)
   if(text.length>16000)throw new Error('所选便签过长，请减少选择后准备。')
   return {title:'项目便签与筛选',text}
  }
 }
 return {resource,dispose:()=>{if(!closed){closing=true;closed=tail.catch(()=>{}).then(()=>domain.close())}return closed}}
}
