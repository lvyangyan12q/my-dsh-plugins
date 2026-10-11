import assert from 'node:assert/strict'
import {test} from 'node:test'
import {Workbench} from '../src/workbench.ts'
import type {WorkbenchAppId} from '../src/workbench-api.ts'
import type {AppLifecycleState} from '../src/app-lifecycle-api.ts'
test('before Host readiness opens are gated and disabled apps remain gated after refresh',async()=>{
 let resolve!: (states:AppLifecycleState[])=>void
 const workbench=new Workbench(undefined,()=>new Promise(done=>{resolve=done}))
 const id='reading' as WorkbenchAppId
 workbench.registerApp({id,name:'Reading',version:'1',source:'fixture',icon:'notebook',pages:[{id:'overview',label:'Overview'}],defaultLayout:{pageId:'overview',width:500,height:400}})
 workbench.openApp(id);assert.equal(workbench.getSnapshot().windows.length,0)
 resolve([{appId:id,enabled:false,revision:1}]);await workbench.loadLifecycle()
 workbench.openApp(id);assert.equal(workbench.getSnapshot().windows.length,0)
 workbench.applyLifecycle([{appId:id,enabled:true,revision:2}]);workbench.openApp(id)
 assert.equal(workbench.getSnapshot().windows.length,1)
 workbench.applyLifecycle([{appId:id,enabled:false,revision:3}]);assert.equal(workbench.getSnapshot().focused,null)
 assert.equal(workbench.getSnapshot().windows.length,1);workbench.dispose()
})

test('reload-time open intent preserves a saved KG page until Host availability is known',async()=>{
 const values=new Map<string,string>(),storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}}
 const app={id:'kaogong' as WorkbenchAppId,name:'KG',source:'@deepseek-ai/dsh-tool-kaogong',version:'1',icon:'book-open' as const,pages:[{id:'classroom',label:'Classroom'},{id:'materials',label:'Materials'}],defaultLayout:{width:600,height:400,pageId:'classroom'}}
 const old=new Workbench(storage);const remove=old.registerApp(app);old.openApp(app.id);old.selectPage('["kaogong","default"]','materials');remove.suspend();old.dispose()
 let settle!:(states:AppLifecycleState[])=>void
 const restored=new Workbench(storage,()=>new Promise(done=>{settle=done}));const registration=restored.registerApp(app)
 restored.openApp(app.id)
 assert.equal(restored.getSnapshot().lifecycleReady,false)
 assert.equal(restored.isEnabled(app.id),false,'Unknown availability still prohibits rendering/execution')
 assert.equal(restored.getSnapshot().focused,'["kaogong","default"]','An automatic source re-admission must not overwrite restored focus with catalog')
 assert.equal(restored.getSnapshot().windows[0].pageId,'materials')
 settle([{appId:app.id,enabled:true,revision:1}]);await restored.loadLifecycle()
 assert.equal(restored.getSnapshot().focused,'["kaogong","default"]')
 registration();assert.equal(restored.getSnapshot().focused,null);assert.equal(restored.getSnapshot().windows[0].mode,'closed','Real source disable still permanently closes its saved window')
 restored.dispose()
})
