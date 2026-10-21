import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {CompositionDirectory} from '../01_content/src/framework/compositions.mjs'
import {ResourceDirectory} from '../01_content/src/framework/resources.mjs'
import {CapabilityDirectory} from '../01_content/src/framework/capabilities.mjs'
import {RoleStore} from '../01_content/src/framework/roles.mjs'
test('composition accepts legitimate eighty-character external contracts and still validates their owners',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-long-reference-')),apps=new ApplicationDirectory(join(dir,'apps.json')),resources=new ResourceDirectory(join(dir,'resources.json'),apps),store=await RoleStore.open(join(dir,'roles.json'));const presets=new Map()
 const native={agentPresets:{compositionInventory:async()=>[...presets.values()].map(row=>({id:row.id,rows:(row.plugins??[]).map(plugin=>({moduleName:plugin.name,enabled:true,fiberState:2}))})),resolve:async id=>presets.get(id),register:async row=>{presets.set(row.id,row);return async()=>presets.delete(row.id)},acquireScope:async()=>({key:{},[Symbol.asyncDispose]:async()=>{}})},skills:{snapshot:async()=>({complete:true,skills:[]})}}
 const capabilities=new CapabilityDirectory(store,native),long='a'.repeat(70)
 try{await apps.contribute({id:'source',title:'Source',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const source=await apps.createInstance('source',null),view=await apps.createView(source.id);resources.register({appId:'source',resourceId:long,actions:[],read:()=>({revision:'1',records:[]})});await capabilities.save({kind:'agent',id:long,title:'Agent',content:'Test.',enabled:true,userInvocable:true,modelInvocable:true,skillIds:[],baseComposition:'workspace-basic-v1'},0)
 const service=new CompositionDirectory(apps,{validateDependencies:async(recipe,appId)=>{for(const ref of recipe.connections)await resources.resolve({viewId:ref.viewId,resourceId:ref.resourceId});for(const role of recipe.roles)await capabilities.validateRole(role,appId)}})
 await service.save({appId:'board',expectedRevision:0,recipe:{title:'Board',version:'1.0.0',layout:'grid',pages:[{id:'home',title:'Home',modules:[]}],connections:[{id:'data',viewId:view.id,resourceId:long}],roles:[{id:'assistant',title:'Assistant',agent:{kind:'agent',source:'managed',id:long},creation:{cwd:dir}}]}})
 assert.equal((await service.preview({appId:'board',expectedRevision:1})).recipe.connections[0].resourceId,long)
 }finally{await capabilities.dispose();await store.close();await resources.close();await apps.close();await rm(dir,{recursive:true,force:true})}
})
