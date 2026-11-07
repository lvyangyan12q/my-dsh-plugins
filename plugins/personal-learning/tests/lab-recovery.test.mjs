import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createContinuation} from '../src/continuation.mjs'
import {normalizeParameters} from '../src/lab-protocol.mjs'

const lab={version:1,parameters:[{id:'B',min:1,max:100,step:1,initial:40},{id:'N',min:20,max:200,step:10,initial:100}],readouts:[],prediction:null,restate:{prompt:'p',checks:[{id:'k',label:'k',keywords:['k']}]}}
const course={id:'c1',instanceId:'i',version:1,title:'条件概率',html:'<h1>条件概率</h1>',lab}

test('saved course and parameters survive a fresh continuation instance',async()=>{
 let state={instances:[{id:'i'},{id:'j'}],courses:[course],continuations:[]}
 const storage={read:async()=>structuredClone(state),write:async value=>{state=structuredClone(value)}}
 await createContinuation(storage).request({action:'continuation-save',instanceId:'i',courseId:'c1',parameters:{B:55,N:100}})
 const restarted=createContinuation(storage)
 const first=await restarted.request({action:'continuation-read',instanceId:'i'})
 assert.equal(first.position.courseId,'c1')
 assert.deepEqual(first.position.parameters,{B:55,N:100})
 const second=await restarted.request({action:'continuation-read',instanceId:'j'})
 assert.equal(second.position,null)
})

test('out-of-range parameters are refused before they reach storage',async()=>{
 let state={instances:[{id:'i'}],courses:[course],continuations:[]}
 const storage={read:async()=>structuredClone(state),write:async value=>{state=structuredClone(value)}}
 const continuation=createContinuation(storage)
 await assert.rejects(continuation.request({action:'continuation-save',instanceId:'i',courseId:'c1',parameters:{B:999}}),/越界/)
 assert.equal(state.continuations.length,0)
 assert.throws(()=>normalizeParameters(lab,{B:999}),/越界/)
})
