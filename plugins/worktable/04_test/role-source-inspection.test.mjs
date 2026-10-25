import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {RoleDirectory,RoleStore} from '../01_content/src/framework/roles.mjs'
import {createRoleAuthority} from '../01_content/src/framework/role-native.mjs'

async function fixture(visit){
 const dir=await mkdtemp(join(tmpdir(),'source-inspection-')),apps=new ApplicationDirectory(join(dir,'apps.json'))
 await apps.contribute({id:'reader',title:'Reader',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
 const legacyCwd=join(dir,'legacy'),defaultCwd=join(dir,'new'),historyCwd=join(dir,'previous')
 const source={sourceKey:'legacy/teacher',revision:'r1',roleId:'teacher',sessionId:'current',presetId:'teacher-preset',phase:'ready',selectedPreset:true,creation:{cwd:legacyCwd},previousSessionIds:['history']}
 const native=new Map([['current',{cwd:legacyCwd,preset:'teacher-preset'}],['history',{cwd:historyCwd,preset:'past-preset'}]])
 const workspace=[{id:'old',path:legacyCwd,sessionIds:['current']},{id:'past',path:historyCwd,sessionIds:['history']}]
 let creates=0,sourceCalls=0,targetCalls=0
 const ctx={workspaceRegistry:{list:()=>workspace},sessionPersistence:{stat:async id=>{const row=native.get(id);return row&&{header:{id,cwd:row.cwd},formatStatus:'current'}},flush:async()=>{}},sessionController:{create:async()=>{creates++;throw Error('must not create')},projections:async({sessionId})=>{const row=native.get(sessionId);return row&&{kind:'sequenced',values:{agentPreset:row.preset}}}}}
 const authority=createRoleAuthority(ctx,{validateRole:async()=>({presetId:'teacher-preset'})})
 const roles=new RoleDirectory(await RoleStore.open(join(dir,'roles.json')),apps,authority)
 roles.contribute('reader',[{id:'teacher',title:'Teacher',agent:{kind:'agent',source:'application',ownerAppId:'reader',id:'teacher'},creation:{cwd:defaultCwd}}])
 const owner={inspectSource:async(key,target)=>{sourceCalls++;assert.deepEqual(target,{roleId:'teacher'});return structuredClone(source)},inspect:async()=>{targetCalls++;return structuredClone(source)}}
 const remove=roles.contributeLegacy('reader',owner)
 const inspect=()=>roles.inspectLegacySource('reader','teacher',source.sourceKey)
 try{await visit({dir,apps,roles,native,workspace,source,owner,remove,inspect,legacyCwd,defaultCwd,get creates(){return creates},get sourceCalls(){return sourceCalls},get targetCalls(){return targetCalls}})}finally{await roles.dispose();await apps.close();await rm(dir,{recursive:true,force:true})}
}

test('host-only source inspection validates native facts before any target exists and leaves both stores unchanged',async()=>fixture(async f=>{
 const files=['apps.json','roles.json'],before=await Promise.all(files.map(name=>readFile(join(f.dir,name),'utf8')))
 const p=await f.inspect();assert.equal(p.status,'ready');assert.match(p.fingerprint,/^[a-f0-9]{64}$/)
 assert.equal(p.source.creation.cwd,f.legacyCwd);assert.equal(p.source.previousSessions[0].presetId,'past-preset')
 assert.equal((await f.inspect()).fingerprint,p.fingerprint)
 assert.equal((await f.apps.snapshot()).instances.length,0);assert.equal(f.creates,0);assert.equal(f.sourceCalls,2);assert.equal(f.targetCalls,0)
 assert.deepEqual(await Promise.all(files.map(name=>readFile(join(f.dir,name),'utf8'))),before)
}))

test('trusted adoption keeps validated legacy cwd for reads, ensure, open and tool resolution',async()=>fixture(async f=>{
 const inspected=await f.inspect(),instance=await f.apps.createInstance('reader',null)
 const preview=await f.roles.previewAdoption(instance.id,'teacher',f.source.sourceKey)
 assert.equal(preview.status,'ready');assert.equal(preview.sourceFingerprint,inspected.fingerprint)
 const row=await f.roles.applyAdoption(instance.id,'teacher',f.source.sourceKey,preview.fingerprint,true)
 assert.equal(row.creation.cwd,f.legacyCwd)
 assert.equal((await f.roles.read(instance.id,'teacher')).unavailable,null)
 assert.equal((await f.roles.ensure(instance.id,'teacher')).creation.cwd,f.legacyCwd)
 assert.deepEqual(await f.roles.open(instance.id,'teacher',row.sessionId,row.revision),{sessionId:'current'})
 assert.equal((await f.roles.resolveSession('reader','current')).kind,'current')
 assert.equal((await f.roles.resolveSession('reader','history')).kind,'history')
 assert.deepEqual(await f.roles.applyAdoption(instance.id,'teacher',f.source.sourceKey,preview.fingerprint,true),row)
 const other=await f.apps.createInstance('reader',null)
 assert.equal((await f.roles.previewAdoption(other.id,'teacher',f.source.sourceKey)).blockers[0].code,'legacy-source-owned')
 await assert.rejects(()=>f.roles.ensure(other.id,'teacher'),{code:'workspace-unavailable'})
 await assert.rejects(()=>f.roles.replace(instance.id,'teacher',row.sessionId,row.revision),{code:'workspace-unavailable'})
 assert.equal(f.creates,0)
}))

test('source and native changes invalidate the pure inspection fingerprint and old target preview',async()=>fixture(async f=>{
 const original=await f.inspect();f.source.revision='r2'
 const changed=await f.inspect();assert.notEqual(changed.fingerprint,original.fingerprint)
 const instance=await f.apps.createInstance('reader',null),preview=await f.roles.previewAdoption(instance.id,'teacher',f.source.sourceKey)
 assert.equal(preview.sourceFingerprint,changed.fingerprint)
 f.native.get('history').preset='new-history-preset'
 const changedNative=await f.inspect();assert.notEqual(changedNative.fingerprint,changed.fingerprint)
 await assert.rejects(()=>f.roles.applyAdoption(instance.id,'teacher',f.source.sourceKey,preview.fingerprint,true),{code:'adoption-preview-changed'})
 assert.equal((await f.roles.read(instance.id,'teacher')).binding,null)
}))

test('missing ready blocks inspection; missing legacy intent preserves cwd and unknown outcome without creating',async()=>fixture(async f=>{
 f.native.delete('current')
 assert.equal((await f.inspect()).blockers[0].code,'session-missing')
 f.source.phase='intent'
 const inspection=await f.inspect();assert.equal(inspection.status,'ready');assert.equal(inspection.native[0].status,'missing')
 const instance=await f.apps.createInstance('reader',null),preview=await f.roles.previewAdoption(instance.id,'teacher',f.source.sourceKey)
 const row=await f.roles.applyAdoption(instance.id,'teacher',f.source.sourceKey,preview.fingerprint,true)
 assert.equal(row.phase,'intent');assert.equal(row.creation.cwd,f.legacyCwd);assert.equal(row.selectedPreset,true)
 await assert.rejects(()=>f.roles.retry(instance.id,'teacher',row.sessionId,row.revision),{code:'creation-unknown'})
 assert.equal(f.creates,0)
 f.native.set('current',{cwd:f.legacyCwd,preset:'teacher-preset'})
 const recovered=await f.roles.retry(instance.id,'teacher',row.sessionId,row.revision)
 assert.equal(recovered.phase,'ready');assert.equal(recovered.creation.cwd,f.legacyCwd);assert.equal(f.creates,0)
}))

test('only registered app/role source owners may inspect; old target-only owner has no implicit source fallback',async()=>fixture(async f=>{
 assert.equal((await f.roles.inspectLegacySource('other','teacher',f.source.sourceKey)).status,'blocked')
 assert.equal((await f.roles.inspectLegacySource('reader','other',f.source.sourceKey)).blockers[0].code,'role-unavailable')
 delete f.owner.inspectSource
 assert.equal((await f.inspect()).blockers[0].code,'legacy-source-unavailable');assert.equal(f.targetCalls,0)
 const instance=await f.apps.createInstance('reader',null)
 assert.equal((await f.roles.previewAdoption(instance.id,'teacher',f.source.sourceKey)).status,'ready')
 await f.remove();assert.equal((await f.inspect()).blockers[0].code,'legacy-source-unavailable')
}))

test('owner revocation during source read blocks a source inspection without writing',async()=>fixture(async f=>{
 let enter,release;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve)
 const original=f.owner.inspectSource;f.owner.inspectSource=async(...args)=>{enter();await gate;return original(...args)}
 const checking=f.inspect();await entered;const removed=f.remove();release()
 assert.equal((await checking).blockers[0].code,'legacy-source-unavailable');await removed
 assert.equal((await f.apps.snapshot()).instances.length,0);assert.equal(f.creates,0)
}))

test('planned target preflight rejects existing foreign ownership before creating any target and permits same-target recovery',async()=>fixture(async f=>{
 const {randomUUID}=await import('node:crypto'),original=await f.inspect(),owner=await f.apps.createInstance('reader',null)
 const preview=await f.roles.previewAdoption(owner.id,'teacher',f.source.sourceKey)
 await f.roles.applyAdoption(owner.id,'teacher',f.source.sourceKey,preview.fingerprint,true)
 const files=['apps.json','roles.json'],before=await Promise.all(files.map(name=>readFile(join(f.dir,name),'utf8')))
 const planned=randomUUID(),blocked=await f.roles.inspectLegacySource('reader','teacher',f.source.sourceKey,{instanceId:planned})
 assert.equal(blocked.status,'blocked');assert.equal(blocked.blockers[0].code,'legacy-source-owned')
 const resumed=await f.roles.inspectLegacySource('reader','teacher',f.source.sourceKey,{instanceId:owner.id})
 assert.equal(resumed.status,'ready');assert.equal(resumed.fingerprint,original.fingerprint)
 assert.equal((await f.apps.snapshot()).instances.length,1)
 assert.deepEqual(await Promise.all(files.map(name=>readFile(join(f.dir,name),'utf8'))),before)
}))

for(const ownedSession of ['current','history'])test(`planned source preflight rejects ${ownedSession} already held by a normal foreign application role`,async()=>fixture(async f=>{
 const cwd=ownedSession==='current'?f.legacyCwd:join(f.dir,'previous')
 if(ownedSession==='history')f.native.get('history').preset='teacher-preset'
 await f.apps.contribute({id:'foreign',title:'Foreign',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
 f.roles.contribute('foreign',[{id:'teacher',title:'Private foreign teacher',agent:{kind:'agent',source:'managed',id:'teacher'},creation:{cwd}}])
 const owner=await f.apps.createInstance('foreign',null)
 await f.roles.attach(owner.id,'teacher',ownedSession,null,0)
 const before=await readFile(join(f.dir,'roles.json'),'utf8'),{randomUUID}=await import('node:crypto')
 const blocked=await f.roles.inspectLegacySource('reader','teacher',f.source.sourceKey,{instanceId:randomUUID()})
 assert.equal(blocked.status,'blocked');assert.equal(blocked.blockers[0].code,'session-owned')
 assert.doesNotMatch(JSON.stringify(blocked),/Private foreign teacher|foreign/)
 assert.equal((await f.apps.snapshot()).instances.length,1)
 assert.equal(await readFile(join(f.dir,'roles.json'),'utf8'),before);assert.equal(f.creates,0)
}))
