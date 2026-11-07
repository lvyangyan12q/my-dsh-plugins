import {test} from 'node:test'
import assert from 'node:assert/strict'
import {checkRestate,computeReadouts,judgePrediction,normalizeParameters,validateLab} from '../src/lab-protocol.mjs'

export const lab={
 version:1,
 parameters:[
  {id:'N',label:'样本 N',min:20,max:200,step:10,initial:100},
  {id:'B',label:'B 的数量',min:1,max:100,step:1,initial:40},
  {id:'AB',label:'A∩B',min:0,max:40,step:1,initial:30},
 ],
 readouts:[
  {id:'joint',label:'P(A∩B)',numerator:'AB',denominator:'N'},
  {id:'cond',label:'P(A|B)',numerator:'AB',denominator:'B'},
 ],
 prediction:{question:'把范围缩到 B，A 占的比例会——',options:[{id:'up',label:'变大',feedback:'对：分母变小。'},{id:'same',label:'不变'}],correct:'up'},
 restate:{prompt:'用自己的话说明为什么分母变成 40',checks:[{id:'den',label:'提到分母',keywords:['分母']},{id:'narrow',label:'提到缩小范围',keywords:['缩小','范围']},{id:'num',label:'提到 40',keywords:['40']}]},
}

test('accepts a complete lab protocol',()=>{assert.equal(validateLab(lab),true)})

test('rejects protocols that would render a broken lab',()=>{
 assert.throws(()=>validateLab({...lab,version:2}),/版本/)
 assert.throws(()=>validateLab({...lab,parameters:[]}),/参数/)
 assert.throws(()=>validateLab({...lab,parameters:[{...lab.parameters[0],initial:999}]}),/初值/)
 assert.throws(()=>validateLab({...lab,readouts:[{id:'x',numerator:'AB',denominator:'missing'}]}),/不存在/)
 assert.throws(()=>validateLab({...lab,prediction:{...lab.prediction,correct:'nope'}}),/正确项/)
 assert.throws(()=>validateLab({...lab,restate:{prompt:'x',checks:[]}}),/复述检查/)
 assert.throws(()=>validateLab({...lab,restate:{prompt:'x',checks:[{id:'a',label:'a',keywords:[]}]}}),/关键词/)
})

test('normalizes defaults and refuses out-of-range parameters',()=>{
 assert.deepEqual(normalizeParameters(lab,{}),{N:100,B:40,AB:30})
 assert.deepEqual(normalizeParameters(lab,{B:60}),{N:100,B:60,AB:30})
 assert.throws(()=>normalizeParameters(lab,{B:500}),/越界/)
})

test('readouts follow parameter changes and keep the zero denominator explicit',()=>{
 const base=computeReadouts(lab,{N:100,B:40,AB:30})
 assert.equal(base.find(r=>r.id==='joint').text,'30%')
 assert.equal(base.find(r=>r.id==='cond').text,'75%')
 const zero=computeReadouts(lab,{N:100,B:0,AB:0})
 assert.equal(zero.find(r=>r.id==='cond').text,'未定义')
})

test('prediction is judged by the host, not by the chosen option',()=>{
 assert.deepEqual(judgePrediction(lab,'up'),{correct:true,feedback:'对：分母变小。'})
 const wrong=judgePrediction(lab,'same')
 assert.equal(wrong.correct,false)
 assert.match(wrong.feedback,/变大/)
 assert.throws(()=>judgePrediction(lab,'missing'),/不存在/)
})

test('restate reports every missing check instead of a single pass/fail',()=>{
 const partial=checkRestate(lab,'因为分母变了')
 assert.equal(partial.passed,false)
 assert.deepEqual(partial.checks.map(c=>[c.id,c.passed]),[['den',true],['narrow',false],['num',false]])
 const full=checkRestate(lab,'分母从 100 缩小到 40 个点')
 assert.equal(full.passed,true)
})
