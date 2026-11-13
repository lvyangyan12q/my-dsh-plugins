import test from 'node:test'
import assert from 'node:assert/strict'
import {registerTaskOwners} from '../src/task-owners.ts'

test('受管补讲保留本次意图且复核课堂证据、科目与快照',async()=>{
 const owners=new Map<string,any>(),records=new Map([['lesson-a',{instanceId:'p',request:{lessonId:'lesson-a',subject:'行测-资料分析',taskId:'task-a',materialIds:[]},quiz:[{questionId:'q1',section:'section-1',choice:0,correct:false}],notes:'服务端总结'}]])
 const state={instanceId:'p',lessonRecords:{get:(id:string)=>records.get(id)}}
 const dispose=registerTaskOwners({state:async(_id:string,run:any)=>run(state)} as never,{register:(kind:string,owner:any)=>{owners.set(kind,owner);return()=>{}}} as never,{get:()=>null,put:async()=>{}} as never,{call:async()=>{}} as never)
 try{
 const owner=owners.get('lesson'),context={instanceId:'p',viewId:'v',roleId:'teacher.data-analysis'}
 const plan=await owner.prepare(context,{lessonId:'lesson-a',intent:'请针对第1题我选A补讲',quizIntent:{questionId:'q1',section:'section-1',choice:0}})
 assert.match(plan.text,/请针对第1题我选A补讲/);assert.match(plan.text,/服务端总结/);assert.match(plan.text,/q1/)
 await assert.rejects(owner.prepare(context,{lessonId:'foreign',intent:'补讲'}),/unavailable/)
 await assert.rejects(owner.prepare(context,{lessonId:'lesson-a',quizIntent:{questionId:'foreign',section:'fake',choice:0}}),/quiz|检测/)
 await assert.rejects(owner.prepare({...context,roleId:'teacher'},{lessonId:'lesson-a'}),/role/)
 await owner.validate({instanceId:'p',preparation:{id:'lesson-a',token:plan.token}})
 records.get('lesson-a')!.notes='后来变化'
 await assert.rejects(owner.validate({instanceId:'p',preparation:{id:'lesson-a',token:plan.token}}),/changed/)
 }finally{await dispose()}
})
