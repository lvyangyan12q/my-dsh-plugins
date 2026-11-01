import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequests} from '../src/requests.mjs'
test('prepare edit and explicitly send once; foreign instances and unknown replay rejected',async()=>{
 let state={instances:[{id:'a',goal:'probability',priorKnowledge:'fractions'}],bindings:[{instanceId:'a',sessionId:'s',phase:'ready'}]},sent=[]
 const api=createRequests({sessionPersistence:{stat:async()=>({})},sessionController:{prompt:async p=>{sent.push(p);return {accepted:true}}}}, {read:async()=>structuredClone(state),write:async s=>{state=structuredClone(s)}})
 const draft=await api.request({action:'request-prepare',instanceId:'a',text:'Explain',sources:[{title:'Book',url:'https://example.org',text:'excerpt'}]})
 assert.equal(sent.length,0)
 const edit=await api.request({action:'request-edit',instanceId:'a',id:draft.id,revision:1,text:'Explain simply',sources:[]})
 await assert.rejects(api.request({action:'request-send',instanceId:'foreign',id:draft.id,revision:edit.revision}),/归属/)
 await api.request({action:'request-send',instanceId:'a',id:draft.id,revision:edit.revision})
 assert.equal((await api.request({action:"request-list",instanceId:"a"}))[0].status,"accepted");assert.equal(sent.length,1);assert.match(sent[0].content[0].text,/Explain simply/);assert.doesNotMatch(sent[0].content[0].text,/excerpt/)
 await assert.rejects(api.request({action:'request-send',instanceId:'a',id:draft.id,revision:edit.revision}),/变化/)
})
