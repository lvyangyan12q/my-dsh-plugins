import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createEvidence} from '../src/evidence.mjs'

const lab={
 version:1,
 parameters:[{id:'N',min:20,max:200,step:10,initial:100},{id:'B',min:1,max:100,step:1,initial:40},{id:'AB',min:0,max:40,step:1,initial:30}],
 readouts:[{id:'cond',label:'P(A|B)',numerator:'AB',denominator:'B'}],
 prediction:{question:'比例会变吗',options:[{id:'up',label:'变大'},{id:'same',label:'不变'}],correct:'up'},
 restate:{prompt:'说明分母为什么是 40',checks:[{id:'den',label:'分母',keywords:['分母']},{id:'narrow',label:'缩小',keywords:['缩小']},{id:'num',label:'40',keywords:['40']}]},
}

function fixture(){
 let state={instances:[{id:'i'}],courses:[{id:'c',instanceId:'i',version:1,title:'条件概率',html:'<h1>条件概率</h1>',lab}],evidence:[],requests:[],bindings:[]}
 const storage={read:async()=>structuredClone(state),write:async value=>{state=structuredClone(value)}}
 return {evidence:createEvidence(storage,{request:async()=>{throw Error('unused')}}),get state(){return state}}
}

test('prediction evidence records the host judgement',async()=>{
 const {evidence}=fixture()
 const right=await evidence.request({action:'evidence-save',instanceId:'i',courseId:'c',version:1,kind:'prediction',answer:'变大',optionId:'up'})
 assert.equal(right.correct,true)
 assert.equal(right.optionId,'up')
 assert.match(right.feedbackText,/对/)
 const wrong=await evidence.request({action:'evidence-save',instanceId:'i',courseId:'c',version:1,kind:'prediction',answer:'不变',optionId:'same'})
 assert.equal(wrong.correct,false)
})

test('prediction without an option and on a lab-less course is refused',async()=>{
 const {evidence,state}=fixture()
 await assert.rejects(evidence.request({action:'evidence-save',instanceId:'i',courseId:'c',version:1,kind:'prediction',answer:'变大'}),/选项/)
 state.courses[0].lab=null
 await assert.rejects(evidence.request({action:'evidence-save',instanceId:'i',courseId:'c',version:1,kind:'prediction',answer:'变大',optionId:'up'}),/没有预测/)
})

test('restate evidence keeps per-check results and never marks single answers as mastered',async()=>{
 const {evidence}=fixture()
 const partial=await evidence.request({action:'evidence-save',instanceId:'i',courseId:'c',version:1,kind:'explanation',answer:'因为分母变了'})
 assert.equal(partial.passed,false)
 assert.deepEqual(partial.checks.map(check=>[check.id,check.passed]),[['den',true],['narrow',false],['num',false]])
 const full=await evidence.request({action:'evidence-save',instanceId:'i',courseId:'c',version:1,kind:'explanation',answer:'分母从 100 缩小到 40'})
 assert.equal(full.passed,true)
})

test('completion requires a passed restate and is idempotent',async()=>{
 const {evidence}=fixture()
 await assert.rejects(evidence.request({action:'lab-complete',instanceId:'i',courseId:'c',version:1}),/复述/)
 await evidence.request({action:'evidence-save',instanceId:'i',courseId:'c',version:1,kind:'explanation',answer:'分母从 100 缩小到 40'})
 const first=await evidence.request({action:'lab-complete',instanceId:'i',courseId:'c',version:1})
 assert.equal(first.passed,true)
 const again=await evidence.request({action:'lab-complete',instanceId:'i',courseId:'c',version:1})
 assert.equal(again.id,first.id)
})
