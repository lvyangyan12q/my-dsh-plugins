import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
import {dirname,join} from 'node:path'

const packageRoot=fileURLToPath(new URL('../01_content/',import.meta.url))
const require=createRequire(join(packageRoot,'package.json'))
const React=require('react'),renderer=require('react-test-renderer'),{buildSync}=require('esbuild')
const sourceFile=process.env.WORKTABLE_APPLICATION_COMPONENT_SOURCE??join(packageRoot,'src/client/applicationEntry.tsx')
const built=buildSync({stdin:{contents:readFileSync(sourceFile,'utf8'),sourcefile:'applicationEntry.tsx',resolveDir:join(packageRoot,'src/client'),loader:'tsx'},bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],write:false})
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports)
const {ApplicationPane,ApplicationPicker,applicationViews}=module.exports
const {act}=renderer
const flush=()=>new Promise(resolve=>setImmediate(resolve))

test('switching from delayed view A to B never shows A or targets its instance with B actions',async()=>{
  const previousWindow=globalThis.window,previousFetch=globalThis.fetch
  globalThis.window=Object.assign(new EventTarget(),{location:{origin:'http://127.0.0.1:3091'}})
  let releaseA;const delayedA=new Promise(resolve=>{releaseA=resolve}),actions=[],opened=[]
  const record=(name)=>({view:{id:'view-'+name,instanceId:'instance-'+name},instance:{id:'instance-'+name,projectId:null,revision:1},application:{id:'app-'+name,title:'应用'+name,url:'https://'+name.toLowerCase()+'.example.test/'}})
  globalThis.fetch=async(url,options)=>{
    const body=JSON.parse(options.body);actions.push(body)
    // Deliberately ignores AbortSignal: identity ownership must reject a late response too.
    const value=body.action==='resolve'?(body.viewId==='view-A'?await delayedA:record('B')):body.action==='view'?{id:'added-view',instanceId:body.instanceId}:{id:body.instanceId}
    return {ok:true,json:async()=>value}
  }
  const content=name=>({kind:'application',appId:'app-'+name,instanceId:'instance-'+name,viewId:'view-'+name,title:'应用'+name})
  const props=name=>({content:content(name),projects:[],onOpen:value=>opened.push(value),reloadKey:0})
  let root
  try {
    await act(async()=>{root=renderer.create(React.createElement(ApplicationPane,props('A')));await flush()})
    await act(async()=>{root.update(React.createElement(ApplicationPane,props('B')));await flush()})
    assert.equal(root.root.findByType('iframe').props.src,'https://b.example.test/')
    await act(async()=>{releaseA(record('A'));await flush()})
    assert.equal(root.root.findByType('iframe').props.src,'https://b.example.test/')
    const addView=root.root.findAllByType('button').find(button=>button.children.join('')==='添加同实例视图')
    assert.ok(addView,'B exposes its own add-view action')
    await act(async()=>{await addView.props.onClick();await flush()})
    assert.equal(actions.filter(a=>a.action==='view').at(-1).instanceId,'instance-B')
    assert.equal(opened.at(-1).instanceId,'instance-B')
  } finally {
    if(root)await act(async()=>root.unmount())
    globalThis.window=previousWindow;globalThis.fetch=previousFetch
  }
})

test('deep application renders its contributed module and withdrawal releases its view without making sessions',async()=>{
  const previousWindow=globalThis.window,previousFetch=globalThis.fetch
  globalThis.window=Object.assign(new EventTarget(),{location:{origin:'http://127.0.0.1:3091'}})
  const actions=[];let released=0,root
  const record={view:{id:'deep-view',instanceId:'deep-instance',type:'stats'},instance:{id:'deep-instance',appId:'reading',projectId:'project-one'},application:{id:'reading',kind:'deep',title:'Reading',views:[{id:'page',title:'Page'},{id:'stats',title:'Stats'}]}}
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);actions.push(body);return {ok:true,json:async()=>record}}
  function Stats({instance,view}){React.useEffect(()=>()=>{released++},[]);return React.createElement('output',null,instance.id+' / '+view.type)}
  let withdraw
  try {
    assert.ok(applicationViews,'public view registry is available to the plugin service')
    withdraw=applicationViews.register('reading',{page:Stats,stats:Stats})
    await act(async()=>{root=renderer.create(React.createElement(ApplicationPane,{content:{kind:'application',appId:'reading',instanceId:'deep-instance',viewId:'deep-view',title:'Reading'},projects:[],onOpen:()=>{},reloadKey:0}));await flush()})
    assert.equal(root.root.findByType('output').children.join(''),'deep-instance / stats')
    assert.equal(root.root.findAllByType('iframe').length,0)
    await act(async()=>{withdraw();await flush()})
    assert.equal(released,1)
    assert.match(JSON.stringify(root.toJSON()),/视图暂不可用/)
    assert.ok(actions.every(body=>['resume','resolve'].includes(body.action)))
  } finally {withdraw?.();if(root)await act(async()=>root.unmount());globalThis.window=previousWindow;globalThis.fetch=previousFetch}
})

test('a rejected action from replaced instance A does not mark instance B failed or busy',async()=>{
  const previousWindow=globalThis.window,previousFetch=globalThis.fetch
  globalThis.window=Object.assign(new EventTarget(),{location:{origin:'http://127.0.0.1:3091'}})
  let rejectAction,root
  const delayed=new Promise((_,reject)=>{rejectAction=reject})
  const record=name=>({view:{id:'view-'+name,instanceId:'instance-'+name,type:'page'},instance:{id:'instance-'+name,projectId:null,revision:1},application:{id:'app-'+name,title:name,kind:'web',url:'https://'+name.toLowerCase()+'.example.test/'}})
  globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);if(body.action==='view')await delayed;return {ok:true,json:async()=>record(body.viewId==='view-A'?'A':'B')}}
  const props=name=>({content:{kind:'application',appId:'app-'+name,instanceId:'instance-'+name,viewId:'view-'+name,title:name},projects:[],onOpen:()=>{},reloadKey:0})
  try {
    await act(async()=>{root=renderer.create(React.createElement(ApplicationPane,props('A')));await flush()})
    await act(async()=>{root.root.findAllByType('button').find(b=>b.children.join('')==='添加同实例视图').props.onClick();await flush()})
    await act(async()=>{root.update(React.createElement(ApplicationPane,props('B')));await flush()})
    assert.equal(root.root.findAllByType('button').find(b=>b.children.join('')==='添加同实例视图').props.disabled,false)
    await act(async()=>{rejectAction(new Error('old instance A failed'));await flush()})
    assert.doesNotMatch(JSON.stringify(root.toJSON()),/old instance A failed/)
  } finally {if(root)await act(async()=>root.unmount());globalThis.window=previousWindow;globalThis.fetch=previousFetch}
})

test('after opening A then explicitly creating B, the project picker restores older A with its existing view',async()=>{
  const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os')
  const {ApplicationDirectory}=await import('../01_content/src/framework/applications.mjs')
  const folder=await mkdtemp(join(tmpdir(),'worktable-picker-restore-')),apps=new ApplicationDirectory(join(folder,'apps.json'))
  const previousFetch=globalThis.fetch,opened=[],actions=[];let root
  try {
    await apps.contribute({id:'reading',title:'Reading',version:'1',kind:'deep',protocolVersion:1,views:[{id:'page',title:'Page'}]})
    const a=await apps.createInstance('reading','project-one'),aView=await apps.createView(a.id)
    const foreign=await apps.createInstance('reading','project-two');await apps.createView(foreign.id)
    globalThis.fetch=async(url,options)=>{
      assert.equal(url,'/api/worktable/applications')
      let value
      if(!options?.body)value=await apps.snapshot()
      else {const body=JSON.parse(options.body);actions.push(body);switch(body.action){
        case 'latest':value=await apps.latest(body.appId,body.projectId);break
        case 'resume':value=await apps.resume(body.instanceId);break
        case 'create':value=await apps.createInstance(body.appId,body.projectId);break
        case 'view':value=await apps.createView(body.instanceId);break
        default:assert.fail('unexpected request '+body.action)
      }}
      return {ok:true,json:async()=>value}
    }
    const mount=async()=>{await act(async()=>{root=renderer.create(React.createElement(ApplicationPicker,{projectId:'project-one',onCancel:()=>{},onOpen:content=>opened.push(content)}));await flush()});const deadline=Date.now()+5000;while(!root.root.findAllByType('button').some(button=>button.children.join('')==='继续最近实例')&&Date.now()<deadline)await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10))})}
    const click=async(label)=>{const button=root.root.findAllByType('button').find(b=>b.children.join('')===label);assert.ok(button,label);await act(async()=>{await button.props.onClick();await flush()})}
    await mount();await click('继续最近实例');assert.equal(opened.at(-1).instanceId,a.id)
    await act(async()=>root.unmount())
    await mount();await click('新建独立实例');const b=opened.at(-1);assert.notEqual(b.instanceId,a.id)
    await act(async()=>root.unmount())
    await mount()
    assert.doesNotMatch(JSON.stringify(root.toJSON()),new RegExp(foreign.id))
    await click('恢复实例 '+a.id.slice(0,8))
    assert.equal(opened.at(-1).instanceId,a.id)
    assert.equal(opened.at(-1).viewId,aView.id)
    assert.equal((await apps.snapshot()).instances.length,3)
    assert.equal((await apps.snapshot()).views.length,3)
    assert.equal(actions.filter(action=>action.action==='create').length,1)
    assert.equal(actions.filter(action=>action.action==='view').length,1)
    assert.equal((await apps.latest('reading','project-one')).id,a.id)
  } finally {if(root)await act(async()=>root.unmount());globalThis.fetch=previousFetch;await rm(folder,{recursive:true,force:true})}
})
