import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createCourses} from '../src/courses.mjs'

const lab={version:1,parameters:[{id:'B',min:1,max:100,step:1,initial:40}],readouts:[{id:'cond',label:'P(A|B)',numerator:'B',denominator:'B'}],prediction:{question:'q',options:[{id:'a',label:'A'},{id:'b',label:'B'}],correct:'a'},restate:{prompt:'p',checks:[{id:'k',label:'k',keywords:['k']}]}}

function fixture(){
 let state={instances:[{id:'i'}],bindings:[{instanceId:'i',sessionId:'s',phase:'ready'}],requests:[{id:'r',instanceId:'i',sessionId:'s',status:'accepted',sources:[]}]}
 const storage={read:async()=>structuredClone(state),write:async value=>{state=structuredClone(value)}}
 return {courses:createCourses(storage),get state(){return state}}
}

test('native artifact is bound to request session and survives reopen',async()=>{
 const {courses}=fixture()
 const data={requestId:'r',title:'概率',html:'<h1>概率</h1><button>实验</button>',concepts:['条件概率']}
 await assert.rejects(courses.submit(data,'foreign'),/归属/)
 await courses.submit(data,'s')
 const rows=await courses.request({action:'course-list',instanceId:'i'})
 assert.equal(rows.length,1)
 assert.equal(rows[0].title,'概率')
 assert.equal(rows[0].version,1)
 await assert.rejects(courses.submit(data,'s'),/已提交/)
})

test('a lab protocol is stored with the course and an invalid one is refused',async()=>{
 const first=fixture()
 const base={requestId:'r',title:'条件概率',html:'<h1>条件概率</h1>',concepts:['条件概率'],lab}
 await first.courses.submit(base,'s')
 assert.equal(first.state.courses[0].lab.version,1)
 const next=fixture()
 await assert.rejects(next.courses.submit({...base,lab:{...lab,readouts:[{id:'x',numerator:'missing',denominator:'B'}]}},'s'),/不存在/)
 assert.equal(next.state.courses,undefined)
})
