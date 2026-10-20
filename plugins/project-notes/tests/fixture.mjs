import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {ApplicationDirectory} from '../../worktable/01_content/src/framework/applications.mjs'
import {ResourceDirectory} from '../../worktable/01_content/src/framework/resources.mjs'
import {AdmissionGate} from '../../worktable/01_content/src/framework/admission.mjs'
import {installNotes} from '../src/notes-host.ts'
export async function fixture(options={}){
 const source=process.env.DSH_SOURCE;if(!source)throw new Error('DSH_SOURCE required')
 const require=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=require('@deepseek-ai/cordis')
 const load=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
 const {default:Storage}=await load('packages/storage/storage'),{JsonStorageBackend}=await load('packages/storage/storage-json'),{DomainFacility}=await load('packages/storage/storage-domain')
 const folder=await mkdtemp(join(tmpdir(),'notes-platform-')),ctx=new Context();await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(folder));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility)
 const owner=await installNotes({storageDomain:facility},()=>({configured:!!options.assistantConfigured,skillIds:options.assistantConfigured?['operator-chosen-skill']:[]})),gate=new AdmissionGate(),apps=new ApplicationDirectory(join(folder,'applications.json'),{gate}),resources=new ResourceDirectory(join(folder,'resources.json'),apps,gate)
 const definition={id:'project-notes',title:'项目便签',version:'0.1.0',protocolVersion:1,kind:'deep',views:[{id:'page',title:'完整便签页'},{id:'summary',title:'便签摘要'}]}
 const withdraw=await apps.contribute(definition),unregister=resources.register(owner.resource)
 return {owner,apps,resources,definition,gate,folder,async instance(project){const instance=await apps.createInstance('project-notes',project),view=await apps.createView(instance.id,'page');return {application:definition,instance,view}},async close(){unregister();withdraw();await owner.dispose();await resources.close();await apps.close();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}}
}
