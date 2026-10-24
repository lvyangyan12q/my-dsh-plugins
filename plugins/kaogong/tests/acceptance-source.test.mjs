import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {inflateSync} from 'node:zlib'
import {stageAcceptanceSource} from '../scripts/acceptance-source-fixture.mjs'
import {inspectLegacy} from '../src/legacy-inspection.mjs'
import {prepareLegacyAdoption} from '../src/legacy-adoption-plan.ts'
import {inspectAdoptionEvidence} from '../src/adoption-evidence.ts'
import {safePracticeQuestion} from '../src/practice-rounds.ts'
import {legacyRoleSource} from '../src/legacy-adoption-owner.ts'
test('staged synthetic source is schema-valid, authored with 10 B answers and exact chart pixels, never certifies Native or PDF truth',async()=>{
 const parent=await mkdtemp(join(tmpdir(),'acceptance-source-'))
 try{
  const input={outputRoot:join(parent,'new-source'),sessionId:'unit-opaque-session-not-a-real-native-claim',presetId:'personal-workbench.kaogong-teacher.v1',cwd:parent,nativeKind:'sequenced'},receipt=await stageAcceptanceSource(input)
  assert.equal(receipt.nativeIdentity,'unverified-until-public-host-inspection');assert.equal(receipt.questionIds.length,10);assert.ok(Object.values(receipt.expectedAnswers).every(value=>value==='B'))
  const{snapshot}=await inspectLegacy({home:receipt.sourceHome}),evidence=await inspectAdoptionEvidence(snapshot,{materialRoot:receipt.materialRoot,questionImageRoot:receipt.questionImageRoot}),plan=await prepareLegacyAdoption({snapshot,materialEvidence:evidence.materials,inspectRole:async()=>({status:'blocked',fingerprint:null,blockers:[{code:'NATIVE_HOST_NOT_INSPECTED'}]})})
  assert.equal(plan.status,'blocked');assert.equal(plan.counts.bank,10);assert.equal(plan.counts.bankGuardEligibleApproved,10);assert.equal(plan.counts.knowledge,1);assert.equal(plan.counts.notebook,0);assert.equal(plan.counts.practice,0);assert.equal(plan.counts.lessons,0);assert.equal(plan.roles[0].roleId,'teacher.data-analysis');assert.equal(plan.roles[0].binding.sessionId,input.sessionId)
  const normalized=legacyRoleSource(snapshot,plan.roles[0].sourceKey,'teacher.data-analysis')
  assert.deepEqual(normalized.agent,{kind:'agent',source:'application',ownerAppId:'kaogong',id:'teacher'});assert.equal(normalized.sessionId,input.sessionId);assert.equal(normalized.presetId,input.presetId);assert.deepEqual(normalized.creation,{cwd:parent});assert.equal(normalized.selectedPreset,true)
  assert.deepEqual(evidence.materials.entries,[]);assert.deepEqual(evidence.private.entries,[]);assert.equal(evidence.bank.questions.length,10);assert.equal(evidence.bank.unavailable.length,0)
  for(const row of plan.records.filter(row=>row.domain==='bank'))assert.equal(safePracticeQuestion({id:row.key,...row.value}),true)
  const png=await readFile(join(receipt.questionImageRoot,'bars.png')),parts=[];let offset=8
  while(offset<png.length){const length=png.readUInt32BE(offset),type=png.toString('ascii',offset+4,offset+8);if(type==='IDAT')parts.push(png.subarray(offset+8,offset+8+length));offset+=length+12}
  const raw=inflateSync(Buffer.concat(parts)),pixel=(x,y)=>[...raw.subarray(y*(160*3+1)+1+x*3,y*(160*3+1)+1+x*3+3)]
  assert.deepEqual(pixel(40,60),[32,108,210]);assert.deepEqual(pixel(100,30),[235,126,34]);assert.deepEqual(pixel(40,30),[255,255,255]);assert.deepEqual(pixel(100,85),[255,255,255])
  const before=await readFile(join(receipt.sourceHome,'storages/kaogong_bank.json'));await assert.rejects(stageAcceptanceSource(input),{code:'EEXIST'});assert.deepEqual(await readFile(join(receipt.sourceHome,'storages/kaogong_bank.json')),before)
  await assert.rejects(stageAcceptanceSource({...input,outputRoot:join(parent,'unknown-kind'),nativeKind:'legacy'}),/EXPLICIT_REAL_NATIVE_FACTS_REQUIRED/)
  const custom=await stageAcceptanceSource({...input,outputRoot:join(parent,'custom-agent'),presetId:'custom.unmapped.preset'}),customSnapshot=(await inspectLegacy({home:custom.sourceHome})).snapshot
  const customPlan=await prepareLegacyAdoption({snapshot:customSnapshot,inspectRole:async()=>({status:'blocked',fingerprint:null,blockers:[{code:'legacy-agent-unmapped'}]})})
  assert.equal(legacyRoleSource(customSnapshot,customPlan.roles[0].sourceKey,'teacher.data-analysis').agent,undefined,'an unknown selected Native preset must never be inferred or replaced')
 }finally{await rm(parent,{recursive:true,force:true})}
})
