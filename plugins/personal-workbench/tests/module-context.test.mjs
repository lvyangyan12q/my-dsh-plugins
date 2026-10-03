import assert from 'node:assert/strict'
import {test} from 'node:test'
import {DisplayStore} from '../src/display-store.ts'
import {displayModuleContext} from '../src/display-context.ts'
import {captureRecipeModuleContext,registerRecipeModuleContextProvider} from '../src/module-context.ts'
const props=(type='detail')=>({appId:'reading',instanceId:'one',preview:false,pageId:'home',recipe:{connections:[]},module:{id:'target',type,title:'Selected books',connectionId:'books',config:{}},t:key=>key})
test('display capture bounds a large dataset to actual selection or a labelled sample with real aggregate values',async()=>{
 const records=Array.from({length:10000},(_,index)=>({id:String(index),title:'Book '+index,fields:{pages:index,notes:'x'.repeat(5000)}})),source={appId:'reading',resource:'books',label:'Own books',load:async()=>({records,filters:[],stats:[{id:'count',label:'Count',operation:'count'}]})},store=new DisplayStore(source,{appId:'reading',instanceId:'one',preview:false})
 try{await store.reload();store.select('9000');const result=displayModuleContext(props(),store,source);assert.equal(result.phase,'ready');const selected=JSON.parse(result.context.find(c=>c.id.endsWith('.selection')).text);assert.equal(selected.id,'9000');assert.ok(selected.fields.notes.length<200);assert.ok(result.context.reduce((n,c)=>n+c.text.length,0)<5000);assert.equal(JSON.parse(result.context[0].text).totalRecords,10000)
 const stats=displayModuleContext(props('stats'),store,source);assert.equal(JSON.parse(stats.context.find(c=>c.id.endsWith('.statistics')).text).statistics[0].value,10000)
 store.setSearch('Book 9000');const searched=displayModuleContext(props('stats'),store,source);assert.equal(JSON.parse(searched.context[0].text).search,'Book 9000');assert.equal(JSON.parse(searched.context.find(c=>c.id.endsWith('.statistics')).text).statistics[0].value,1)
 const unselected=new DisplayStore(source,{appId:'reading',instanceId:'two',preview:false});try{await unselected.reload();const sample=displayModuleContext(props('list'),unselected,source);const value=JSON.parse(sample.context.find(c=>c.id.endsWith('.records')).text);assert.equal(value.records.length,3);assert.equal(value.omittedRecords,9997);assert.equal(value.sampled,true)}finally{unselected.dispose()}
 }finally{store.dispose()}
})
test('code-owned extensions are bounded and withdraw cleanly; absent/error/loading data never becomes fabricated context',async()=>{
 const p=props('special'),remove=registerRecipeModuleContextProvider('special',()=>({phase:'ready',context:Array.from({length:100},(_,i)=>({id:String(i),label:'Evidence',source:'Plugin',text:'a'.repeat(32000)}))}))
 try{const context=captureRecipeModuleContext(p);assert.ok(context.length<=20);assert.ok(context.reduce((n,c)=>n+c.text.length,0)<=16000);assert.ok(context.some(c=>c.text.includes('taskContextTruncated')));assert.ok(context.some(c=>c.id.endsWith('.omitted')))}finally{remove()}
 assert.throws(()=>captureRecipeModuleContext(p),/taskContextUnavailable/)
 const source={appId:'reading',resource:'books',label:'Unavailable',load:async()=>{throw new Error('Cannot read owned source')}},store=new DisplayStore(source,{appId:'reading',instanceId:'one',preview:false})
 try{assert.equal(displayModuleContext(props(),store,source).phase,'unavailable');await store.reload();const result=displayModuleContext(props(),store,source);assert.equal(result.phase,'unavailable');assert.match(result.reason,/Cannot read owned source/)}finally{store.dispose()}
})
