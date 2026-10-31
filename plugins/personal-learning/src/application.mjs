import {randomUUID} from 'node:crypto'

/** Public application command boundary. Storage writes finish before success is returned. */
export function createApplication(storage){
 let queue=Promise.resolve()
 return {request(body){
  const next=queue.then(async()=>{
   const state=await storage.read()
   if(body===undefined)return structuredClone(state)
   if(!body||body.action!=='create')throw Error('未知学习操作')
   if(Object.keys(body).some(key=>!['action','title','goal','priorKnowledge'].includes(key)))throw Error('学习请求包含未知字段')
   for(const [key,label,max] of [['title','名称',200],['goal','学习目标',8000],['priorKnowledge','已有基础',8000]]){
    if(typeof body[key]!=='string'||body[key].length>max||(key!=='priorKnowledge'&&!body[key].trim()))throw Error(`${label}无效`)
   }
   const instance={id:randomUUID(),title:body.title.trim(),goal:body.goal.trim(),priorKnowledge:body.priorKnowledge.trim(),createdAt:new Date().toISOString()}
   state.instances.push(instance);state.lastInstanceId=instance.id
   await storage.write(state)
   return structuredClone(instance)
  })
  queue=next.catch(()=>{})
  return next
 }}
}
