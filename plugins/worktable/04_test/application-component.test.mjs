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
const {ApplicationPane}=module.exports
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
