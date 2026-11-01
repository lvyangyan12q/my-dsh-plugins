import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createTeaching,createLearningDispatcher} from '../src/teaching.mjs'
import {createApplication} from '../src/application.mjs'
test('native teaching resumes the reserved session and refuses missing skills',async()=>{
 let state={instances:[{id:'one'}],bindings:[]},creates=0,available=true
 const sessions=new Map(),ctx={skills:{get:async()=>available?{provider:'personal-learning',invocation:{userInvocable:true}}:null},workspaceRegistry:{list:()=>[{id:'w',path:'D:/study'}]},sessionController:{create:async v=>{creates++;sessions.set(v.sessionId,v);return v}},sessionPersistence:{stat:async id=>sessions.get(id),flush:async()=>{}}}
 const storage={read:async()=>structuredClone(state),write:async s=>{state=structuredClone(s)}}
 const teacher=createTeaching(ctx,storage),request=createLearningDispatcher({app:createApplication(storage),teacher})
 available=false;await assert.rejects(teacher.open('one','w'),/技能/);assert.equal(creates,0)
 available=true;const first=await teacher.open('one','w');assert.equal((await createTeaching(ctx,storage).open('one','w')).sessionId,first.sessionId);assert.equal(creates,1)
 await assert.rejects(teacher.open('foreign','w'),/实例/)
 await Promise.all([request({action:'create',title:'Second',goal:'Another goal',priorKnowledge:''}),request({action:'teaching-open',instanceId:'one',workspaceId:'w'})])
 const recovered=await request();assert.equal(recovered.instances.length,2);assert.equal(recovered.bindings[0].sessionId,first.sessionId)
})
