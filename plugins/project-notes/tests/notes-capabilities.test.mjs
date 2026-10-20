import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {installNoteCapabilities} from '../src/notes-capabilities.ts'
import {RoleStore} from '../../worktable/01_content/src/framework/roles.mjs'
import {CapabilityDirectory} from '../../worktable/01_content/src/framework/capabilities.mjs'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
const source=process.env.DSH_SOURCE,require=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
const {SkillRegistry}=await import(pathToFileURL(resolve(source,'packages/skill/skill/lib/index.js')).href)
test('app-owned skill is really registered by the official registry, stays outside public management, and releases only its own contribution',async()=>{
 const ctx=new Context(),folder=await mkdtemp(resolve(tmpdir(),'notes-capabilities-'));let store,dispose;
 try{
  const skills=new SkillRegistry(ctx);store=await RoleStore.open(resolve(folder,'roles.json'));const directory=new CapabilityDirectory(store,{skills});
  dispose=installNoteCapabilities({skills,worktableCapabilities:directory});
  const actual=await skills.get('project-notes-format');assert.equal(actual.provider,'project-notes');assert.equal(actual.invocation.modelInvocable,true);assert.equal(actual.invocation.userInvocable,false);assert.match(actual.content,/事实/);
  assert.equal((await directory.list()).length,0);assert.equal((await directory.list('project-notes')).length,1);
  await assert.rejects(directory.record({kind:'skill',id:'project-notes-format',source:'application',ownerAppId:'project-notes'},'reading-statistics','model'),/所有权/);
  assert.equal((await directory.record({kind:'skill',id:'project-notes-format',source:'application',ownerAppId:'project-notes'},'project-notes','model')).provider,'project-notes');
  await dispose();dispose=undefined;assert.equal(await skills.get('project-notes-format'),undefined);assert.equal((await directory.list('project-notes')).length,0)
 }finally{await dispose?.();await store?.close();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}
})
test('a preexisting same-name native Skill cannot be claimed or removed by the application',async()=>{
 const ctx=new Context(),folder=await mkdtemp(resolve(tmpdir(),'notes-skill-conflict-'));let store,dispose;
 try{
  const skills=new SkillRegistry(ctx);const foreign=skills.register({name:'project-notes-format',description:'Externally owned',content:'External instructions',provider:'foreign-owner',source:'runtime',invocation:{modelInvocable:true,userInvocable:true}})
  store=await RoleStore.open(resolve(folder,'roles.json'));const directory=new CapabilityDirectory(store,{skills});dispose=installNoteCapabilities({skills,worktableCapabilities:directory});
  await assert.rejects(directory.validate({kind:'skill',source:'application',ownerAppId:'project-notes',id:'project-notes-format'},'project-notes',process.cwd(),'model'),/来源不同/)
  await dispose();dispose=undefined;assert.equal((await skills.get('project-notes-format')).provider,'foreign-owner');foreign()
 }finally{await dispose?.();await store?.close();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}
})
