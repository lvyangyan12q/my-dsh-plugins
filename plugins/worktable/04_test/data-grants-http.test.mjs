import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {mountResources} from '../01_content/src/framework/resource-host.mjs'
test('HTTP requires admission and deep view context, rejects owner-ID bypass, and defaults grants to read',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'grants-http-')),apps=new ApplicationDirectory(join(dir,'apps.json')),routes=[],effects=[];let resources,admitted=false,reads=0
 const ctx={profileContext:{dir},worktableApplications:apps,connection:{admit:()=>admitted?{peer:{}}:{rejection:403}},inject:(_names,install)=>install(ctx),provide:(_name,value)=>{resources=value},effect:install=>effects.push(install),webServer:{register:route=>{routes.push(route);return()=>{}}}}
 try{
  await apps.contribute({id:'reader',title:'Reader',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const a=await apps.createInstance('reader','A'),b=await apps.createInstance('reader','B'),av=await apps.createView(a.id),bv=await apps.createView(b.id)
  mountResources(ctx);for(const install of effects.slice())install();resources.register({appId:'reader',resourceId:'records',actions:['update'],read:id=>{reads++;return{owner:id}},mutate:async(id,action,payload,revision,authorize)=>{await authorize();return{owner:id,payload}}})
  async function call(body,split=false){const req=Readable.from(split?Array.from(Buffer.from(JSON.stringify(body))).map(byte=>Buffer.from([byte])):[JSON.stringify(body)]);req.method='POST';req.headers={'content-type':'application/json'};let status,value;await routes[0].handler(req,{writeHead:code=>{status=code},end:text=>{value=JSON.parse(text)}});return{status,value}}
  assert.equal((await call({operation:'snapshot'})).status,403);admitted=true
  assert.equal((await call({operation:'call',instanceId:a.id,resourceId:'records',action:'read'})).status,403)
  assert.equal((await call({operation:'call',viewId:bv.id,ownerInstanceId:a.id,resourceId:'records',action:'read'})).status,403)
  assert.equal((await call({operation:'call',viewId:bv.id,resourceId:'records',action:'read'})).value.value.owner,b.id)
  const beforeMetadata=reads;assert.equal((await call({operation:'connection',viewId:bv.id,ownerViewId:av.id,resourceId:'records'})).value.status,'none');assert.equal(reads,beforeMetadata)
  assert.equal((await call({operation:'connection',viewId:bv.id,ownerViewId:av.id,resourceId:'records',consumerInstanceId:a.id})).status,403)
  const grant=(await call({operation:'share',ownerViewId:av.id,consumerInstanceId:b.id,resourceId:'records',allowedActions:['read','update']})).value;assert.deepEqual(grant.allowedActions,['read'])
  const c=await apps.createInstance('reader','C'),cv=await apps.createView(c.id)
  assert.deepEqual((await call({operation:'connection',viewId:bv.id,ownerViewId:cv.id,resourceId:'records'})).value,{status:'different-source',connection:null})
  const selected=(await call({operation:'connection',viewId:bv.id,ownerViewId:av.id,resourceId:'records'})).value;assert.deepEqual(selected,{status:'active',connection:{id:grant.id,revision:1,allowedActions:['read'],status:'active'}});assert.equal(reads,beforeMetadata)
  assert.equal((await call({operation:'connection',viewId:av.id,ownerViewId:bv.id,resourceId:'records'})).value.status,'none')
  assert.equal((await call({operation:'connection',viewId:bv.id,ownerViewId:av.id,resourceId:'unrelated'})).value.status,'none')
  assert.equal((await call({operation:'call',viewId:bv.id,resourceId:'records',action:'update',expectedConnectionRevision:grant.revision})).status,403)
  await call({operation:'permissions',id:grant.id,revision:grant.revision,allowedActions:['read','update']});const chinese=await call({operation:'call',viewId:bv.id,resourceId:'records',action:'update',expectedConnectionRevision:2,payload:{text:'阅读资料完整'}},true);assert.equal(chinese.status,200);assert.equal(chinese.value.value.payload.text,'阅读资料完整');
  const revoked=await call({operation:'revoke',id:grant.id,revision:2});assert.equal(revoked.status,200);assert.deepEqual((await call({operation:'connection',viewId:bv.id,ownerViewId:av.id,resourceId:'records'})).value,{status:'revoked',connection:{id:grant.id,revision:3,status:'revoked',allowedActions:['read','update']}})
  await apps.register({id:'website',title:'Website',version:'1',protocolVersion:1,kind:'web',url:'https://example.com/'});const web=await apps.createInstance('website','W'),wv=await apps.createView(web.id);assert.equal((await call({operation:'connection',viewId:wv.id,ownerViewId:av.id,resourceId:'records'})).status,403)
  assert.equal((await call({operation:'call',viewId:wv.id,resourceId:'records',action:'read'})).status,403)
 }finally{await rm(dir,{recursive:true,force:true})}
})
