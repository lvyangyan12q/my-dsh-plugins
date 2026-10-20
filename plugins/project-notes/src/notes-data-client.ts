import type {NotesSnapshot} from './notes-host.ts'
export type Connection={id:string;ownerAppId:string;ownerInstanceId:string;consumerInstanceId:string;revision:number;status:string;allowedActions:string[]}
export type NotesData=NotesSnapshot&{connection:Connection|null;assistant?:{configured:boolean;skillIds:string[]}}
export async function requestNotes(viewId:string,instanceId:string,action:string,payload:unknown={},revision?:string,connectionRevision?:number,signal?:AbortSignal):Promise<NotesData>{
 const response=await fetch('/api/worktable/resources',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({operation:'call',viewId,resourceId:'project-notes-records',action,payload,expectedRevision:revision,expectedConnectionRevision:connectionRevision}),signal})
 const result=await response.json();if(!response.ok)throw new Error(result.error??'便签服务不可用，记录保留。')
 if(result.committed&&!result.value)throw new Error(result.notice??'写入已提交，权限随后改变，请刷新确认。')
 const value=result.value,connection=result.connection??null
 if(!value||typeof value.instanceId!=='string'||typeof value.revision!=='string'||!Array.isArray(value.notes)||value.notes.some((n:unknown)=>!n||typeof n!=='object'||typeof (n as any).id!=='string'||typeof (n as any).title!=='string'||typeof (n as any).body!=='string'||typeof (n as any).archived!=='boolean'))throw new Error('不支持此资料schema；未复制或转换其他应用数据。')
 if(connection?(connection.ownerAppId!=='project-notes'||connection.consumerInstanceId!==instanceId||connection.ownerInstanceId!==value.instanceId||connection.status!=='active'):value.instanceId!==instanceId)throw new Error('便签响应实例或资源来源不匹配。')
 return {...value,instanceId,connection}
}
