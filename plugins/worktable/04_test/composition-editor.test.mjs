import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),React=require('react'),renderer=require('react-test-renderer'),{buildSync}=require('esbuild'),{act}=renderer
const rootDir=fileURLToPath(new URL('../01_content/',import.meta.url))
const built=buildSync({entryPoints:[rootDir+'src/client/compositionEditor.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],write:false});const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports)
const {CompositionEditor}=module.exports,flush=()=>new Promise(resolve=>setImmediate(resolve))
test('module-local draft editing previews without activation and activates only by explicit click',async()=>{
 const savedWindow=globalThis.window,savedFetch=globalThis.fetch;globalThis.window=Object.assign(new EventTarget(),{location:{origin:'http://localhost'}});const actions=[],opened=[];let revision=0,recipe;let root
 globalThis.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;if(body)actions.push(body.action??body.operation);let value=[]
 if(url.endsWith('/compositions')){if(body?.action==='save'){recipe=body.recipe;value={appId:body.appId,revision:++revision,draft:recipe}}else if(body?.action==='preview')value={appId:body.appId,revision,recipe};else if(body?.action==='activate')value={appId:body.appId,revision:++revision,draft:recipe,running:recipe}}
 if(body?.action==='create')value={id:'instance-one'};if(body?.action==='view')value={id:'view-one'};return {ok:true,json:async()=>value}}
 try{
 await act(async()=>{root=renderer.create(React.createElement(CompositionEditor,{projectId:'project-one',onCancel(){},onOpen:value=>opened.push(value)}));await flush()})
 const button=text=>root.root.findAllByType('button').find(node=>node.children.join('')===text)
 await act(async()=>{button('空白应用').props.onClick();await flush()})
 await act(async()=>{button('添加模块').props.onClick();await flush()})
 const type=root.root.findByProps({'aria-label':'模块类型'});await act(async()=>{type.props.onChange({target:{value:'website'}});await flush()})
 await act(async()=>{root.root.findByProps({'aria-label':'网页地址'}).props.onChange({target:{value:'https://example.com'}});await flush()})
 await act(async()=>{await button('预览').props.onClick();await flush()})
 assert.ok(actions.includes('save'));assert.ok(actions.includes('preview'));assert.ok(!actions.includes('activate'));assert.equal(opened.length,0)
 await act(async()=>{await button('启用应用').props.onClick();await flush()})
 assert.ok(actions.includes('activate'));assert.equal(opened[0].instanceId,'instance-one');assert.equal(recipe.pages[0].modules[0].config.url,'https://example.com')
 }finally{if(root)await act(async()=>root.unmount());globalThis.window=savedWindow;globalThis.fetch=savedFetch}
})
test('a late preview from a replaced app cannot cover the new app editor',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;globalThis.window=Object.assign(new EventTarget(),{location:{origin:'http://localhost'}});let root,release;const delayed=new Promise(resolve=>release=resolve)
 const recipe=name=>({title:name,version:'1.0.0',layout:'grid',pages:[{id:'home',title:'Home',modules:[{id:'module',type:'list',config:{title:name+' preview'}}]}],connections:[],roles:[]})
 globalThis.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):{};let value=[];if(body.action==='get')value={appId:body.appId,revision:1,draft:recipe(body.appId)};if(body.action==='save')value={appId:body.appId,revision:2,draft:body.recipe};if(body.action==='preview')value=await delayed;return {ok:true,json:async()=>value}}
 const props=appId=>({projectId:null,appId,onCancel(){}})
 try{await act(async()=>{root=renderer.create(React.createElement(CompositionEditor,props('app-a')));await flush()});let preview;await act(async()=>{preview=root.root.findAllByType('button').find(node=>node.children.join('')==='预览').props.onClick();await flush()});await act(async()=>{root.update(React.createElement(CompositionEditor,props('app-b')));await flush()});await act(async()=>{release({recipe:recipe('app-a')});await preview;await flush()});assert.doesNotMatch(JSON.stringify(root.toJSON()),/app-a preview/);assert.equal(root.root.findByProps({'aria-label':'应用名称'}).props.value,'app-b')
 }finally{if(root)await act(async()=>root.unmount());globalThis.window=oldWindow;globalThis.fetch=oldFetch}
})
