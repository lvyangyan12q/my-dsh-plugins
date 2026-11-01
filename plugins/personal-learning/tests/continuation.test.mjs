import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createContinuation} from '../src/continuation.mjs'
test('continuation restores owned course parameters and explains evidence based next steps',async()=>{
 let state={instances:[{id:'a'},{id:'b'}],courses:[{id:'c',instanceId:'a',version:1,concepts:['基础']}],maps:[{instanceId:'a',nodes:[{id:'n',title:'基础'},{id:'m',title:'进阶'}],edges:[{from:'n',to:'m',type:'prerequisite'}]}],evidence:[]};const storage={read:async()=>structuredClone(state),write:async s=>{state=structuredClone(s)}};
 const app=createContinuation(storage);await app.request({action:'continuation-save',instanceId:'a',courseId:'c',conceptId:'n',view:'course',parameters:{overlap:30}});
 assert.equal((await createContinuation(storage).request({action:'continuation-read',instanceId:'a'})).position.parameters.overlap,30);
 assert.equal((await app.request({action:'continuation-read',instanceId:'a'})).recommendations[0].conceptId,'n');
 await assert.rejects(app.request({action:'continuation-save',instanceId:'b',courseId:'c'}),/归属/);
 assert.equal((await app.request({action:'continuation-read',instanceId:'b'})).position,null);
 state.evidence=[{instanceId:'a',courseId:'c',version:1,feedback:{text:'请继续练习'}}];
 assert.match((await app.request({action:'continuation-read',instanceId:'a'})).recommendations.find(r=>r.conceptId==='n').reason,/复习/);
});
