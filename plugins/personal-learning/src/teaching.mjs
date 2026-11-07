import {randomUUID} from 'node:crypto'
export const teachingSkill='personal-learning-teach'
/** The HTTP application boundary serializes every command sharing global state. */
export function createLearningDispatcher(services){
 let queue=Promise.resolve();
 async function dispatch(body,execution){
  if(execution){const owner=body.kind==='feedback'?'evidence':body.kind==='map'?'maps':'courses';const method=body.kind==='feedback'?'feedback':'submit';return services[owner][method](body,execution.agent?.session?.id)}
  if(body?.action==='teaching-workspaces')return services.teacher.workspaces();
  if(body?.action==='teaching-open')return services.teacher.open(body.instanceId,body.workspaceId);
  const routes={continuation:'continuation',evidence:'evidence',lab:'evidence',map:'maps',course:'courses',request:'requests'};
  const owner=routes[body?.action?.split('-')[0]]??'app';return services[owner].request(body);
 }
 return (body,execution)=>{const result=queue.then(()=>dispatch(body,execution));queue=result.catch(()=>{});return result};
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
   if(binding){const existing=await ctx.sessionPersistence.stat(binding.sessionId);if(existing){if(existing.agentPreset&&existing.agentPreset!=='standard')throw Error('会话预设不符');binding.phase='ready';await storage.write(state);return structuredClone(binding)}if(binding.phase==='ready')throw Error('原生会话不存在，请核对保存的会话身份');if(existing!==null&&existing!==undefined)throw Error('无法确认创建状态，保留原会话身份');const retried=await ctx.sessionController.create({sessionId:binding.sessionId,agentPreset:'standard',workspaceId:binding.workspaceId});if(retried.sessionId!==binding.sessionId||retried.agentPreset!=='standard')throw Error('原生会话身份不符');await ctx.sessionPersistence.flush();binding.phase='ready';await storage.write(state);return structuredClone(binding)}
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
