import type {RoleFacade} from './study-client-contracts.ts'
import {TAXONOMY} from './taxonomy.ts'

export type LearningRoleKey={appId:'kaogong';instanceId:string;roleId:string;subject?:string}
export type ViewIdentity={instanceId:string;viewId:string}
const subjects=['language','quantitative','reasoning','data-analysis','general-knowledge','essay'] as const
const identity=(value:string)=>typeof value==='string'&&value.length>0&&value.length<=128

/** Each render receives a fixed view transport; shared business state never changes its identity. */
export function createViewTransport(context:ViewIdentity,send:typeof fetch=fetch){
  if(!identity(context.instanceId)||context.instanceId==='default'||!identity(context.viewId))throw new Error('考公需要明确的应用实例和视图。')
  const owner=Object.freeze({...context})
  const url=(input:string)=>{
    if(!input.startsWith('/api/kaogong/')||input.startsWith('//'))throw new Error('只能访问当前考公应用接口。')
    const address=new URL(input,'http://kaogong.invalid')
    if(!address.pathname.startsWith('/api/kaogong/'))throw new Error('只能访问当前考公应用接口。')
    if(address.searchParams.has('instanceId'))throw new Error('不能在请求中另选实例。')
    if(address.searchParams.has('viewId')&&address.searchParams.get('viewId')!==owner.viewId)throw new Error('不能在请求中另选视图。')
    address.searchParams.set('viewId',owner.viewId)
    return address.pathname+address.search
  }
  const request=async(input:string,init?:RequestInit)=>send(url(input),{...init,credentials:'same-origin'})
  const json=async<T>(input:string,body:unknown):Promise<T>=>{
    if(body&&typeof body==='object'&&('instanceId' in body||'viewId' in body))throw new Error('不能在业务请求中另选实例或视图。')
    const response=await request(input,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
    let value:T&{error?:string}
    try{value=await response.json()}catch{throw new Error('考公服务返回了无法识别的数据；原记录保留。')}
    if(!response.ok)throw new Error(value.error??`考公请求失败 (${response.status})`)
    return value
  }
  return Object.freeze({...owner,url,fetch:request,json})
}
export type ViewTransport=ReturnType<typeof createViewTransport>

/** Stable subject ids correspond to the existing native preset identities, never translated display positions. */
export function roleIdForKey(key:Pick<LearningRoleKey,'roleId'|'subject'>){
  if(!['teacher','class-advisor','counselor'].includes(key.roleId))throw new Error('未知学习角色。')
  if(key.roleId!=='teacher'){if(key.subject)throw new Error('只有任课老师可以选择科目。');return key.roleId}
  if(!key.subject)return 'teacher'
  const index=TAXONOMY.findIndex(row=>row.subject===key.subject)
  if(index<0||!subjects[index])throw new Error('未知教师科目。')
  return 'teacher.'+subjects[index]
}

export function createRoleNavigator(instanceId:string,roles:Pick<RoleFacade,'ensure'|'open'>,isCurrent=()=>true){
  return async(key:LearningRoleKey)=>{
    if(key.appId!=='kaogong'||key.instanceId!==instanceId)throw new Error('角色不属于当前学习实例。')
    const roleId=roleIdForKey(key)
    const value=await roles.ensure(roleId).catch((cause:unknown)=>{
      if(cause instanceof Error&&(cause.message==='应用未声明此角色。'||'code' in cause&&cause.code==='role-unavailable'))throw new Error('请配置考公插件的角色工作目录，并在原生工作区登记该目录后重试；原会话和学习记录保留。',{cause})
      throw cause
    }) as {sessionId?:unknown;revision?:unknown;phase?:unknown}
    if(value?.phase!=='ready'||typeof value.sessionId!=='string'||!Number.isSafeInteger(value.revision))throw new Error('原角色会话尚未就绪；未创建替代会话。')
    if(!isCurrent())throw new Error('学习视图已关闭；未切换其他视图的会话。')
    await roles.open(roleId,value.sessionId,value.revision as number)
    return value
  }
}
