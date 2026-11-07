import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createLearningDispatcher} from '../src/teaching.mjs'

function fixture(){
 const calls=[]
 const service=name=>({request:async body=>{calls.push([name,body.action]);return{ok:true}}})
 const services={continuation:service('continuation'),evidence:service('evidence'),maps:service('maps'),courses:service('courses'),requests:service('requests'),app:service('app'),teacher:{}}
 return {dispatch:createLearningDispatcher(services),calls}
}

test('lab-complete reaches evidence instead of the application boundary',async()=>{
 const {dispatch,calls}=fixture()
 await dispatch({action:'lab-complete',instanceId:'i',courseId:'c',version:1})
 assert.deepEqual(calls,[['evidence','lab-complete']])
})

test('existing routes keep their owner',async()=>{
 const {dispatch,calls}=fixture()
 await dispatch({action:'evidence-save'})
 await dispatch({action:'course-list'})
 await dispatch({action:'continuation-read'})
 assert.deepEqual(calls,[['evidence','evidence-save'],['courses','course-list'],['continuation','continuation-read']])
})
