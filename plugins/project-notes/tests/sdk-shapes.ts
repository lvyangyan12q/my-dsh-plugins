import type {PrivateCapability,RoleDefinition,ApplicationDirectory} from 'dsh-worktable/sdk'
// These are contract errors, not valid declarations waiting for a native failure.
// @ts-expect-error an application-owned native Agent requires its preset ID
const missingNativeAgent:PrivateCapability={kind:'agent',id:'private-agent',title:'Private',enabled:true,userInvocable:true,modelInvocable:true}
// @ts-expect-error a role's Agent reference cannot name a Skill
const skillAsAgent:RoleDefinition={id:'assistant',title:'Assistant',creation:{cwd:'/registered/workspace'},agent:{kind:'skill',source:'managed',id:'a-skill'}}
// @ts-expect-error an automatic role Skill list cannot contain an Agent
const agentAsSkill:RoleDefinition={id:'assistant',title:'Assistant',creation:{cwd:'/registered/workspace'},agent:{kind:'agent',source:'managed',id:'an-agent'},skills:[{kind:'agent',source:'managed',id:'another-agent'}]}
export async function catalog(directory:ApplicationDirectory){
 for(const app of (await directory.snapshot()).applications){
  if(app.kind==='web')app.url.toUpperCase();else app.views.map(view=>view.id)
  // @ts-expect-error a catalog item may be a website without deep views
  app.views.map(view=>view.id)
 }
 const resolved=await directory.resolveView('registered-view')
 if(resolved.application.kind==='web')resolved.application.url.toUpperCase();else resolved.application.views.map(view=>view.id)
}
export {}
