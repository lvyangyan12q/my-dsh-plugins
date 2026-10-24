import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {RoleDirectory,RoleStore} from '../01_content/src/framework/roles.mjs'
import {createRoleAuthority} from '../01_content/src/framework/role-native.mjs'

async function fixture(visit){
 const dir=await mkdtemp(join(tmpdir(),'history-adoption-')),apps=new ApplicationDirectory(join(dir,'apps.json'))
 await apps.contribute({id:'reader',title:'Reader',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
 const instance=await apps.createInstance('reader',null),other=await apps.createInstance('reader',null)
 const source={sourceKey:'legacy/teacher',revision:'r1',roleId:'teacher',sessionId:'current',presetId:'current-preset',phase:'ready',selectedPreset:true,creation:{cwd:dir},previousSessionIds:['history']}
 const native=new Map([['current',{cwd:dir,preset:'current-preset'}],['history',{cwd:dir,preset:'historical-preset'}]])
 const ctx={workspaceRegistry:{list:()=>[{id:'workspace',path:dir,sessionIds:['current','history']}]},sessionPersistence:{stat:async id=>{const row=native.get(id);return row&&{header:{id,cwd:row.cwd},formatStatus:row.formatStatus??'current'}}},sessionController:{projections:async({sessionId})=>{const row=native.get(sessionId);return row&&{kind:row.kind??'sequenced',values:{agentPreset:row.preset}}}}}
 const roles=new RoleDirectory(await RoleStore.open(join(dir,'roles.json')),apps,createRoleAuthority(ctx,{validateRole:async()=>({presetId:'current-preset'})}))
 roles.contribute('reader',[{id:'teacher',title:'Teacher',agent:{kind:'agent',source:'application',ownerAppId:'reader',id:'teacher'},creation:{cwd:dir}}])
 roles.contributeLegacy('reader',{inspect:async()=>structuredClone(source)})
 const preview=()=>roles.previewAdoption(instance.id,'teacher',source.sourceKey)
 const apply=p=>roles.applyAdoption(instance.id,'teacher',source.sourceKey,p.fingerprint,true)
 try{await visit({dir,roles,instance,other,source,native,ctx,preview,apply})}finally{await roles.dispose();await apps.close();await rm(dir,{recursive:true,force:true})}
}

test('raw historical IDs hydrate their own native preset before preview and durable adoption',async()=>fixture(async f=>{
 const p=await f.preview();assert.equal(p.status,'ready')
 assert.deepEqual(p.source.previousSessions,[{sessionId:'history',presetId:'historical-preset',creation:{cwd:f.dir}}])
 const row=await f.apply(p);assert.equal(row.historicalSessions[0].presetId,'historical-preset');assert.equal(row.selectedPreset,true)
 assert.equal((await f.roles.previewAdoption(f.other.id,'teacher',f.source.sourceKey)).blockers[0].code,'legacy-source-owned')
 assert.equal((await f.roles.resolveSession('reader','history')).readOnly,true)
}))

for(const [name,change,code] of [
 ['missing history',f=>f.native.delete('history'),'session-missing'],
 ['migration pending',f=>{f.native.get('history').formatStatus='migration-required'},'session-migration-required'],
 ['unknown projection',f=>{f.native.get('history').kind='unknown'},'session-migration-required'],
 ['unknown preset',f=>{f.native.get('history').preset=undefined},'native-identity'],
 ['unknown directory',f=>{f.native.get('history').cwd=undefined},'native-identity'],
 ['conflicting workspace',f=>{f.ctx.workspaceRegistry.list=()=>[{id:'a',path:f.dir,sessionIds:['current','history']},{id:'b',path:f.dir,sessionIds:['history']}]},'native-conflict'],
 ['duplicate historical IDs',f=>{f.source.previousSessionIds=['history','history']},'legacy-history-invalid'],
 ['current repeated as history',f=>{f.source.previousSessionIds=['current']},'legacy-history-invalid']
])test(`raw history refuses ${name} without persisting a binding`,async()=>fixture(async f=>{
 change(f);const p=await f.preview();assert.equal(p.status,'blocked');assert.equal(p.blockers[0].code,code)
 assert.equal((await f.roles.read(f.instance.id,'teacher')).binding,null)
}))

for(const [name,change,code] of [
 ['preset changed',f=>{f.native.get('history').preset='changed'},'adoption-preview-changed'],
 ['missing history',f=>f.native.delete('history'),'session-missing'],
 ['workspace membership lost',f=>{f.ctx.workspaceRegistry.list=()=>[{id:'workspace',path:f.dir,sessionIds:['current']}]},'workspace-membership']
])test(`apply revalidates raw history when ${name} after preview`,async()=>fixture(async f=>{
 const p=await f.preview();assert.equal(p.status,'ready');change(f)
 await assert.rejects(()=>f.apply(p),{code});assert.equal((await f.roles.read(f.instance.id,'teacher')).binding,null)
}))

test('full historical identity snapshots remain compatible and conflicting supplied facts fail closed',async()=>fixture(async f=>{
 f.source.previousSessions=[{sessionId:'history',presetId:'historical-preset',creation:{cwd:f.dir}}]
 delete f.source.previousSessionIds
 const p=await f.preview();assert.equal(p.status,'ready')
 const row=await f.apply(p);assert.equal(row.historicalSessions[0].presetId,'historical-preset')
 f.source.previousSessionIds=['history'];f.source.previousSessions[0].presetId='current-preset'
 assert.equal((await f.preview()).blockers[0].code,'legacy-history-invalid')
}))

test('supplying divergent raw and complete history lists is rejected even when complete list is empty',async()=>fixture(async f=>{
 f.source.previousSessions=[]
 assert.equal((await f.preview()).blockers[0]?.code,'legacy-history-invalid')
}))

test('history keeps its own registered directory instead of the current role directory',async()=>fixture(async f=>{
 const historic=join(f.dir,'past');f.native.get('history').cwd=historic
 f.ctx.workspaceRegistry.list=()=>[{id:'current-workspace',path:f.dir,sessionIds:['current']},{id:'past-workspace',path:historic,sessionIds:['history']}]
 const p=await f.preview();assert.equal(p.status,'ready');assert.equal(p.source.previousSessions[0].creation.cwd,historic)
 assert.equal((await f.apply(p)).historicalSessions[0].creation.cwd,historic)
}))
