import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {mountRoles} from '../01_content/src/framework/role-host.mjs'

test('authenticated browser adoption selects owner-inspected identity; arbitrary session lookup and forged imports are unavailable',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-adoption-http-')),services=new Map(),effects=[],routes=[]
 const apps=new ApplicationDirectory(join(dir,'apps.json'));let iterator,activation,admitted=true,creates=0
 await apps.contribute({id:'reader',title:'Reader',version:'1',kind:'deep',protocolVersion:1,views:[{id:'page',title:'Page'}]})
 const instance=await apps.createInstance('reader',null)
 const ctx={profileContext:{dir},worktableApplications:apps,connection:{admit:()=>admitted?{peer:{}}:{rejection:403}},
  workspaceRegistry:{list:()=>[{id:'workspace',path:dir,sessionIds:['native-current','native-history']}]},
  sessionPersistence:{stat:async id=>['native-current','native-history'].includes(id)?{header:{id,cwd:dir},formatStatus:'current'}:undefined},
  sessionController:{projections:async({sessionId})=>({kind:'sequenced',values:{agentPreset:sessionId==='native-history'?'private.previous':'private.reader'}}),create:async()=>{creates++;throw Error('must not create')}},
  agentPresets:{resolve:async id=>({id}),acquireScope:async()=>({key:{},[Symbol.asyncDispose]:async()=>{}})},skills:{snapshot:async()=>({complete:true,skills:[]})},
  provide:(key,value)=>services.set(key,value),inject:(keys,fn)=>fn(ctx),effect:(factory,label)=>effects.push({factory,label}),webServer:{register:route=>{routes.push(route);return()=>{}}}}
 async function request(body){const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method='POST';req.headers={'content-type':'application/json'};const res={writeHead(status){this.status=status},end(text){this.body=JSON.parse(text)}};await routes[0].handler(req,res);return res}
 try{
  mountRoles(ctx);iterator=effects.find(row=>row.label==='worktable role and capability owner').factory();activation=await iterator.next()
  services.get('worktableCapabilities').contribute('reader',[{kind:'agent',id:'reader',presetId:'private.reader',title:'Reader',enabled:true,userInvocable:true,modelInvocable:true}])
  const roles=services.get('worktableRoles')
  roles.contribute('reader',[{id:'teacher',title:'Teacher',agent:{kind:'agent',source:'application',ownerAppId:'reader',id:'reader'},creation:{cwd:dir}}])
  roles.contributeLegacy('reader',{inspect:async(sourceKey,target)=>sourceKey==='old/default/teacher'&&target.instanceId===instance.id?{sourceKey,revision:'source-v1',roleId:'teacher',sessionId:'native-current',presetId:'private.reader',creation:{cwd:dir},phase:'ready',previousSessions:[{sessionId:'native-history',presetId:'private.previous',creation:{cwd:dir}}]}:null})
  admitted=false;assert.equal((await request({action:'adoption-preview',instanceId:instance.id,roleId:'teacher',sourceKey:'old/default/teacher'})).status,403);admitted=true
  const preview=await request({action:'adoption-preview',instanceId:instance.id,roleId:'teacher',sourceKey:'old/default/teacher'})
  assert.equal(preview.status,200);assert.equal(preview.body.status,'ready')
  assert.equal((await request({action:'adoption-apply',instanceId:instance.id,roleId:'teacher',sourceKey:'old/default/teacher',fingerprint:preview.body.fingerprint})).body.code,'confirmation-required')
  const apply=await request({action:'adoption-apply',instanceId:instance.id,roleId:'teacher',sourceKey:'old/default/teacher',fingerprint:preview.body.fingerprint,confirmed:true,sessionId:'forged',source:{sessionId:'forged'}})
  assert.equal(apply.status,200);assert.equal(apply.body.sessionId,'native-current');assert.deepEqual(apply.body.previousSessionIds,['native-history']);assert.equal(creates,0)
  assert.equal((await request({action:'inspect-legacy-source',appId:'reader',roleId:'teacher',sourceKey:'old/default/teacher'})).body.code,'invalid-action')
  assert.equal((await request({action:'resolve-session',sessionId:'native-current'})).body.code,'invalid-action')
  assert.equal((await request({action:'adoption-preview',instanceId:instance.id,roleId:'teacher',sourceKey:'forged-source'})).body.status,'blocked')
  ctx.sessionController.projections=async()=>({kind:'sequenced',values:{agentPreset:'changed-without-adoption'}})
  await assert.rejects(()=>roles.resolveSession('reader','native-history'),{code:'agent-changed'})
  assert.equal((await request({action:'adoption-preview',instanceId:instance.id,roleId:'teacher',sourceKey:'old/default/teacher'})).body.status,'blocked')
 }finally{if(activation?.value)await activation.value();await iterator?.return();await apps.close();await rm(dir,{recursive:true,force:true})}
})
