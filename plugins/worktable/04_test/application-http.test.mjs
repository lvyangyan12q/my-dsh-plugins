import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {mountApplications,protectWorktableRoutes} from '../01_content/src/framework/host.mjs'

test('registered public route authenticates requests and uses current profile durable state',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-http-'));const routes=[];const effects=[];const readyListeners=[];let admitted=false,ready=false
  const connection={admit:()=>admitted?{peer:{}}:{rejection:401}}
  const ctx={get:key=>!ready?undefined:key==='profileContext'?{dir}:key==='connection'?connection:null,inject:(keys,callback)=>readyListeners.push(callback),provide(){},effect:fn=>effects.push(fn),webServer:{register:r=>{routes.push(r);return ()=>{}}}}
  try {
    mountApplications(ctx)
    const route=routes.find(r=>r.path==='/api/worktable/applications')
    async function call(method,body){const req=Readable.from(body?Array.from(Buffer.from(JSON.stringify(body))).map(byte=>Buffer.from([byte])):[]);req.method=method;req.headers={host:'127.0.0.1:3091','content-type':'application/json'};const res={status:0,writeHead(n){this.status=n},end(s){this.body=JSON.parse(s)}};await route.handler(req,res);return res}
    assert.equal((await call('GET')).status,503)
    ready=true;for(const callback of readyListeners)callback({...ctx,profileContext:{dir},connection})
    assert.equal((await call('GET')).status,401)
    admitted=true
    assert.equal((await call('POST',{action:'register',application:{id:'web',title:'阅读',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'}})).status,200)
    assert.equal((await call('GET')).body.applications[0].id,'web')
    assert.equal((await call('GET')).body.applications[0].title,'阅读')
    assert.equal((await call('POST',{action:'register',application:{id:'native',title:'Native',version:'1.0.0',protocolVersion:1,kind:'web',url:'http://127.0.0.1:3091/'}})).status,400)
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('ordinary webpage cannot invoke inherited file writes or terminal upgrades without operator admission',async()=>{
  const routes=[],upgrades=[];let allowed=false,writes=0,terminals=0
  const ctx={get:()=>({admit:()=>allowed?{peer:{}}:{rejection:403}})}
  const server=protectWorktableRoutes(ctx,{register:r=>routes.push(r),registerUpgrade:r=>upgrades.push(r)})
  server.register({path:'/api/worktable/write',handler:()=>writes++})
  server.registerUpgrade({path:'/api/worktable/term',handler:()=>terminals++})
  const response={status:0,writeHead(s){this.status=s},end(){}}
  await routes[0].handler({headers:{origin:'null'}},response)
  assert.equal(response.status,403);assert.equal(writes,0)
  let responseText='';const socket={end(s){responseText=s}}
  upgrades[0].handler({headers:{origin:'null'}},socket,Buffer.alloc(0))
  assert.match(responseText,/403/);assert.equal(terminals,0)
  allowed=true
  await routes[0].handler({headers:{}},response);upgrades[0].handler({headers:{}},socket,Buffer.alloc(0))
  assert.equal(writes,1);assert.equal(terminals,1)
})
