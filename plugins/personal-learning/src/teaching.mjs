import {randomUUID} from 'node:crypto'
export const teachingSkill='personal-learning-teach'
/** The HTTP application boundary serializes every command sharing global state. */
export function createLearningDispatcher(app,teacher,requests,courses,maps,evidence,continuation){
 let queue=Promise.resolve()
 return (body,execution)=>{const result=queue.then(()=>execution?(body.kind==='feedback'?evidence.feedback(body,execution.agent?.session?.id):body.kind==='map'?maps.submit(body,execution.agent?.session?.id):courses.submit(body,execution.agent?.session?.id)):body?.action?.startsWith('continuation-')?continuation.request(body):body?.action?.startsWith('evidence-')?evidence.request(body):body?.action?.startsWith('map-')?maps.request(body):body?.action?.startsWith('course-')?courses.request(body):body?.action?.startsWith('request-')?requests.request(body):body?.action==='teaching-workspaces'?teacher.workspaces():body?.action==='teaching-open'?teacher.open(body.instanceId,body.workspaceId):app.request(body));queue=result.catch(()=>{});return result}
}
export function createTeaching(ctx,storage){
 let queue=Promise.resolve()
 async function ready(workspaceId){
  const workspace=ctx.workspaceRegistry.list().find(w=>w.id===workspaceId)
  if(!workspace)throw Error('请先在 DSH 登记并选择工作目录')
  const skill=await ctx.skills.get(teachingSkill,{cwd:workspace.path})
  if(!skill||skill.provider!=='personal-learning'||!skill.invocation.userInvocable)throw Error('教学技能不可用，请启用个人学习插件后重试')
  return workspace
 }
 return {workspaces:()=>ctx.workspaceRegistry.list().map(({id,path})=>({id,path})),open(instanceId,workspaceId){
  const result=queue.then(async()=>{
   let state=await storage.read();if(!state.instances.some(i=>i.id===instanceId))throw Error('学习实例不存在')
   state.bindings??=[];let binding=state.bindings.find(b=>b.instanceId===instanceId)
   await ready(binding?.workspaceId??workspaceId)
   if(binding){if(binding.phase!=='ready'||!await ctx.sessionPersistence.stat(binding.sessionId))throw Error('原生会话创建结果待核对；保留原会话身份，请检查 DSH 会话列表');return structuredClone(binding)}
   binding={instanceId,workspaceId,sessionId:randomUUID(),phase:'intent'}
   state.bindings.push(binding);await storage.write(state)
   const created=await ctx.sessionController.create({sessionId:binding.sessionId,agentPreset:'standard',workspaceId})
   if(created.sessionId!==binding.sessionId||created.agentPreset!=='standard')throw Error('原生会话身份不符')
   await ctx.sessionPersistence.flush()
   state=await storage.read();const saved=state.bindings.find(b=>b.sessionId===binding.sessionId);saved.phase='ready';await storage.write(state)
   return structuredClone(saved)
  });queue=result.catch(()=>{});return result
 }}
}
