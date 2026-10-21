import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),React=require('react'),renderer=require('react-test-renderer'),{buildSync}=require('esbuild'),{act}=renderer
const rootDir=fileURLToPath(new URL('../01_content/',import.meta.url)),built=buildSync({entryPoints:[rootDir+'src/client/compositionRuntime.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],write:false}),module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports)
const {CompositionRuntime,CustomArtifact}=module.exports,flush=()=>new Promise(resolve=>setImmediate(resolve))
test('same-instance filters and selection update all views while data calls always carry each consumer view',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;globalThis.window=Object.assign(new EventTarget(),{location:{origin:'http://localhost'}});let root;const calls=[];let state={instanceId:'target-instance',revision:0,scopes:{}}
 const rows=[{id:'one',title:'合同'},{id:'two',title:'资料'}]
 globalThis.fetch=async(url,options={})=>{const body=JSON.parse(options.body);calls.push(body);let value
 if(body.action==='state-read')value=structuredClone(state)
 else if(body.action==='state-save'){state={...state,revision:state.revision+1,scopes:{...state.scopes,[body.scopeId]:{filters:body.filters,selectedId:body.selectedId}}};value=structuredClone(state)}
 else if(body.action==='resolve')value={instance:{id:'source-instance'}}
 else if(body.operation==='call')value={value:{revision:'1',records:rows},connection:{ownerInstanceId:'source-instance',consumerInstanceId:'target-instance',resourceId:'records'}}
 return {ok:true,json:async()=>value}}
 const recipe={layout:'grid',pages:[{id:'home',modules:[{id:'search',type:'filter',connectionId:'source',config:{fields:[{id:'query',label:'搜索'}]}},{id:'list',type:'list',connectionId:'source',config:{mapping:{id:'id',title:'title'}}},{id:'detail',type:'detail',connectionId:'source',config:{fields:[{field:'title',label:'选择'}]}}]}],connections:[{id:'source',viewId:'source-view',resourceId:'records'}]}
 const props=id=>({application:{id:'board'},instance:{id:'target-instance'},view:{id,type:'page'},recipe})
 try{await act(async()=>{root=renderer.create(React.createElement('div',null,React.createElement(CompositionRuntime,props('view-a')),React.createElement(CompositionRuntime,props('view-b'))));await flush();await flush()})
 const listButtons=()=>root.root.findAllByType('button').filter(button=>button.children.join('')==='合同')
 assert.equal(listButtons().length,2);await act(async()=>{listButtons()[0].props.onClick();await flush();await flush()})
 assert.ok(listButtons().every(button=>button.props['aria-pressed']===true))
 const inputs=root.root.findAllByProps({'aria-label':'搜索'});await act(async()=>{inputs[0].props.onChange({target:{value:'资料'}});await flush()})
 const apply=root.root.findAllByType('button').find(button=>button.children.join('')==='应用筛选');await act(async()=>{await apply.props.onClick();await flush();await flush()})
 assert.equal(listButtons().length,0);assert.ok(calls.filter(body=>body.operation==='call').every(body=>['view-a','view-b'].includes(body.viewId)))
 }finally{if(root)await act(async()=>root.unmount());globalThis.window=oldWindow;globalThis.fetch=oldFetch}
})
test('selected custom artifact uses an opaque script sandbox and no native frame origin',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>({ok:true,text:async()=>'<html><body>已生成页面</body></html>'});let root
 try{await act(async()=>{root=renderer.create(React.createElement(CustomArtifact,{path:'D:/artifacts/approved.html',title:'产物'}));await flush()});const frame=root.root.findByType('iframe');assert.equal(frame.props.sandbox,'allow-scripts');assert.ok(!frame.props.src);assert.match(frame.props.srcDoc,/已生成页面/)}finally{if(root)await act(async()=>root.unmount());globalThis.fetch=oldFetch}
})
test('resource module navigates inside its card, media and website render, and conversation opens only the bound native session',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;globalThis.window=Object.assign(new EventTarget(),{location:{origin:'http://localhost'}});let root;const paths=[],opened=[]
 globalThis.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):{};if(url.includes('/fs')){paths.push(body.path);return {ok:true,json:async()=>({entries:body.path==='D:/safe'?[{name:'docs',path:'D:/safe/docs',isDir:true}]:[{name:'页面.html',path:'D:/safe/docs/page.html',isDir:false}]})}}return {ok:true,json:async()=>({instanceId:'instance',revision:0,scopes:{}}),text:async()=>'<p>合规产物</p>'}}
 const roles={read:async()=>({binding:{phase:'ready',sessionId:'native-session',revision:3},unavailable:null}),ensure:async()=>{throw Error('read must never create')},open:async(...args)=>opened.push(args)}
 const recipe={layout:'grid',pages:[{id:'home',modules:[{id:'files',type:'resources',config:{path:'D:/safe'}},{id:'site',type:'website',config:{url:'https://example.com'}},{id:'media',type:'animation',config:{url:'https://example.com/image.gif'}},{id:'native',type:'conversation',roleId:'assistant',config:{}}]}],connections:[]}
 try{await act(async()=>{root=renderer.create(React.createElement(CompositionRuntime,{recipe,application:{id:'board'},instance:{id:'instance'},view:{id:'view',type:'page'},roles}));await flush();await flush()})
 const button=text=>root.root.findAllByType('button').find(node=>node.children.join('').includes(text))
 await act(async()=>{button('docs').props.onClick();await flush()});assert.deepEqual(paths,['D:/safe','D:/safe/docs']);assert.ok(button('页面.html'))
 await act(async()=>{button('页面.html').props.onClick();await flush()});assert.ok(root.root.findAllByType('iframe').every(frame=>!frame.props.sandbox.includes('allow-same-origin')));assert.equal(root.root.findByType('img').props.src,'https://example.com/image.gif')
 assert.equal(root.root.findAllByType('textarea').length,0);assert.equal(opened.length,0);await act(async()=>{await button('打开同一原生会话').props.onClick();await flush()});assert.deepEqual(opened,[['assistant','native-session',3]])
 }finally{if(root)await act(async()=>root.unmount());globalThis.window=oldWindow;globalThis.fetch=oldFetch}
})
test('late old artifact read cannot replace the selected new module artifact',async()=>{
 const oldFetch=globalThis.fetch;let release,root;const delayed=new Promise(resolve=>release=resolve)
 globalThis.fetch=async url=>({ok:true,text:async()=>String(url).includes('old.html')?await delayed:'<p>NEW ARTIFACT</p>'})
 try{await act(async()=>{root=renderer.create(React.createElement(CustomArtifact,{path:'D:/old.html'}));await flush()});await act(async()=>{root.update(React.createElement(CustomArtifact,{path:'D:/new.html'}));await flush()});await act(async()=>{release('<p>OLD ARTIFACT</p>');await flush()});assert.match(root.root.findByType('iframe').props.srcDoc,/NEW ARTIFACT/)
 }finally{if(root)await act(async()=>root.unmount());globalThis.fetch=oldFetch}
})
