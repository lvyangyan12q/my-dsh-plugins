import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {rm} from 'node:fs/promises'
import {fixture} from './legacy-adoption-fixture.mjs'
import {inspectLegacy} from '../src/legacy-inspection.mjs'
import {prepareLegacyAdoption,fingerprint} from '../src/legacy-adoption-plan.ts'
import {readAdoptedAsset} from '../src/adopted-assets.ts'
const pin=plan=>{const{fingerprint:_,...body}=plan;return {...body,fingerprint:fingerprint(body)}}
async function sample(t){const home=await fixture();t.after(()=>rm(home,{recursive:true,force:true}));const{snapshot}=await inspectLegacy({home});return prepareLegacyAdoption({snapshot,inspectRole:()=>assert.fail('no roles')})}
test('private original image selectors cannot cross instance ownership or use a materials grant',async t=>{
 let plan=await sample(t),calls=0;const record=plan.records.find(row=>row.key==='private').value,reference='images/original.png'
 plan.assetEvidence={private:{entries:[{id:'private',jobId:'stored-job',bindings:[{src:reference,asset:'stored-asset',bindingKey:'stored-binding'}]}]}};plan=pin(plan)
 const readers={private:async value=>{calls++;assert.equal(value.jobId,'stored-job');assert.equal(value.asset,'stored-asset');assert.equal(value.bindingKey,'stored-binding');assert.deepEqual(value.currentRecord,record);return Buffer.from('private')},material:()=>assert.fail('wrong reader'),bank:()=>assert.fail('wrong reader')}
 const resources={call:async()=>({value:{revision:'1',ownerInstanceId:plan.targets.history.instanceId,rows:[['private',record]]},connection:{id:'fake-grant',revision:1}})}
 const own={kind:'knowledge',id:'private',reference,instanceId:plan.targets.history.instanceId,viewId:'view',ownRecord:record,plans:[plan],resources,readers}
 assert.equal((await readAdoptedAsset(own)).toString(),'private');assert.equal(calls,1)
 await assert.rejects(readAdoptedAsset({...own,instanceId:'foreign',ownRecord:undefined}),{code:'LEGACY_ASSET_UNAVAILABLE'});assert.equal(calls,1)
 await assert.rejects(readAdoptedAsset({...own,reference:'../../unrelated.png'}),{code:'LEGACY_ASSET_UNAVAILABLE'});assert.equal(calls,1)
 await assert.rejects(readAdoptedAsset({...own,ownRecord:{...record,content:'edited'}}),{code:'LEGACY_ASSET_UNAVAILABLE'});assert.equal(calls,1)
})
test('shared original bank references use their own grant and exact immutable binding, then reauthorize after bytes',async t=>{
 let plan=await sample(t),calls=0,reads=0,revoked=false;const record={stem:'![x](original.png)',answer:'B'}
 plan.records.push({domain:'bank',target:'library',key:'q',value:record,hash:fingerprint(record)});plan.assetEvidence={bank:{questions:[{questionId:'q',assets:[{asset:'closed/path.png',bindings:[{reference:'original.png',bindingKey:'opaque'}]}]}]}};plan=pin(plan)
 const resources={call:async({resourceId})=>{assert.equal(resourceId,'question-bank');reads++;if(revoked)throw Error('revoked');return{value:{revision:'1',ownerInstanceId:plan.targets.library.instanceId,rows:[['q',record]]},connection:{id:'bank-grant',revision:1}}}}
 const readers={bank:async value=>{calls++;assert.equal(value.questionId,'q');assert.equal(value.asset,'closed/path.png');assert.equal(value.bindingKey,'opaque');return Buffer.from('bank')},private:()=>assert.fail('wrong reader'),material:()=>assert.fail('wrong reader')}
 const input={kind:'bank',id:'q',reference:'original.png',instanceId:'consumer',viewId:'v',ownRecord:undefined,plans:[plan],resources,readers}
 assert.equal((await readAdoptedAsset(input)).toString(),'bank');assert.equal(reads,2)
 await assert.rejects(readAdoptedAsset({...input,reference:'other.png'}),{code:'LEGACY_ASSET_UNAVAILABLE'});assert.equal(calls,1)
 await assert.rejects(readAdoptedAsset({...input,readers:{...readers,bank:async value=>{await readers.bank(value);revoked=true;return Buffer.from('must not escape')}}}),/revoked/);assert.equal(calls,2)
})
test('raw material proof is not a private note grant and altered content or receipts refuse bytes',async t=>{
 let plan=await sample(t);const id='raw',reference='/api/kaogong/document-image?id=job&asset=images%2Fa.png',record={content:`![x](${reference})`,kind:'讲义'}
 plan.records.push({domain:'knowledge',target:'library',key:id,value:record,hash:fingerprint(record)});plan.assetEvidence={materials:{entries:[{id,jobId:'job',sourceContentSha256:createHash('sha256').update(record.content).digest('hex'),assets:[{asset:'images/a.png'}]}]}};plan=pin(plan)
 let revision=1,calls=0;const resources={call:async()=>({value:{revision:'same',ownerInstanceId:plan.targets.library.instanceId,rows:[[id,record]]},connection:{id:'materials',revision}})}
 const readers={material:async value=>{calls++;assert.equal(value.asset,'images/a.png');return Buffer.from('material')},bank:()=>assert.fail('wrong reader'),private:()=>assert.fail('wrong reader')}
 const input={kind:'knowledge',id,reference,instanceId:'consumer',viewId:'v',ownRecord:undefined,plans:[plan],resources,readers}
 assert.equal((await readAdoptedAsset(input)).toString(),'material')
 await assert.rejects(readAdoptedAsset({...input,readers:{...readers,material:async value=>{await readers.material(value);revision++;return Buffer.from('no')}}}),{code:'LEGACY_ASSET_UNAVAILABLE'})
 const tampered=structuredClone(plan);tampered.assetEvidence.materials.entries[0].jobId='other';await assert.rejects(readAdoptedAsset({...input,plans:[tampered]}),{code:'LEGACY_ASSET_UNAVAILABLE'});assert.equal(calls,2)
})
