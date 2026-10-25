import assert from 'node:assert/strict'
import {test} from 'node:test'
import {writeFile,rm,readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fixture} from './legacy-adoption-fixture.mjs'
import {inspectMaterials} from '../src/materials-inspection.mjs'

test('materials inspection only captures bank and knowledge even if old learning and role stores are malformed',async()=>{
 const home=await fixture()
 try{
  for(const name of ['personal_workbench_role_bindings','kaogong_practice','kaogong_lessons','kaogong_progress','kaogong_notebook'])await writeFile(join(home,'storages',name+'.json'),'not valid JSON')
  const before=await readFile(join(home,'storages','kaogong_knowledge.json'))
  const {snapshot,summary}=await inspectMaterials({home})
  assert.deepEqual(snapshot.files.map(file=>file.name),['kaogong_bank','kaogong_knowledge'])
  assert.deepEqual(summary.counts,{bank:0,knowledge:1,notesRetainedAtSource:0})
  assert.equal(snapshot.format,'kaogong-material-inspection')
  assert.deepEqual(await readFile(join(home,'storages','kaogong_knowledge.json')),before)
 }finally{await rm(home,{recursive:true,force:true})}
})

import {prepareMaterialImport} from '../src/materials-plan.ts'
import {fingerprint} from '../src/legacy-adoption-plan.ts'
import {readAdoptedAsset} from '../src/adopted-assets.ts'
test('material-only plan preserves original answers and private lectures without adopting learning or granting anything',async()=>{
 const home=await fixture()
 try{
  const path=join(home,'storages','kaogong_bank.json'),bank=JSON.parse(await readFile(path,'utf8'))
  bank.tables.questions.q={subject:'行测-资料分析',knowledgePoint:'比例',questionType:'单选',stem:'合成题',options:['A.10','B.20'],correctAnswer:'B',explanation:'原解析',difficulty:'easy',source:'synthetic',origin:'local',reviewStatus:'approved',reviewNotes:'',tags:[],createdAt:'2020',reviewedAt:''}
  await writeFile(path,JSON.stringify(bank));await writeFile(join(home,'storages','personal_workbench_role_bindings.json'),'broken')
  const {snapshot}=await inspectMaterials({home}),plan=prepareMaterialImport({snapshot})
  assert.equal(plan.format,'kaogong-material-import-plan')
  assert.deepEqual(plan.records.map(row=>[row.domain,row.key]),[['bank','q'],['knowledge','private']])
  assert.equal(plan.records[0].value.correctAnswer,'B')
  assert.deepEqual(plan.privateKnowledgeIds,['private'])
  assert.equal(plan.target.appId,'kaogong-library')
  assert.equal(plan.source.files.find(file=>file.name==='kaogong_bank').bytes,(await readFile(path)).length)
  assert.equal(Object.hasOwn(plan,'roles'),false)
  assert.equal(Object.hasOwn(plan,'readOnlyGrants'),false)
 }finally{await rm(home,{recursive:true,force:true})}
})

import {MaterialImportWorkflow} from '../src/materials-import.ts'
test('explicit material import resumes a lost write receipt without copying any learning state or overwriting newer target rows',async()=>{
 const home=await fixture()
 try{
  const {snapshot}=await inspectMaterials({home}),plan=prepareMaterialImport({snapshot}),journal=new Map(),records=new Map(),privateIds=new Set();let puts=0,lost=true,readyChecks=0
  const key=(domain,id)=>domain+':'+id
  const services={store:{read:async id=>structuredClone(journal.get(id)??null),write:async row=>journal.set(row.id,structuredClone(row))},source:{verify:async()=>{readyChecks++}},target:{run:async(_target,operation)=>operation({entries:domain=>[...records].filter(([id])=>id.startsWith(domain+':')).map(([id,value])=>[id.slice(domain.length+1),value]),read:(domain,id)=>records.get(key(domain,id)),write:async(domain,id,value)=>{puts++;records.set(key(domain,id),structuredClone(value));if(lost){lost=false;throw Error('receipt lost')}}})},privacy:{mark:async(_instance,ids)=>ids.forEach(id=>privateIds.add(id))}}
  let workflow=new MaterialImportWorkflow(services);await workflow.remember(plan)
  await assert.rejects(workflow.apply({id:plan.id,fingerprint:plan.fingerprint,confirmed:false}),/CONFIRMATION/);assert.equal(records.size,0)
  await assert.rejects(workflow.apply({id:plan.id,fingerprint:plan.fingerprint,confirmed:true}),/receipt lost/)
  assert.equal((await workflow.inspect(plan.id)).status,'unknown');assert.equal(puts,1)
  await workflow.close();workflow=new MaterialImportWorkflow(services)
  await workflow.apply({id:plan.id,fingerprint:plan.fingerprint,confirmed:true});assert.equal((await workflow.inspect(plan.id)).status,'applied');assert.equal(puts,1);assert.deepEqual([...privateIds],['private'])
  records.set('knowledge:newer',{content:'keep this new row'})
  await workflow.apply({id:plan.id,fingerprint:plan.fingerprint,confirmed:true});assert.equal(puts,1);assert.equal(records.get('knowledge:newer').content,'keep this new row');assert.ok(readyChecks>0)
  await workflow.close()
 }finally{await rm(home,{recursive:true,force:true})}
})

test('material-only private image proof belongs to its own library and cannot be laundered through a share grant',async t=>{
 const home=await fixture();t.after(()=>rm(home,{recursive:true,force:true}));const {snapshot}=await inspectMaterials({home});let plan=prepareMaterialImport({snapshot}),calls=0
 const record=plan.records[0].value,reference='images/private.png'
 plan.assetEvidence={private:{entries:[{id:'private',jobId:'job',bindings:[{src:reference,asset:'stored.png',bindingKey:'bound'}]}]}};const {fingerprint:_,...body}=plan;plan={...body,fingerprint:fingerprint(body)}
 const readers={private:async value=>{calls++;assert.equal(value.access.kind,'private-material-library');return Buffer.from('private material')},material:()=>assert.fail('wrong reader'),bank:()=>assert.fail('wrong reader')}
 const resources={call:async()=>({value:{ownerInstanceId:plan.target.instanceId,revision:'same',rows:[['private',record]]},connection:{id:'forged-grant',revision:1}})}
 const input={kind:'knowledge',id:'private',reference,instanceId:plan.target.instanceId,viewId:'own',ownRecord:record,plans:[plan],resources,readers}
 assert.equal((await readAdoptedAsset(input)).toString(),'private material');assert.equal(calls,1)
 await assert.rejects(readAdoptedAsset({...input,instanceId:'foreign',ownRecord:undefined}),{code:'LEGACY_ASSET_UNAVAILABLE'});assert.equal(calls,1)
})
