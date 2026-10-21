import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {mountApplications} from '../01_content/src/framework/host.mjs'

test('authenticated Host route enforces managed upgrade admission and preserves unknown ledger bytes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-migration-http-')),routes=[],services={},effects=[];let admitted=false;
 const ctx={profileContext:{dir},connection:{admit:()=>admitted?{peer:{}}:{rejection:401}},inject:(keys,install)=>{if(keys.includes('profileContext')&&keys.includes('connection')&&keys.length===2)install(ctx)},provide:(name,value)=>{services[name]=value},effect:(factory,label)=>effects.push({factory,label}),webServer:{register:route=>{routes.push(route);return()=>{}}}};
 const call=async(path,body)=>{const route=routes.find(row=>row.path===path);assert.ok(route,'public route registered: '+path);const req=Readable.from([JSON.stringify(body)]);req.method='POST';req.headers={'content-type':'application/json',host:'localhost'};const res={writeHead(code){this.status=code},end(text){this.body=JSON.parse(text)}};await route.handler(req,res);return res};
 try{
  mountApplications(ctx);for(const effect of effects.filter(row=>row.label==='worktable authenticated migration API'))effect.factory();assert.equal((await call('/api/worktable/migrations',{action:'get',viewId:'absent'})).status,401);admitted=true;
  const apps=services.worktableApplications;let remove=await apps.contribute({id:'sample',title:'Sample',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const instance=await apps.createInstance('sample',null),view=await apps.createView(instance.id);
  services.worktableMigrations.contribute('sample',{applicationVersions:['1','2'],inspect:async()=>({dataVersion:'1',revision:'r1'}),plan:async()=>{throw Error('unsupported')},execute:async()=>assert.fail('no migration confirmed')});
  assert.equal((await call('/api/worktable/migrations',{action:'adopt',viewId:view.id,applicationVersion:'1',dataVersion:'1',dataRevision:'r1',confirmed:true})).status,200);
  remove();await apps.contribute({id:'sample',title:'Sample',version:'2',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});
  const before=await readFile(join(dir,'worktable-platform','applications.v1.json'),'utf8'),blocked=await call('/api/worktable/applications',{action:'create',appId:'sample'});assert.equal(blocked.status,409);assert.equal(blocked.body.code,'migration-required');assert.equal(await readFile(join(dir,'worktable-platform','applications.v1.json'),'utf8'),before);
  const future=JSON.stringify({schema:999,fromFuture:'preserve'}),ledger=join(dir,'worktable-platform','migrations.v1.json');await writeFile(ledger,future);const unknown=await call('/api/worktable/applications',{action:'create',appId:'sample'});assert.equal(unknown.status,503);assert.equal(unknown.body.code,'schema-incompatible');assert.equal(await readFile(ledger,'utf8'),future);assert.equal(await readFile(join(dir,'worktable-platform','applications.v1.json'),'utf8'),before);
 }finally{for(const effect of effects.filter(row=>row.label==='worktable: release application service'))await effect.factory()();await rm(dir,{recursive:true,force:true})}
})
