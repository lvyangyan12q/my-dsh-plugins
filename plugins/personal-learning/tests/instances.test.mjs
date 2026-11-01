import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createApplication} from '../src/application.mjs'

test('switch and reopen independent instances without creating a new instance per view',async()=>{
 let saved={instances:[],lastInstanceId:null}
 const storage={read:async()=>structuredClone(saved),write:async value=>{saved=structuredClone(value)}}
 const app=createApplication(storage)
 const first=await app.request({action:'create',title:'概率',goal:'理解概率',priorKnowledge:'分数'})
 const second=await app.request({action:'create',title:'绘画',goal:'学习透视',priorKnowledge:'素描'})
 assert.equal((await app.request({action:'open',instanceId:first.id})).id,first.id)
 const anotherView=createApplication(storage)
 assert.equal((await anotherView.request()).lastInstanceId,first.id)
 assert.equal((await anotherView.request({action:'open',instanceId:second.id})).goal,'学习透视')
 assert.deepEqual((await app.request()).instances,[first,second])
 await assert.rejects(app.request({action:'open',instanceId:'missing'}),/不存在/)
 assert.equal((await app.request()).lastInstanceId,second.id)
})
