import {test} from 'node:test'
import assert from 'node:assert/strict'
import {Readable} from 'node:stream'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {mountProjectLayouts} from '../01_content/src/layout/project-layout-host.mjs'

test('layout operations require official operator admission and preserve conflict status',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'worktable-layout-http-')),routes=[]
  let connection=null
  const ctx={get:()=>connection,webServer:{register:route=>{routes.push(route);return ()=>{}}},effect(){}}
  mountProjectLayouts(ctx)
  async function call(body,method='POST'){
    const req=Readable.from([Buffer.from(JSON.stringify(body))]);req.method=method;req.headers={'content-type':'application/json'}
    const res={writeHead(status){this.status=status},end(value){this.body=JSON.parse(value)}}
    await routes.find(r=>r.path==='/api/worktable/project-layout').handler(req,res);return res
  }
  try{
    assert.equal((await call({action:'read',folder})).status,503)
    connection={admit:()=>({rejection:403})};assert.equal((await call({action:'read',folder})).status,403)
    connection={admit:()=>({peer:{}})}
    assert.equal((await call({action:'read',folder})).body.status,'missing')
    const layout={project:{id:'p',name:'Project'},spec:{id:'p',title:'Project',top:null,main:[{id:'a',title:'A',min:100}],chatWidth:{default:360,min:240,max:600}},geometry:{chatW:360,topH:200,leftW:260,paneWs:{},topWs:{},leftWs:{}}}
    assert.equal((await call({action:'save',folder,layout,expectedRevision:null})).body.document.revision,1)
    const stale=await call({action:'save',folder,layout,expectedRevision:null});assert.equal(stale.status,409);assert.equal(stale.body.status,'conflict')
    assert.equal((await call({action:'read',folder},'GET')).status,405)
    assert.equal((await call({action:'unknown',folder})).status,400)
  }finally{await rm(folder,{recursive:true,force:true})}
})
