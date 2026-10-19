import assert from 'node:assert/strict'
import {test} from 'node:test'
import {Readable} from 'node:stream'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {mountTasks} from '../01_content/src/framework/task-host.mjs'
import {AdmissionGate} from '../01_content/src/framework/admission.mjs'
test('authenticated task route derives ownership from a registered deep view and never accepts a native session override',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-task-http-'));const effects=[],routes=[],services=new Map();let reject=false,prompts=0;
 const context=id=>({view:{id,type:'page'},instance:{id:id==='view-A'?'A':'B',appId:'reader',revision:1},application:{id:'reader',kind:'deep',title:'Reader'}});
 const ctx={worktableAdmission:new AdmissionGate(),profileContext:{dir},worktableApplications:{resolveView:async id=>{if(!['view-A','view-B'].includes(id))throw Error('Unknown view');return context(id)}},worktableRoles:{read:async()=>({binding:{phase:'ready',sessionId:'native-A',revision:2}}),resolve:async()=>({})},worktableResources:{captureTaskContexts:async()=>[],withTaskLease:async(v,r,run)=>run()},connection:{admit:()=>reject?{rejection:403}:{}},sessionController:{prompt:async()=>{prompts++;return {accepted:true}},cancel:async()=>({accepted:true})},sessionPersistence:{flush:async()=>{}},provide:(name,value)=>services.set(name,value),inject:(keys,callback)=>callback(ctx),effect:(factory,label)=>effects.push({factory,label}),webServer:{register:route=>{routes.push(route);return()=>{}}}};
 mountTasks(ctx);const iterator=effects.find(e=>e.label==='worktable durable task owner').factory();const started=await iterator.next();
 async function call(body,chunks){const req=Readable.from(chunks??[JSON.stringify(body)]);req.method='POST';req.headers={'content-type':'application/json'};const res={writeHead(status){this.status=status},end(text){this.body=JSON.parse(text)}};await routes[0].handler(req,res);return res}
 try{
 reject=true;assert.equal((await call({action:'list',viewId:'view-A'})).status,403);reject=false;
 const draft=await call({action:'prepare',viewId:'view-A',roleId:'assistant',text:'Only explicit sends'});assert.equal(draft.status,200);assert.equal(prompts,0);
 assert.equal((await call({action:'submit',viewId:'view-A',id:draft.body.id,revision:1,sessionId:'native-B'})).body.code,'invalid-request');
 assert.equal((await call({action:'submit',viewId:'view-B',id:draft.body.id,revision:1})).body.code,'task-owner');
 assert.equal((await call({action:'submit',viewId:'view-A',id:draft.body.id,revision:1})).body.status,'accepted');assert.equal(prompts,1);
 assert.equal((await call({action:'list',viewId:'view-B'})).body.length,0);
 const chinese={action:'prepare',viewId:'view-A',roleId:'assistant',text:'你好，准备任务'};const bytes=Buffer.from(JSON.stringify(chinese)),split=bytes.indexOf(Buffer.from('你'))+1;const unicode=await call(chinese,[bytes.subarray(0,split),bytes.subarray(split)]);assert.equal(unicode.status,200);assert.equal(unicode.body.text,chinese.text,'UTF-8 network chunk boundaries cannot corrupt the task');
 }finally{await started.value();await iterator.return();await rm(dir,{recursive:true,force:true})}
})
