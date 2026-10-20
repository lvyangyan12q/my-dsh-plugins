import type {Context} from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-skill'
import type {} from 'dsh-worktable/sdk'
export const privateSkillId='project-notes-format'
/** App content and native registration stay app-owned; no public management record is created. */
export function installNoteCapabilities(ctx:Pick<Context,'skills'|'worktableCapabilities'>){
 const removeNative=ctx.skills.register({name:privateSkillId,description:'整理所选项目便签，区分事实、行动和缺失信息。',content:'使用项目便签中的原始内容。输出分为：事实、行动、缺失信息。保留原意，不猜测其他实例、未提供的资料或已经完成的工作。不自动改写业务记录；修改必须由用户在便签页面保存。',source:'runtime',provider:'project-notes',invocation:{userInvocable:false,modelInvocable:true}})
 try{
  const removeDirectory=ctx.worktableCapabilities.contribute('project-notes',[{kind:'skill',id:privateSkillId,title:'项目便签整理格式',provider:'project-notes',enabled:true,userInvocable:false,modelInvocable:true}])
  let closed:Promise<void>|undefined
  return ()=>closed??=Promise.allSettled([Promise.resolve().then(removeDirectory),Promise.resolve().then(removeNative)]).then(results=>{const failures=results.filter(r=>r.status==='rejected');if(failures.length)throw new AggregateError(failures.map(r=>(r as PromiseRejectedResult).reason),'便签私有能力释放失败；其余清理已尝试。')})
 }catch(error){removeNative();throw error}
}
