import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../01_content/package.json', import.meta.url))
const { buildSync } = require('esbuild')
const code = buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/customTask.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text
const module = {exports:{}}
new Function('module','exports',code)(module,module.exports)
const { submitCustomTask } = module.exports
function fixture() {
  const pane = id => ({id,tabs:[{id:'tab-'+id,content:{kind:'builtin',type:'custom'}}],active:0})
  const spec = {id:'project',left:pane('p1'),leftMore:[pane('p2')],main:[pane('p3')]}
  let project = {folder:'C:/project',spec}
  const calls = []
  const request = {projectId:'project',folder:'C:/project',window:'窗口3',source:{projectId:'project',paneId:'p3',tabId:'tab-p3'}}
  const deps = {getProject:()=>project,storageAvailable:()=>true,create:async()=>{calls.push('create');return 'session'},configure:async()=>{},open:async()=>{},bind:target=>{calls.push(['bind',target.paneId]);return []},send:async()=>{calls.push('send')}}
  return {request,deps,calls,spec,setProject:p=>{project=p}}
}
test('missing or duplicate custom target is rejected before any create, bind or send',async()=>{
  for (const change of [f=>{f.spec.main=[]},f=>{f.spec.leftMore[0].id='p3'}]) {
    const f=fixture();change(f)
    await assert.rejects(submitCustomTask(f.request,f.deps),/窗口.*变化/)
    assert.deepEqual(f.calls,[])
  }
})
test('changed project, directory, source tab or unreadable storage causes zero side effects',async()=>{
  for (const change of [f=>f.setProject({}),f=>{f.request.folder='C:/wrong'},f=>{f.request.source.tabId='old-tab'},f=>{f.deps.storageAvailable=()=>false},f=>{f.request.folder='relative';f.setProject({folder:'relative',spec:f.spec})}]) {
    const f=fixture();change(f)
    await assert.rejects(submitCustomTask(f.request,f.deps),/[项目目录窗口标签存储]/)
    assert.deepEqual(f.calls,[])
  }
})
test('second left pane and main pane submit to their own stable identities',async()=>{
  for (const [window,paneId] of [['窗口2','p2'],['窗口3','p3']]) {
    const f=fixture();Object.assign(f.request,{window,source:{projectId:'project',paneId,tabId:'tab-'+paneId}})
    assert.equal(await submitCustomTask(f.request,f.deps),'session')
    assert.deepEqual(f.calls,['create',['bind',paneId],'send'])
  }
})
test('projects without a directory remain usable without storage or binding persistence',async()=>{
  const f=fixture();f.request.folder=null;f.setProject({spec:f.spec});f.deps.storageAvailable=()=>false
  assert.equal(await submitCustomTask(f.request,f.deps),'session')
})
test('target replacement after creation prevents binding and reports the created session',async()=>{
  const f=fixture();f.deps.configure=async()=>{f.spec.main[0].tabs[0].id='replacement'}
  await assert.rejects(submitCustomTask(f.request,f.deps),/窗口或标签.*会话已创建（session）/)
  assert.deepEqual(f.calls,['create'])
})
test('existing session revalidates after navigation before binding or sending',async()=>{
  const f=fixture();f.request.sessionId='existing';f.deps.open=async()=>{f.setProject({})}
  await assert.rejects(submitCustomTask(f.request,f.deps),/项目或窗口/)
  assert.deepEqual(f.calls,[])
})
test('an unavailable project directory is rejected before group or session creation',async()=>{
  const f=fixture();f.deps.checkFolder=async()=>{throw new Error('项目目录不可用。')}
  await assert.rejects(submitCustomTask(f.request,f.deps),/项目目录不可用/)
  assert.deepEqual(f.calls,[])
})
