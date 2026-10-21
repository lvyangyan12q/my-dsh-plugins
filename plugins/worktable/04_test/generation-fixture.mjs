import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,writeFile,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {CompositionDirectory} from '../01_content/src/framework/compositions.mjs'
import {ResourceDirectory} from '../01_content/src/framework/resources.mjs'
import {RoleDirectory,RoleStore} from '../01_content/src/framework/roles.mjs'
import {TaskDirectory,TaskStore} from '../01_content/src/framework/tasks.mjs'
import {GenerationDirectory} from '../01_content/src/framework/generations.mjs'
export async function fixture(){
 const dir=await mkdtemp(join(tmpdir(),'wt-generation-')),apps=new ApplicationDirectory(join(dir,'apps.json')),compositions=new CompositionDirectory(apps,{validateDependencies:async()=>{}}),resources=new ResourceDirectory(join(dir,'resources.json'),apps,apps.gate);
 const recipe={title:'Synthetic',version:'1.0.0',layout:'vertical',pages:[{id:'home',title:'Home',modules:[{id:'output',type:'custom',roleId:'maker',config:{title:'Output'}}]}],connections:[],roles:[{id:'maker',title:'Maker',agent:{source:'managed',id:'synthetic',kind:'agent'},creation:{cwd:dir}}]};const saved=await compositions.save({appId:'synthetic',expectedRevision:0,recipe});await compositions.activate({appId:'synthetic',expectedRevision:saved.revision});const instance=await apps.createInstance('synthetic','project-A'),view=await apps.createView(instance.id);
 const roleStore=await RoleStore.open(join(dir,'roles.json')),roles=new RoleDirectory(roleStore,apps,{validate:async()=>({presetId:'native-test'}),validateExisting:async()=>{},create:async row=>row.sessionId},apps.gate);await roles.ensure(instance.id,'maker');let prompts=0;
 const taskStore=await TaskStore.open(join(dir,'tasks.json')),tasks=new TaskDirectory(taskStore,{applications:apps,roles,resources,gate:apps.gate,native:{prompt:async()=>{prompts++;return {accepted:true}},cancel:async()=>{}}});
 const nativeEvents=new Map();let inspectionBarrier=null;const inspectNative=async id=>{const barrier=inspectionBarrier;if(barrier){barrier.enter();await barrier.wait}return {events:nativeEvents.get(id)??[]}};const generations=new GenerationDirectory(join(dir,'generations.json'),{applications:apps,compositions,tasks,roles,gate:apps.gate,inspectNative});
 return {dir,apps,compositions,resources,roles,tasks,generations,view,instance,recipe,complete(task,kind='completed'){const events=nativeEvents.get(task.sessionId)??[],message=events.findIndex(event=>event.type==='user/message'&&event.data.source.rpcId===task.requestId);if(message>=0){const turn=events.slice(0,message).findLast(event=>event.type==='turn/start').data.turn;events.find(event=>event.type==='turn/end'&&event.data.turn===turn).data.reason={kind}}else{const turn=events.filter(event=>event.type==='turn/start').length+1;events.push({type:'turn/start',data:{turn}},{type:'user/message',data:{source:{kind:'user',rpcId:task.requestId}}},{type:'turn/end',data:{turn,reason:{kind}}})}nativeEvents.set(task.sessionId,events)},inspectNative,pauseInspection(){let enter,release;const entered=new Promise(resolve=>enter=resolve),wait=new Promise(resolve=>release=resolve);inspectionBarrier={enter,wait};return {entered,release(){inspectionBarrier=null;release()}}},get prompts(){return prompts},async close(){await generations.close();await tasks.close();await roles.dispose();await resources.close();await apps.close();await rm(dir,{recursive:true,force:true})}}
}
