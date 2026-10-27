import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {mkdtemp,lstat,readdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {KaogongInstancePool} from '../src/instance-state.ts'
const native=process.env.DSH_SOURCE??'D:/programming/workspace/deepseek-harness',require=createRequire(resolve(native,'apps/cli/package.json'))
const {Context}=require('@deepseek-ai/cordis'),load=file=>import(pathToFileURL(resolve(native,file)).href)
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'kaogong-plan-')),ctx=new Context()
 await ctx.plugin((await load('packages/storage/storage/lib/index.js')).default)
 const {JsonStorageBackend}=await load('packages/storage/storage-json/lib/index.js'),{DomainFacility}=await load('packages/storage/storage-domain/lib/index.js')
 const backend=new JsonStorageBackend(root);ctx.storage.backend.register('json',backend)
 const pool=new KaogongInstancePool(new DomainFacility(ctx,{backend:'json'})),lease=await pool.acquire('learner-plan')
 return {plan:lease.state.plan,lessons:lease.state.lessons,async close(){await lease.release();await pool.close();await backend.close();await ctx.fiber.dispose();assert.ok(resolve(root).startsWith(resolve(tmpdir()))&&root.includes('kaogong-plan-'));async function scan(p){const s=await lstat(p);assert.equal(s.isSymbolicLink(),false);if(s.isDirectory())for(const n of await readdir(p))await scan(join(p,n))}await scan(root);await rm(root,{recursive:true})}}
}
test('public plan owner starts with unknown goal; preview is inert, confirmation revisioned and stale pages cannot overwrite',async()=>{
 const app=await fixture()
 try{
  const empty=app.plan.read();assert.equal(empty.goal,null);assert.equal(empty.tasks.length,0)
  const draft=await app.plan.preview({baseRevision:0,action:'generate',today:'2026-10-27',goal:{examDate:'2026-11-06',dailyModules:2,subjects:[{name:'行测-资料分析',weight:1}]}})
  assert.equal(app.plan.read().goal,null);assert.ok(draft.tasks.length>0);assert.ok(draft.tasks.every(t=>t.id&&t.kind!=='mock'))
  const saved=await app.plan.confirm(draft.id,0,true);assert.equal(saved.revision,1);assert.equal(saved.goal.examDate,'2026-11-06')
  await assert.rejects(()=>app.plan.confirm(draft.id,0,true),/版本|变化/)
 }finally{await app.close()}
})
test('task start retries keep one lesson intent; summaries do not complete tasks and external self-report stays separate',async()=>{
 const app=await fixture()
 try{
  const draft=await app.plan.preview({baseRevision:0,action:'append',today:'2026-10-27',task:{subject:'行测-资料分析',kind:'learn',title:'阅读总结',requirePractice:false}})
  await app.plan.confirm(draft.id,0,true);const id=app.plan.read().tasks[0].id
  const begun=await app.plan.start(id,1),retried=await app.plan.start(id,1)
  assert.equal(begun.tasks[0].lessonId,retried.tasks[0].lessonId);assert.ok(begun.tasks[0].lessonId)
  await assert.rejects(()=>app.plan.complete(id,begun.revision,true,{}),/总结|证据/)
  const saved=await app.plan.saveSummary(id,begun.revision,'保存本次学习总结')
  assert.equal(saved.tasks[0].status,'in-progress')
  const complete=await app.plan.complete(id,saved.revision,true,{})
  assert.equal(complete.tasks[0].status,'completed');assert.equal(complete.tasks[0].evidence.summary,'保存本次学习总结')
  const mock=await app.plan.recordExternalMock({date:'2026-10-27',title:'线下模考',score:60,maximum:100},complete.revision,true)
  assert.equal(mock.tasks.length,1);assert.equal(mock.externalMocks[0].source,'learner-self-report')
 }finally{await app.close()}
})
test('a lesson explicitly not requiring practice completes only after a saved summary and learner confirmation',async()=>{
 const app=await fixture()
 try{
  const id=crypto.randomUUID(),created=await app.lessons.create({lessonId:id,subject:'行测-资料分析',objective:'阅读并总结',materialIds:[],requireReflections:false,requirePractice:false})
  assert.equal(created.canConfirm,false)
  await assert.rejects(()=>app.lessons.confirm(id,true),/证据|总结/)
  const saved=await app.lessons.saveSummary(id,'已保存本次阅读要点。');assert.equal(saved.canConfirm,true);assert.equal(saved.lesson.completion,null)
  const completed=await app.lessons.confirm(id,true);assert.ok(completed.lesson.completion);assert.deepEqual(completed.lesson.completion.proofs,[])
 }finally{await app.close()}
})
test('future adjustment protects started tasks and retains capacity overflow by stable IDs; defer and append require previews',async()=>{
 const app=await fixture()
 try{
  const initial=await app.plan.preview({baseRevision:0,action:'generate',today:'2026-10-27',goal:{examDate:'2026-11-06',dailyModules:2,subjects:[{name:'行测-资料分析',weight:1}]}})
  await app.plan.confirm(initial.id,0,true)
  const first=app.plan.read().tasks[0];await app.plan.start(first.id,1)
  const before=app.plan.read(),adjusted=await app.plan.preview({baseRevision:before.revision,action:'adjust',today:'2026-10-27',goal:{examDate:'2026-10-29',dailyModules:1,subjects:[{name:'行测-资料分析',weight:1}]}})
  assert.deepEqual(adjusted.tasks.find(t=>t.id===first.id),before.tasks.find(t=>t.id===first.id))
  assert.equal(adjusted.tasks.length,before.tasks.length);assert.ok(adjusted.overflow.length>0)
  await app.plan.confirm(adjusted.id,before.revision,true)
  const current=app.plan.read(),pending=current.tasks.find(t=>t.status==='pending'&&t.date===null)
  const defer=await app.plan.preview({baseRevision:current.revision,action:'defer',today:'2026-10-27',taskId:pending.id,date:'2026-10-27'})
  assert.equal(app.plan.read().revision,current.revision);assert.ok(defer.overflow.includes(pending.id),'full day is never silently overbooked')
 }finally{await app.close()}
})
