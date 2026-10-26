import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
const require = createRequire(new URL('../01_content/package.json', import.meta.url))
const { buildSync } = require('esbuild')
const code = buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/customTask.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text
const module = {exports:{}}
new Function('module','exports',code)(module,module.exports)
const { submitCustomTask, createCustomHostSession } = module.exports
function fixture() {
  const pane = id => ({id,tabs:[{id:'tab-'+id,content:{kind:'builtin',type:'custom'}}],active:0})
  const spec = {id:'project',left:pane('p1'),leftMore:[pane('p2')],main:[pane('p3')]}
  let project = {folder:'C:/project',spec}
  const calls = []
  const request = {projectId:'project',folder:'C:/project',window:'窗口3',source:{projectId:'project',paneId:'p3',tabId:'tab-p3'}}
  const deps = {getProject:()=>project,storageAvailable:()=>true,create:async()=>{calls.push('create');return 'session'},configure:async()=>{},open:async()=>{},bind:target=>{calls.push(['bind',target.paneId]);return []},send:async(_session,prepare)=>{if(typeof prepare==='function')prepare();calls.push('send')}}
  return {request,deps,calls,spec,setProject:p=>{project=p}}
}
function deferred() { let resolve; const promise = new Promise(r=>{resolve=r});return {promise,resolve} }
test('double submission while creation is pending creates and sends only once',async()=>{
  const f=fixture(), wait=deferred();f.deps.create=async()=>{f.calls.push('create');await wait.promise;return 'session'}
  const first=submitCustomTask(f.request,f.deps), second=submitCustomTask(f.request,f.deps)
  wait.resolve()
  assert.deepEqual(await Promise.all([first,second]),['session','session'])
  assert.deepEqual(f.calls,['create',['bind','p3'],'send'])
})
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
test('target changing while the host becomes ready causes zero binding and zero sending',async()=>{
  const f=fixture(),ready=deferred(),entered=deferred()
  f.deps.send=async(_session,prepare)=>{entered.resolve();await ready.promise;prepare();f.calls.push('send')}
  const pending=submitCustomTask(f.request,f.deps)
  await entered.promise
  f.spec.main[0].tabs[0].id='changed'
  ready.resolve()
  await assert.rejects(pending,/标签.*会话已创建/)
  assert.deepEqual(f.calls,['create'])
})
test('successful submission token cannot send again and a failed token can explicitly retry',async()=>{
  const f=fixture();f.request.submission={};f.request.intent='draft'
  await submitCustomTask({...f.request},f.deps)
  await submitCustomTask({...f.request},f.deps)
  assert.deepEqual(f.calls,['create',['bind','p3'],'send'])
  const retry=fixture();retry.request.submission={};retry.deps.checkFolder=async()=>{throw new Error('目录暂不可用')}
  await assert.rejects(submitCustomTask({...retry.request},retry.deps),/目录暂不可用/)
  retry.deps.checkFolder=async()=>{}
  await submitCustomTask({...retry.request},retry.deps)
  assert.deepEqual(retry.calls,['create',['bind','p3'],'send'])
})
test('a second mounted form joining an in-flight request also remembers the success',async()=>{
  const f=fixture(),hold=deferred();f.deps.create=async()=>{f.calls.push('create');await hold.promise;return 'session'}
  const a={...f.request,submission:{}},b={...f.request,submission:{}}
  const first=submitCustomTask(a,f.deps),second=submitCustomTask(b,f.deps)
  hold.resolve();await Promise.all([first,second]);await submitCustomTask(b,f.deps)
  assert.deepEqual(f.calls,['create',['bind','p3'],'send'])
})
test('changing target during group creation prevents any session creation',async()=>{
  const f=fixture(),hold=deferred(),entered=deferred()
  const host={sessions:{using(){},async create(){f.calls.push('native-create');return 's'}},workspaces:{async createDirectory(){entered.resolve();await hold.promise},async create(){f.calls.push('workspace');return {workspaceId:'ws'}}},mkdir:async()=>{f.calls.push('mkdir')}}
  f.deps.create=validate=>createCustomHostSession(host,{kind:'new',parent:'C:/groups',name:'new'},f.request.folder,validate)
  const pending=submitCustomTask(f.request,f.deps)
  await entered.promise;f.setProject({});hold.resolve()
  await assert.rejects(pending,/项目或窗口/)
  assert.deepEqual(f.calls,[])
})
test('public custom group creation preserves explicit none, existing and new choices',async()=>{
  for (const [group,folder,expected] of [
    [{kind:'none'},null,{}],
    [{kind:'none'},'C:/project',{cwd:'C:/project'}],
    [{kind:'existing',workspaceId:'chosen'},'C:/project',{workspaceId:'chosen'}],
    [{kind:'new',parent:'C:/groups',name:'new'},'C:/project',{workspaceId:'new-workspace'}],
  ]) {
    const calls=[]
    const host={sessions:{using(){},async create(options){calls.push(['session',{...options}]);return 's'}},workspaces:{async createDirectory(parent,name){calls.push(['directory',parent,name])},async create(options){calls.push(['workspace',{...options}]);return {workspaceId:'new-workspace'}}},mkdir:async(path)=>{calls.push(['mkdir',path])}}
    assert.equal(await createCustomHostSession(host,group,folder,()=>{}),'s')
    assert.deepEqual(calls.at(-1),['session',expected])
    assert.equal(calls.length,group.kind==='new'?4:1)
  }
})
test('each group boundary revalidates before creating the session',async()=>{
  for (const boundary of ['mkdir','workspace']) {
    const f=fixture(),hold=deferred(),entered=deferred()
    const host={sessions:{using(){},async create(){f.calls.push('native-create');return 's'}},workspaces:{async createDirectory(){},async create(){if(boundary==='workspace'){entered.resolve();await hold.promise}return {workspaceId:'ws'}}},mkdir:async()=>{if(boundary==='mkdir'){entered.resolve();await hold.promise}}}
    f.deps.create=validate=>createCustomHostSession(host,{kind:'new',parent:'C:/groups',name:'new'},f.request.folder,validate)
    const pending=submitCustomTask(f.request,f.deps)
    await entered.promise;f.setProject({});hold.resolve()
    await assert.rejects(pending,/项目或窗口/)
    assert.deepEqual(f.calls,[])
  }
})
test('folder change or pane reorder while configuring never binds or sends the created session',async()=>{
  for (const change of [f=>f.setProject({folder:'C:/new',spec:f.spec}),f=>{const old=f.spec.main[0];f.spec.main[0]=f.spec.leftMore[0];f.spec.leftMore[0]=old}]) {
    const f=fixture();f.deps.configure=async()=>{change(f)}
    await assert.rejects(submitCustomTask(f.request,f.deps),/变化.*会话已创建/)
    assert.deepEqual(f.calls,['create'])
  }
})
