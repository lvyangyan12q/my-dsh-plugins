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
