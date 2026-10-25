import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Readable} from 'node:stream'
import {RoleStore} from '../01_content/src/framework/roles.mjs'
import {mountRoles} from '../01_content/src/framework/role-host.mjs'

test('Host activation never waits for its own native diagnostics; a broken Agent leaves management available for explicit repair',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-role-lifecycle-')),services=new Map(),routes=[],effects=[]
 const presets=new Map(),skills=new Map();let settleHost,hostSettled=false,failBad=true,inventoryCalls=0,resolveCalls=0,scopeCalls=0
 const settled=new Promise(resolve=>settleHost=()=>{hostSettled=true;resolve()})
 const agent=id=>({kind:'agent',id,title:id,content:'Keep original '+id,enabled:true,userInvocable:true,modelInvocable:true,skillIds:[],revision:1,source:'managed',presetId:'worktable.managed.'+id,baseComposition:'workspace-basic-v1'})
 const good=agent('good'),bad=agent('bad'),skill={kind:'skill',id:'summary',title:'Summary',content:'Keep original Skill',enabled:true,userInvocable:true,modelInvocable:true,provider:'worktable-managed',source:'managed',revision:1,skillIds:[]}
 const seed=await RoleStore.open(join(dir,'worktable-platform','roles.v1.json'));await seed.change(data=>{data.capabilities.push(skill,good,bad);return null});await seed.close()
 const native={agentPresets:{register:async row=>{if(row.id===bad.presetId&&failBad)throw new Error('Agent module unavailable');presets.set(row.id,row);return async()=>presets.delete(row.id)},compositionInventory:async()=>{inventoryCalls++;await settled;return [...presets.values()].map(row=>({id:row.id,rows:row.plugins.map(p=>({moduleName:p.name,enabled:true,fiberState:hostSettled?2:0}))}))},resolve:async id=>{resolveCalls++;await settled;if(!presets.has(id))throw new Error('missing Agent');return {id}},acquireScope:async()=>{scopeCalls++;await settled;return {key:{},[Symbol.asyncDispose]:async()=>{}}}},skills:{register:row=>{skills.set(row.name,row);return()=>skills.delete(row.name)},snapshot:async()=>({complete:true,skills:[...skills.values()]}),get:async id=>skills.get(id)}}
 const ctx={...native,profileContext:{dir},connection:{admit:()=>({peer:{}})},worktableApplications:{snapshot:async()=>({applications:[],instances:[]})},sessionController:{},sessionPersistence:{},workspaceRegistry:{list:()=>[]},provide:(name,value)=>services.set(name,value),effect:(factory,label)=>effects.push({factory,label}),on:()=>()=>{},inject:(keys,callback)=>callback(ctx),webServer:{register:route=>{routes.push(route);return()=>{}}}}
 let iterator,activation,result,startupTimeout
 async function call(body,split=false){const bytes=Buffer.from(JSON.stringify(body));const req=Readable.from(split?Array.from(bytes).map(byte=>Buffer.from([byte])):[bytes]);req.method='POST';req.headers={'content-type':'application/json'};const res={writeHead(status){this.status=status},end(text){this.body=JSON.parse(text)}};await routes[0].handler(req,res);return res}
 try{
 mountRoles(ctx);iterator=effects.find(effect=>effect.label==='worktable role and capability owner').factory()
 activation=iterator.next().then(value=>({value}),error=>({error}))
 const started=await Promise.race([activation,new Promise(resolve=>{startupTimeout=setTimeout(()=>resolve({blocked:true}),500)})])
 clearTimeout(startupTimeout)
 assert.equal(started.blocked,undefined,'role owner must be admitted while native Host diagnostics are still pending')
 assert.equal(started.error,undefined,'one broken capability must not abort the profile owner')
 result=started.value
 assert.ok(services.has('worktableRoles'));assert.equal(inventoryCalls,0);assert.equal(resolveCalls,0);assert.equal(scopeCalls,0)
 const catalog=await call({action:'capabilities'});assert.equal(catalog.status,200)
 const restoredBad=catalog.body.find(row=>row.id==='bad');assert.match(restoredBad.unavailable.reason,/Agent module unavailable/)
 assert.equal(restoredBad.content,bad.content);assert.equal(restoredBad.revision,1);assert.equal(restoredBad.enabled,true)
 await assert.rejects(()=>services.get('worktableCapabilities').validate({kind:'agent',source:'managed',id:'bad'},'app'),/Agent module unavailable/)
 settleHost();failBad=false
 const chineseContent='你好，保留完整中文技能。';const unicode=await call({action:'capability-save',capability:{kind:'skill',id:'utf8-skill',title:'中文技能',content:chineseContent,enabled:true,userInvocable:true,modelInvocable:true},revision:0},true);assert.equal(unicode.status,200);assert.equal(unicode.body.content,chineseContent)
 const originalResolve=native.agentPresets.resolve
 native.agentPresets.resolve=async id=>id===good.presetId?{id,broken:'Native Agent activation failed'}:originalResolve(id)
 await assert.rejects(()=>services.get('worktableCapabilities').validate({kind:'agent',source:'managed',id:'good'},'app'),/Native Agent activation failed/)
 const brokenNative=(await call({action:'capabilities'})).body.find(row=>row.id==='good')
 assert.match(brokenNative.unavailable.reason,/Native Agent activation failed/)
 native.agentPresets.resolve=originalResolve
 const repaired=await call({action:'capability-save',capability:restoredBad,revision:1});assert.equal(repaired.status,200)
 assert.equal((await call({action:'capabilities'})).body.find(row=>row.id==='bad').unavailable,undefined)
 await services.get('worktableCapabilities').validate({kind:'agent',source:'managed',id:'bad'},'app')
 assert.ok(inventoryCalls>0,'explicit post-activation save/use must still validate the live native composition')
 const capabilities=services.get('worktableCapabilities')
 capabilities.contribute('reader',[{kind:'agent',id:'bad',presetId:'reader.private',title:'Same-name private Agent',enabled:true,userInvocable:true,modelInvocable:true}])
 presets.set('reader.private',{id:'reader.private',plugins:[]})
 const originalRegister=native.agentPresets.register
 native.agentPresets.register=async row=>{if(row.id===bad.presetId){const content=row.plugins.find(plugin=>plugin.name==='@deepseek-ai/dsh-persona').config.prefix;throw new Error(content==='Rejected edit'?'new save registration failed':'old rollback registration failed')}return originalRegister(row)}
 const failed=await call({action:'capability-save',capability:{...repaired.body,content:'Rejected edit'},revision:2})
 assert.equal(failed.status,500);assert.match(failed.body.error,/new save registration failed/)
 const failedRecord=(await call({action:'capabilities'})).body.find(row=>row.id==='bad')
 assert.equal(failedRecord.content,bad.content);assert.equal(failedRecord.revision,2);assert.match(failedRecord.unavailable.reason,/old rollback registration failed/)
 const privateRow=(await capabilities.list('reader')).find(row=>row.source==='application'&&row.id==='bad')
 assert.equal(privateRow.unavailable,undefined)
 await capabilities.validate({kind:'agent',id:'bad',source:'application',ownerAppId:'reader'},'reader')
 const disabled=await call({action:'capability-save',capability:{...failedRecord,enabled:false},revision:2})
 assert.equal(disabled.status,200);assert.equal(disabled.body.revision,3);assert.equal(disabled.body.enabled,false)
 assert.equal((await call({action:'capabilities'})).body.find(row=>row.id==='bad').unavailable,undefined)
 assert.ok(presets.has('reader.private'),'managed registration failure cannot dispose another capability owner')
 }finally{clearTimeout(startupTimeout);settleHost();const complete=await activation;if(!result)result=complete?.value;if(result?.value)await result.value();await iterator?.return();await rm(dir,{recursive:true,force:true})}
})
