import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile,rename,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {RoleDirectory,RoleStore} from '../01_content/src/framework/roles.mjs'
import {ProfileFileStore} from '../01_content/src/framework/persistence.mjs'
import {roleState} from '../01_content/src/framework/state-schema.mjs'

async function fixture(visit){
 const dir=await mkdtemp(join(tmpdir(),'worktable-adoption-'));let roles
 const apps=new ApplicationDirectory(join(dir,'apps.json'))
 await apps.contribute({id:'reader',title:'Reader',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
 const instance=await apps.createInstance('reader',null),other=await apps.createInstance('reader',null)
 let source={sourceKey:'legacy/default/teacher/math',revision:'legacy-r1',roleId:'teacher-math',sessionId:'old-current',presetId:'private.math',phase:'ready',creation:{cwd:dir},selectedPreset:true,previousSessions:[{sessionId:'old-history',presetId:'private.previous',creation:{cwd:dir}}]}
 let checks=0,creates=0
 const authority={validate:async()=>({presetId:'private.math'}),validateExisting:async row=>{checks++;return {sessionId:row.sessionId,presetId:row.presetId,cwd:row.creation.cwd,status:'current'}},validateLegacy:async row=>{checks++;return {sessionId:row.sessionId,presetId:row.presetId,cwd:row.creation.cwd,status:'current'}},create:async()=>{creates++;throw Error('adoption must never create')}}
 const open=async()=>{roles=new RoleDirectory(await RoleStore.open(join(dir,'roles.json')),apps,authority);roles.contribute('reader',[{id:'teacher-math',title:'Teacher',agent:{kind:'agent',source:'application',ownerAppId:'reader',id:'math'},creation:{cwd:dir}}]);return roles}
 const register=()=>roles.contributeLegacy('reader',{inspect:async key=>key===source.sourceKey?structuredClone(source):null})
 try{await open();await visit({get roles(){return roles},apps,instance,other,dir,authority,register,get source(){return source},set source(value){source=value},get creates(){return creates},get checks(){return checks},reopen:async()=>{await roles.dispose();await open();register()}})}finally{await roles?.dispose();await apps.close();await rm(dir,{recursive:true,force:true})}
}

test('owner preview is passive; confirmed adoption retains current and historical identities, selection and durable receipt',async()=>fixture(async f=>{
 f.register()
 const preview=await f.roles.previewAdoption(f.instance.id,'teacher-math',f.source.sourceKey)
 assert.equal(preview.status,'ready');assert.deepEqual(preview.blockers,[])
 assert.equal((await f.roles.read(f.instance.id,'teacher-math')).binding,null)
 await assert.rejects(()=>f.roles.applyAdoption(f.instance.id,'teacher-math',f.source.sourceKey,preview.fingerprint,false),{code:'confirmation-required'})
 const result=await f.roles.applyAdoption(f.instance.id,'teacher-math',f.source.sourceKey,preview.fingerprint,true)
 assert.equal(result.sessionId,'old-current');assert.equal(result.phase,'ready');assert.equal(result.selectedPreset,true)
 assert.deepEqual(result.previousSessionIds,['old-history'])
 assert.equal(result.historicalSessions[0].presetId,'private.previous');assert.equal(result.creation.cwd,f.dir)
 assert.equal(f.creates,0)
 await f.reopen()
 const recovered=await f.roles.applyAdoption(f.instance.id,'teacher-math',f.source.sourceKey,preview.fingerprint,true)
 assert.deepEqual(recovered,result);assert.equal(f.creates,0)
 assert.deepEqual(await f.roles.resolveSession('reader','old-history'),{appId:'reader',instanceId:f.instance.id,roleId:'teacher-math',sessionId:'old-history',kind:'history',readOnly:true})
 assert.deepEqual(await f.roles.resolveSession('reader','old-current'),{appId:'reader',instanceId:f.instance.id,roleId:'teacher-math',sessionId:'old-current',kind:'current',readOnly:false})
}))

test('source, target and owner changes invalidate a preview, and another instance cannot claim imported history',async()=>fixture(async f=>{
 const remove=f.register(),key=f.source.sourceKey
 let preview=await f.roles.previewAdoption(f.instance.id,'teacher-math',key)
 f.source={...f.source,revision:'legacy-r2'}
 await assert.rejects(()=>f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true),{code:'adoption-preview-changed'})
 assert.equal((await f.roles.read(f.instance.id,'teacher-math')).binding,null)
 preview=await f.roles.previewAdoption(f.instance.id,'teacher-math',key)
 await f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true)
 const denied=await f.roles.previewAdoption(f.other.id,'teacher-math',key)
 assert.equal(denied.status,'blocked');assert.equal(denied.blockers[0].code,'legacy-source-owned')
 await assert.rejects(()=>f.roles.resolveSession('reader','old-history',{access:'write'}),{code:'history-read-only'})
 await assert.rejects(()=>f.roles.resolveSession('other-app','old-current'),{code:'session-unbound'})
 await remove()
 const unavailable=await f.roles.previewAdoption(f.instance.id,'teacher-math',key)
 assert.equal(unavailable.blockers[0].code,'legacy-source-unavailable');assert.equal(f.creates,0)
}))

test('adopted metadata makes older schema readers fail closed without rewriting the file',async()=>fixture(async f=>{
 f.register();const key=f.source.sourceKey
 const preview=await f.roles.previewAdoption(f.instance.id,'teacher-math',key)
 await f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true)
 await f.roles.dispose()
 const path=join(f.dir,'roles.json'),before=await readFile(path,'utf8')
 const old=new ProfileFileStore(path,()=>{throw Error('never initialize')},roleState,[1])
 await assert.rejects(()=>old.ready(),{code:'schema-incompatible'});await old.close()
 assert.equal(await readFile(path,'utf8'),before)
}))

test('a source owner removed during native validation cannot commit adoption',async()=>fixture(async f=>{
 const remove=f.register(),key=f.source.sourceKey
 const preview=await f.roles.previewAdoption(f.instance.id,'teacher-math',key)
 let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve)
 f.authority.validateLegacy=async row=>{enter();await gate;return {sessionId:row.sessionId,presetId:row.presetId,cwd:row.creation.cwd,status:'current'}}
 const applying=f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true)
 await entered;const disposing=remove();release()
 await assert.rejects(()=>applying,{code:'legacy-source-unavailable'});await disposing
 assert.equal((await f.roles.read(f.instance.id,'teacher-math')).binding,null);assert.equal(f.creates,0)
}))

test('legacy intent and selection stay durable, cannot become a writable role or create a substitute',async()=>fixture(async f=>{
 f.source={...f.source,phase:'intent'};f.register();const key=f.source.sourceKey
 f.authority.validateLegacy=async row=>({sessionId:row.sessionId,presetId:row.presetId,cwd:row.creation.cwd,status:row.sessionId==='old-current'?'missing':'current'})
 const preview=await f.roles.previewAdoption(f.instance.id,'teacher-math',key)
 const adopted=await f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true)
 assert.equal(adopted.phase,'intent');assert.equal(adopted.creationAttempt,'started');assert.equal(adopted.selectedPreset,true)
 await assert.rejects(()=>f.roles.resolveSession('reader','old-current',{access:'write'}),{code:'role-not-ready'})
 await f.reopen();await assert.rejects(()=>f.roles.retry(f.instance.id,'teacher-math',adopted.sessionId,adopted.revision),{code:'creation-unknown'})
 assert.equal(f.creates,0)
}))

test('explicit replacement retains adopted history evidence and cannot later replay the old adoption over it',async()=>fixture(async f=>{
 f.register();const key=f.source.sourceKey
 const preview=await f.roles.previewAdoption(f.instance.id,'teacher-math',key)
 const adopted=await f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true)
 f.authority.create=async row=>row.sessionId
 const replacement=await f.roles.replace(f.instance.id,'teacher-math',adopted.sessionId,adopted.revision)
 assert.notEqual(replacement.sessionId,adopted.sessionId)
 const prior=await f.roles.resolveSession('reader','old-current')
 assert.equal(prior.kind,'history');assert.equal(prior.readOnly,true)
 await assert.rejects(()=>f.roles.resolveSession('reader','old-current',{access:'write'}),{code:'history-read-only'})
 await assert.rejects(()=>f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true),{code:'adoption-binding-changed'})
 assert.equal((await f.roles.read(f.instance.id,'teacher-math')).binding.sessionId,replacement.sessionId)
}))

test('a real filesystem failure before commit preserves the empty target and retries the same inspected identities',async()=>fixture(async f=>{
 f.register();const key=f.source.sourceKey,path=join(f.dir,'roles.json'),backup=path+'.saved'
 const preview=await f.roles.previewAdoption(f.instance.id,'teacher-math',key)
 const validate=f.authority.validateLegacy;let fault=true
 f.authority.validateLegacy=async row=>{const result=await validate(row);if(fault&&row.sessionId==='old-history'){fault=false;await rename(path,backup);await mkdir(path)}return result}
 try{await assert.rejects(()=>f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true),/状态|directory/)}finally{await rm(path,{recursive:true,force:true});await rename(backup,path)}
 assert.equal((await f.roles.read(f.instance.id,'teacher-math')).binding,null)
 const adopted=await f.roles.applyAdoption(f.instance.id,'teacher-math',key,preview.fingerprint,true)
 assert.equal(adopted.sessionId,'old-current');assert.equal(f.creates,0)
}))
