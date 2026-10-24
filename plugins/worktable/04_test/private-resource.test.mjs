import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {ResourceDirectory} from '../01_content/src/framework/resources.mjs'
test('private owner remains usable by own task but cannot be catalogued, granted, or read through a previous grant',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-private-resource-'));let apps,resources;
 try{apps=new ApplicationDirectory(join(dir,'apps.json'));await apps.contribute({id:'sample',title:'Sample',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]});const a=await apps.createInstance('sample',null),b=await apps.createInstance('sample',null),av=await apps.createView(a.id),bv=await apps.createView(b.id);resources=new ResourceDirectory(join(dir,'resources.json'),apps,apps.gate);let reads=0;const owner={appId:'sample',resourceId:'private',actions:[],read:async()=>{reads++;return {revision:'1',secret:'mine'}}};const remove=resources.register(owner);await resources.share({ownerViewId:av.id,consumerInstanceId:b.id,resourceId:'private'});remove();resources.register({...owner,shareable:false});assert.equal((await resources.catalog()).length,0);assert.equal((await resources.call({viewId:av.id,resourceId:'private',action:'read'})).value.secret,'mine');await assert.rejects(resources.share({ownerViewId:av.id,consumerInstanceId:b.id,resourceId:'private'}),{code:'private-resource'});await assert.rejects(resources.call({viewId:bv.id,resourceId:'private',action:'read'}),{code:'private-resource'});assert.equal(reads,1)}finally{await resources?.close();await apps?.close();await rm(dir,{recursive:true,force:true})}
})
