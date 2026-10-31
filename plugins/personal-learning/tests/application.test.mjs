import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createApplication} from '../src/application.mjs'

test('create a learning goal and recover it through a reopened application',async()=>{
 let saved={instances:[],lastInstanceId:null}
 const storage={read:async()=>structuredClone(saved),write:async value=>{saved=structuredClone(value)}}
 const app=createApplication(storage)
 const created=await app.request({action:'create',title:'概率',goal:'理解条件概率',priorKnowledge:'认识分数'})
 const reopened=createApplication(storage)
 const state=await reopened.request()
 assert.equal(state.lastInstanceId,created.id)
 assert.deepEqual(state.instances,[created])
 assert.equal(created.goal,'理解条件概率')
 await assert.rejects(app.request({action:'create',title:'',goal:'x',priorKnowledge:''}),/名称/)
 assert.equal((await app.request()).instances.length,1)
})
