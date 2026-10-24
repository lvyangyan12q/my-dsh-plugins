import assert from 'node:assert/strict'
import {test} from 'node:test'
import {Readable} from 'node:stream'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {mountTasks} from '../01_content/src/framework/task-host.mjs'
import {AdmissionGate} from '../01_content/src/framework/admission.mjs'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),{buildSync}=require('esbuild')
const bundle=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/taskPanel.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],write:false});const module={exports:{}};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports)
test('real task facade prepares an owned lesson through authenticated HTTP; action guards and recovery cannot forge authority or resend',async()=>{
 const root=await mkdtemp(join(tmpdir(),'owned-task-http-')),effects=[],routes=[],services=new Map();let prompts=0,claims=0,finalized=0,failFinal=true
 const context=viewId=>({view:{id:viewId,type:'page'},instance:{id:viewId==='view-A'?'A':'B',appId:'study',revision:1},application:{id:'study',kind:'deep',title:'Study'}})
 const ctx={worktableAdmission:new AdmissionGate(),profileContext:{dir:root},worktableApplications:{resolveView:async id=>context(id)},worktableRoles:{read:async()=>({binding:{phase:'ready',sessionId:'native-original',revision:1}}),resolve:async()=>({})},worktableResources:{captureTaskContexts:async()=>[],withTaskLease:async(v,r,operation)=>operation()},connection:{admit:()=>({peer:{}})},sessionController:{prompt:async()=>{prompts++;return {accepted:true}},cancel:async()=>({accepted:true})},sessionPersistence:{flush:async()=>{}},provide:(name,value)=>services.set(name,value),inject:(keys,callback)=>callback(ctx),effect:(factory,label)=>effects.push({factory,label}),webServer:{register:route=>{routes.push(route);return()=>{}}}}
 mountTasks(ctx);const iterator=effects.find(row=>row.label==='worktable durable task owner').factory(),started=await iterator.next(),saved=globalThis.fetch
 const call=async body=>{const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.headers={'content-type':'application/json'};const res={writeHead(status){this.status=status},end(value){this.body=JSON.parse(value)}};await routes[0].handler(req,res);return res}
 globalThis.fetch=async(_url,options)=>{const res=await call(JSON.parse(options.body));return {ok:res.status===200,json:async()=>res.body}}
 const remove=services.get('worktableTaskOwners').contribute('study','lesson',{version:'1',prepare:async(context,payload)=>({id:payload.lessonId,text:'Existing lesson',token:{instanceId:context.instanceId}}),validate:async row=>assert.equal(row.preparation.token.instanceId,row.instanceId),beforeSubmit:async()=>{claims++},accepted:async()=>{if(failFinal)throw Error('application receipt lost');finalized++}})
 try{
  const facade=module.exports.createTaskFacade('view-A'),owned=await facade.prepareOwned({roleId:'teacher',kind:'lesson',payload:{lessonId:'real-lesson'}});assert.equal(owned.status,'prepared');assert.equal(owned.instanceId,'A');assert.deepEqual([claims,prompts,finalized],[0,0,0])
  for(const [action,extra]of [['prepare',{roleId:'teacher',text:'plain',kind:'lesson',payload:{lessonId:'x'}}],['prepare-owned',{roleId:'teacher',kind:'lesson',payload:{lessonId:'x'},sessionId:'foreign'}],['prepare-owned',{roleId:'teacher',kind:'lesson',payload:{lessonId:'x'},instanceId:'B'}],['prepare-owned',{roleId:'teacher',kind:'lesson',payload:{lessonId:'x'},text:'browser-owned-source'}]])assert.equal((await call({action,viewId:'view-A',...extra})).body.code,'invalid-request')
  const plain=await facade.prepare({roleId:'teacher',text:'Plain remains supported'});assert.equal(plain.status,'prepared')
  const accepted=await call({action:'submit',viewId:'view-A',id:owned.id,revision:owned.revision});assert.equal(accepted.status,200);assert.equal(accepted.body.ownerFinalization,'pending');assert.deepEqual([claims,prompts,finalized],[1,1,0])
  failFinal=false;assert.equal((await call({action:'recover-owner',viewId:'view-B',id:owned.id})).body.code,'task-owner');assert.equal((await call({action:'recover-owner',viewId:'view-A',id:owned.id,payload:{}})).body.code,'invalid-request');const recovered=await call({action:'recover-owner',viewId:'view-A',id:owned.id,revision:accepted.body.revision});assert.equal(recovered.status,200);assert.equal(recovered.body.ownerFinalization,'done');assert.deepEqual([claims,prompts,finalized],[1,1,1])
 }finally{globalThis.fetch=saved;await remove();await started.value();await iterator.return();await rm(root,{recursive:true,force:true})}
})
