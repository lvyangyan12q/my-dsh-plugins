import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {mountCompositions} from '../01_content/src/framework/composition-host.mjs'
test('public authoring route requires admission and explicitly activates a durable draft',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-compose-http-')),apps=new ApplicationDirectory(join(dir,'apps.json'));const routes=[],effects=[];let allowed=false
 const ctx={worktableApplications:apps,connection:{admit:()=>allowed?{peer:{}}:{rejection:401}},get(){},provide(){},effect(fn){effects.push(fn)},inject(keys,fn){fn(this)},webServer:{register(route){routes.push(route);return()=>{}}}}
 try{
 mountCompositions(ctx);for(const fn of effects)fn()
 const route=routes[0]
 async function call(method,input){const req=Readable.from(input?[Buffer.from(JSON.stringify(input))]:[]);req.method=method;req.headers={'content-type':'application/json'};const res={writeHead(status){this.status=status},end(text){this.body=JSON.parse(text)}};await route.handler(req,res);return res}
 assert.equal((await call('GET')).status,401);allowed=true
 assert.equal((await call('POST',{action:'save',appId:'dashboard',expectedRevision:0,recipe:{title:'Dashboard',version:'1.0.0',layout:'grid',pages:[{id:'home',title:'Home',modules:[]}]}})).body.revision,1)
 assert.equal((await apps.catalog()).length,0)
 assert.equal((await call('POST',{action:'preview',appId:'dashboard',expectedRevision:1})).body.recipe.title,'Dashboard')
 assert.equal((await call('POST',{action:'activate',appId:'dashboard',expectedRevision:1})).status,200)
 assert.equal((await apps.catalog())[0].id,'dashboard')
 assert.equal((await call('POST',{action:'save',appId:'dashboard',expectedRevision:0,recipe:{title:'Dashboard',version:'1.0.0',layout:'grid',pages:[{id:'home',title:'Home',modules:[]}]}})).status,409)
 }finally{await apps.close();await rm(dir,{recursive:true,force:true})}
})
