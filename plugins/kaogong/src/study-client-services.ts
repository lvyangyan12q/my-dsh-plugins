import type {RoleFacade,TaskFacade} from './study-client-contracts.ts'

export async function studyRequest<T>(body?:Record<string,unknown>,signal?:AbortSignal):Promise<T>{
  const response=await fetch('/api/kaogong/study',{credentials:'same-origin',...(body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal})
  const value=await response.json()
  if(!response.ok)throw new Error(value.error??'考公档案服务暂不可用')
  return value
}
export function createStudyServices(viewId:string,open:(sessionId:string)=>Promise<void>):{roles:RoleFacade;tasks:TaskFacade}{
  const request=<T,>(action:string,body:Record<string,unknown>={})=>studyRequest<T>({...body,action,viewId})
  return {
    roles:{read:roleId=>request('role-read',{roleId}),ensure:roleId=>request('role-ensure',{roleId}),open:async(roleId,sessionId,revision)=>{const result=await request<{sessionId:string}>('role-open',{roleId,sessionId,revision});if(result.sessionId!==sessionId)throw new Error('原生角色身份不匹配');await open(result.sessionId)}},
    tasks:{prepare:input=>request('task-prepare',input),prepareOwned:input=>request('task-prepare-owned',input),list:()=>request('task-list'),edit:input=>request('task-edit',input),submit:(id,revision)=>request('task-submit',{id,revision}),recover:id=>request('task-recover',{id}),discard:(id,revision)=>request('task-discard',{id,revision})},
  }
}
