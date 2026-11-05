import test from 'node:test'
import assert from 'node:assert/strict'
import {fixture} from './standalone-host-fixture.mjs'
test('learner explicitly maps authorized raw lecture without changing original classification',async()=>{
 const app=await fixture();try{
 const create=async title=>(await app.request('/api/kaogong/study',{action:'create',kind:'learner',title,confirmed:true})).value
 const learner=await create('映射'),other=await create('隔离'),view=learner.view.id
 await app.seedKnowledge(learner.profile.id,{raw:{subject:'行测-资料分析',knowledgePoint:'',title:'原始讲义',content:'增长率等于增长量除以基期量',kind:'讲义',source:'明确合成',tags:[],createdAt:'2026-11-05',updatedAt:'2026-11-05'}})
 const path='/api/kaogong/material-points?viewId='+view,preview=await app.request(path)
 assert.equal(preview.status,200);assert.equal(preview.value.materials.length,1)
 const candidate=preview.value.materials[0],body={action:'confirm',materialId:'raw',pointId:'kg-point-047',fingerprint:candidate.fingerprint,confirmed:true}
 assert.equal((await app.request(path,{...body,confirmed:false})).status,409)
 assert.equal((await app.request(path,{...body,fingerprint:'changed'})).status,409)
 assert.equal((await app.request(path,body)).status,200);assert.equal((await app.request(path,body)).status,200)
 assert.equal((await app.request('/api/kaogong/route?viewId='+view)).value.points.find(p=>p.id==='kg-point-047').materials.length,1)
 assert.equal((await app.request('/api/kaogong/route?viewId='+other.view.id)).value.points.find(p=>p.id==='kg-point-047').materials.length,0)
 const knowledge=(await app.request('/api/kaogong/knowledge?viewId='+view)).value
 assert.equal(JSON.stringify(knowledge).includes('增长-增长率'),false)
 assert.equal((await app.request(path,{action:'remove',materialId:'raw',pointId:'kg-point-047',confirmed:true})).status,200)
 assert.equal((await app.request('/api/kaogong/route?viewId='+view)).value.points.find(p=>p.id==='kg-point-047').materials.length,0)
 }finally{await app.close()}
})
test('shared raw mapping survives restart but rechecks grant, owner, and reference content',async()=>{
 let app=await fixture();try{
 const create=async(kind,title)=>(await app.request('/api/kaogong/study',{action:'create',kind,title,confirmed:true})).value
 const library=await create('library','来源'),learner=await create('learner','学习'),otherLibrary=await create('library','不同来源'),view=learner.view.id
 const raw={subject:'行测-资料分析',knowledgePoint:'',title:'原始资料',content:'原始增长率说明',kind:'讲义',source:'合成原始资料',tags:[],createdAt:'2026-11-05',updatedAt:'2026-11-05'}
 await app.seedKnowledge(library.profile.id,{raw});await app.seedKnowledge(otherLibrary.profile.id,{raw:{...raw,content:'另一来源不能自动承接'}})
 const share=async ownerViewId=>(await app.request('/api/kaogong/study',{action:'source-share',viewId:view,ownerViewId,resourceId:'materials'})).value
 const grant=await share(library.view.id),url='/api/kaogong/material-points?viewId='+view
 const candidate=(await app.request(url)).value.materials[0]
 assert.equal((await app.request(url,{action:'confirm',materialId:'raw',pointId:'kg-point-047',fingerprint:candidate.fingerprint,confirmed:true})).status,200)
 const recall='/api/kaogong/recall?viewId='+view,row=(await app.request(recall,{action:'enroll',pointId:'kg-point-047',confirmed:true})).value
 await app.request(recall,{action:'answer',pointId:row.pointId,cycleId:row.cycleId,recall:'增长量除基期',earlyConfirmed:true})
 const reveal={action:'reveal',pointId:row.pointId,cycleId:row.cycleId},confirm={action:'confirm',pointId:row.pointId,cycleId:row.cycleId,rating:'remembered',confirmed:true}
 assert.equal((await app.request(recall,reveal)).value.references[0].content,raw.content)
 const root=await app.suspend();app=await fixture({root})
 assert.equal((await app.request(url)).value.mappings.length,1)
 await app.seedKnowledge(library.profile.id,{raw:{...raw,content:'变更后的增长率说明'}})
 assert.equal((await app.request(recall,confirm)).status,409)
 assert.equal((await app.request(recall,reveal)).value.references[0].content,'变更后的增长率说明')
 await app.request('/api/kaogong/study',{action:'source-revoke',viewId:view,id:grant.id,revision:grant.revision})
 const revoked=(await app.request(url)).value;assert.equal(revoked.materials.length,0);assert.equal(revoked.mappings[0].available,false)
 assert.equal(JSON.stringify((await app.request(recall)).value).includes('变更后的增长率说明'),false)
 assert.equal((await app.request(recall,confirm)).status,409)
 await share(otherLibrary.view.id)
 assert.equal((await app.request('/api/kaogong/route?viewId='+view)).value.points.find(p=>p.id===row.pointId).materials.length,0)
 }finally{await app.close()}
})
