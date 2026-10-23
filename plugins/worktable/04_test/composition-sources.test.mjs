import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {ResourceDirectory} from '../01_content/src/framework/resources.mjs'
test('source discovery lists registered owner view metadata without reading data or creating grants',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-sources-')),apps=new ApplicationDirectory(join(dir,'apps.json')),resources=new ResourceDirectory(join(dir,'resources.json'),apps)
 try{await apps.contribute({id:'documents',title:'资料',version:'1',kind:'deep',protocolVersion:1,views:[{id:'page',title:'Page'}]});const instance=await apps.createInstance('documents','project-a'),view=await apps.createView(instance.id)
 resources.register({appId:'documents',resourceId:'files',actions:[],read(){throw Error('catalog must not read private records')}})
 assert.deepEqual(await resources.catalog(),[{appId:'documents',appTitle:'资料',instanceId:instance.id,projectId:'project-a',viewId:view.id,resourceId:'files'}])
 assert.deepEqual((await resources.snapshot()).connections,[])
 }finally{await resources.close();await apps.close();await rm(dir,{recursive:true,force:true})}
})
