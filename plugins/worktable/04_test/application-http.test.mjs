import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {Readable} from 'node:stream'
import {mountApplications} from '../01_content/src/framework/host.mjs'

test('registered public route authenticates requests and uses current profile durable state',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-http-'));const routes=[];const effects=[];let admitted=false
  const ctx={get:key=>key==='profileContext'?{dir}:key==='connection'?{admit:()=>admitted?{peer:{}}:{rejection:401}}:null,provide(){},effect:fn=>effects.push(fn),webServer:{register:r=>{routes.push(r);return ()=>{}}}}
  try {
    mountApplications(ctx)
    const route=routes.find(r=>r.path==='/api/worktable/applications')
    async function call(method,body){const req=Readable.from(body?[JSON.stringify(body)]:[]);req.method=method;req.headers={host:'127.0.0.1:3091','content-type':'application/json'};const res={status:0,writeHead(n){this.status=n},end(s){this.body=JSON.parse(s)}};await route.handler(req,res);return res}
    assert.equal((await call('GET')).status,401)
    admitted=true
    assert.equal((await call('POST',{action:'register',application:{id:'web',title:'Example',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'}})).status,200)
    assert.equal((await call('GET')).body.applications[0].id,'web')
    assert.equal((await call('POST',{action:'register',application:{id:'native',title:'Native',version:'1.0.0',protocolVersion:1,kind:'web',url:'http://127.0.0.1:3091/'}})).status,400)
  } finally {await rm(dir,{recursive:true,force:true})}
})
