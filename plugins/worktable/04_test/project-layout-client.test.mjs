import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {readProjectLayout,saveProjectLayout} from '../01_content/src/layout/project-layout.mjs'
import {ProjectLayoutClient,projectForDirectory,resolveProjectDirectory} from '../01_content/src/client/projectLayoutClient.mjs'

const layout = (id, width = 310) => ({project: {id, name:id}, spec: {id, title:id, top:null, main:[{id:'pane',title:'窗口1',min:100,content:null}],chatWidth:{default:width,min:100,max:900}}, geometry:{chatW:width,topH:0,leftW:0,paneWs:{pane:400},topWs:{},leftWs:{}}})
const deferred = () => {let resolve; const promise = new Promise(r=>resolve=r); return {promise,resolve}}

test('only geometry edits save an immutable project snapshot to its own folder',async()=>{
  const writes=[]
  const client=new ProjectLayoutClient({request:async body=>body.action==='read'?{status:'missing',folder:body.folder}:(writes.push(body),{status:'ok',folder:body.folder,document:{...body.layout,version:2,revision:writes.length}}),delay:600})
  await client.read('/A','A')
  const a=layout('A',420)
  client.schedule('/A',a)
  a.geometry.chatW=900
  await client.read('/B','B')
  client.schedule('/B',layout('B',260))
  await client.flushAll()
  assert.deepEqual(writes.map(w=>[w.folder,w.layout.project.id,w.layout.geometry.chatW]),[['/A','A',420],['/B','B',260]])
  assert.equal(client.state('/A').status,'saved')
})

test('blocked reads never initialize or overwrite a damaged or inaccessible file',async()=>{
  for(const status of ['invalid','unsupported','error','ambiguous']) {
    const writes=[]
    const client=new ProjectLayoutClient({request:async body=>body.action==='read'?{status,message:'保留原文件'}:(writes.push(body),{status:'ok'})})
    await client.read('/A','A');client.schedule('/A',layout('A'));await client.flushAll()
    assert.equal(writes.length,0);assert.equal(client.state('/A').status,status)
    assert.equal(client.state('/A').pending,true)
  }
})

test('a newer edit waits for the previous revision and never reports saved from an old response',async()=>{
  const gate=deferred(), writes=[], states=[]
  const client=new ProjectLayoutClient({onChange:s=>states.push(s.status),request:async body=>{
    if(body.action==='read')return {status:'ok',document:{...layout('A'),revision:4}}
    writes.push(body);if(writes.length===1)await gate.promise
    return {status:'ok',document:{...body.layout,revision:writes.length+4}}
  }})
  await client.read('/A','A');client.schedule('/A',layout('A',410));const first=client.flush('/A')
  client.schedule('/A',layout('A',510));gate.resolve();await first
  assert.deepEqual(writes.map(w=>[w.expectedRevision,w.layout.geometry.chatW]),[[4,410],[5,510]])
  assert.equal(states.filter(s=>s==='saved').length,2)
  assert.equal(client.state('/A').revision,6)
})

test('conflict retains the latest draft until explicit retry uses the current revision',async()=>{
  const writes=[];let revision=1
  const client=new ProjectLayoutClient({request:async body=>{
    if(body.action==='read')return {status:'ok',document:{...layout('A'),revision}}
    writes.push(body)
    if(writes.length===1){revision=2;return {status:'conflict',message:'其他页面已保存'}}
    return {status:'ok',document:{...body.layout,revision:3}}
  }})
  await client.read('/A','A');client.schedule('/A',layout('A',401));await client.flush('/A')
  assert.equal(client.state('/A').status,'conflict');client.schedule('/A',layout('A',501));await client.flushAll()
  assert.equal(writes.length,1);await client.retry('/A')
  assert.equal(writes[1].expectedRevision,2);assert.equal(writes[1].layout.geometry.chatW,501)
})

test('directory recovery preserves the document identity and rejects incompatible local registrations',()=>{
  const document=layout('original')
  assert.equal(projectForDirectory({folders:{}},document,'/restored').spec.id,'original')
  assert.match(projectForDirectory({folders:{original:'/elsewhere'}},document,'/restored').error,/身份/)
  assert.match(projectForDirectory({folders:{different:'/restored'}},document,'/restored').error,/另一个项目/)
})

test('ordinary reopening cannot silently authorize a conflicted draft to overwrite the file',async()=>{
  let saves=0
  const client=new ProjectLayoutClient({request:async body=>body.action==='read'?{status:'ok',document:{...layout('A'),revision:2}}:(saves++,{status:'conflict'})})
  await client.read('/A','A');client.schedule('/A',layout('A'));await client.flush('/A')
  const reopened=await client.read('/A','A')
  assert.equal(reopened.status,'conflict');await client.flushAll();assert.equal(saves,1)
})

test('directory registration compares actual folders rather than a symlink or spelling alias',async()=>{
  const doc=layout('original')
  const request=async()=>({status:'ok',folder:'/actual'})
  assert.equal((await resolveProjectDirectory({folders:{original:'/alias'}},doc,'/actual',request)).spec.id,'original')
  assert.match((await resolveProjectDirectory({folders:{other:'/alias'}},doc,'/actual',request)).error,/另一个项目/)
})

test('a fresh client restores the saved project and all dimensions from the actual directory store',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'worktable-client-'))
  const request=body=>body.action==='read'?readProjectLayout(body.folder,body):saveProjectLayout(body.folder,body.layout,body.expectedRevision)
  try {
    const first=new ProjectLayoutClient({request})
    assert.equal((await first.read(folder,'A')).status,'missing')
    first.schedule(folder,layout('A',460));await first.flushAll()
    assert.equal(first.state(folder).status,'saved')
    const fresh=new ProjectLayoutClient({request}), restored=await fresh.read(folder)
    assert.equal(restored.status,'ok');assert.equal(restored.document.project.id,'A')
    assert.equal(restored.document.geometry.chatW,460);assert.equal(restored.document.geometry.paneWs.pane,400)
  }finally{await rm(folder,{recursive:true,force:true})}
})

test('a user edit while conflict retry is reading wins over the previously queued draft',async()=>{
  const gate=deferred();let reads=0;const writes=[]
  const client=new ProjectLayoutClient({request:async body=>{
    if(body.action==='read'){reads++;if(reads===2)await gate.promise;return {status:'ok',document:{...layout('A'),revision:reads}}}
    writes.push(body);return writes.length===1?{status:'conflict'}:{status:'ok',document:{...body.layout,revision:3}}
  }})
  await client.read('/A','A');client.schedule('/A',layout('A',401));await client.flush('/A')
  const retry=client.retry('/A');await new Promise(resolve=>setImmediate(resolve));client.schedule('/A',layout('A',599));gate.resolve();await retry
  assert.equal(writes[1].layout.geometry.chatW,599)
})
