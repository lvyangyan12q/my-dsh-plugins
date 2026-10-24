import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {inspectLegacy} from '../src/legacy-inspection.mjs'
import {prepareLegacyAdoption} from '../src/legacy-adoption-plan.ts'
import {fixture} from './legacy-adoption-fixture.mjs'
test('pure concrete plan pins every source byte and keeps unproven lectures private with stable target IDs',async()=>{
 const home=await fixture();try{const {snapshot}=await inspectLegacy({home}),before=await readFile(join(home,'storages/kaogong_knowledge.json'));const plan=await prepareLegacyAdoption({snapshot,inspectRole:async()=>assert.fail('no roles in source')});assert.equal(plan.status,'ready');assert.notEqual(plan.targets.history.instanceId,plan.targets.library.instanceId);assert.equal(plan.records.find(row=>row.key==='private').target,'history');assert.equal(plan.privateKnowledgeIds.includes('private'),true);assert.equal(plan.records.filter(row=>row.target==='library'&&row.domain==='knowledge').length,0);assert.equal(plan.source.revision,snapshot.sourceRevision);assert.equal(plan.source.files.length,7);assert.equal(plan.fingerprint.length,64);assert.deepEqual(await readFile(join(home,'storages/kaogong_knowledge.json')),before);assert.equal(plan.rollback.mode,'journal-only-no-source-or-profile-restore')}finally{await rm(home,{recursive:true,force:true})}
})

test('malformed or lossy source values cannot produce an executable plan even when the offline container is valid',async()=>{
 const home=await fixture();try{const path=join(home,'storages/kaogong_knowledge.json'),data=JSON.parse(await readFile(path,'utf8'));data.tables.entries.private.futureField='must not be discarded';await writeFile(path,JSON.stringify(data));const {snapshot}=await inspectLegacy({home});await assert.rejects(prepareLegacyAdoption({snapshot,inspectRole:async()=>assert.fail('no roles')}),{code:'LEGACY_RECORD_UNSUPPORTED_OR_LOSSY'})}finally{await rm(home,{recursive:true,force:true})}
})

test('offline CLI writes a reviewable private business plan but remains explicitly native-blocked and cannot overwrite outputs',async()=>{
 const {spawnSync}=await import('node:child_process'),{mkdtemp}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{resolve}=await import('node:path'),{fileURLToPath}=await import('node:url');const home=await fixture(),output=await mkdtemp(join(tmpdir(),'kaogong-plan-output-'))
 try{
  const script=fileURLToPath(new URL('../scripts/preview-legacy-plan.mjs',import.meta.url)),plan=join(output,'preview.private.json'),preview=join(output,'preview.md'),args=['--import','tsx/esm',script,'--home',home,'--plan',plan,'--preview',preview]
  const result=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const summary=JSON.parse(result.stdout);assert.equal(summary.status,'offline-native-blocked');assert.equal(summary.formalApply,false);assert.doesNotMatch(result.stdout,/private evidence|unknown source/);const value=JSON.parse(await readFile(plan,'utf8'));assert.equal(value.private,true);assert.equal(value.status,'blocked');assert.ok(value.blockers.some(row=>row.code==='NATIVE_HOST_NOT_INSPECTED'));assert.doesNotMatch(await readFile(preview,'utf8'),/private evidence|unknown source/);const before=await readFile(plan);const duplicate=spawnSync(process.execPath,args,{encoding:'utf8'});assert.equal(duplicate.status,1);assert.match(duplicate.stderr,/PREVIEW_OUTPUT_EXISTS/);assert.deepEqual(await readFile(plan),before)
 }finally{await rm(home,{recursive:true,force:true});await rm(output,{recursive:true,force:true})}
})

test('plan canonical hashes use portable code-point key order rather than the machine locale',async()=>{
 const {canonical}=await import('../src/legacy-adoption-plan.ts')
 assert.equal(canonical({'中':3,a:2,Z:1}),' {"Z":1,"a":2,"中":3}'.trim())
})

test('trusted source evidence moves only exact raw lecture candidates to library and pins the evidence in the plan',async()=>{
 const {createHash}=await import('node:crypto'),home=await fixture()
 try{
  const path=join(home,'storages/kaogong_knowledge.json'),data=JSON.parse(await readFile(path,'utf8'))
  data.tables.entries.raw={...data.tables.entries.private,content:'original source',source:'source.pdf'}
  data.tables.entries.note={...data.tables.entries.private,kind:'笔记'}
  await writeFile(path,JSON.stringify(data));const {snapshot}=await inspectLegacy({home})
  const materialEvidence={sourceRevision:snapshot.sourceRevision,entries:[{id:'raw',sourceContentSha256:createHash('sha256').update('original source').digest('hex')}],evidenceHash:'trusted-host-only'}
  const plan=await prepareLegacyAdoption({snapshot,materialEvidence,inspectRole:async()=>assert.fail('no roles')})
  assert.equal(plan.records.find(row=>row.key==='raw').target,'library');assert.deepEqual(plan.privateKnowledgeIds,['private','note'])
  assert.equal(plan.assetEvidence.materials.evidenceHash,'trusted-host-only');assert.ok(plan.readOnlyGrants.some(row=>row.resourceId==='materials'))
  materialEvidence.entries[0].sourceContentSha256='changed';assert.notEqual(plan.assetEvidence.materials.entries[0].sourceContentSha256,'changed')
  await assert.rejects(prepareLegacyAdoption({snapshot,materialEvidence,inspectRole:async()=>assert.fail('no roles')}),{code:'LEGACY_MATERIAL_SOURCE_CHANGED'})
 }finally{await rm(home,{recursive:true,force:true})}
})
