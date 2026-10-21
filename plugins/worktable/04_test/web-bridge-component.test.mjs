import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),React=require('react'),renderer=require('react-test-renderer'),{buildSync}=require('esbuild'),{act}=renderer
const rootDir=fileURLToPath(new URL('../01_content/',import.meta.url)),built=buildSync({entryPoints:[rootDir+'src/client/websiteBridge.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],write:false}),module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports)
const {WebsiteModule}=module.exports
const props={module:{id:'website',type:'website',connectionId:'data',config:{url:'https://external.test/app'}},recipe:{version:'1.0.0',connections:[{id:'data',viewId:'source',resourceId:'notes'}],roles:[]},props:{view:{id:'view'},instance:{id:'instance'}}}
test('ordinary website module starts with no bridge capability, request, native session or expanded permissions',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;globalThis.window=Object.assign(new EventTarget(),{location:{origin:'https://dsh.test'}});let root,calls=0;globalThis.fetch=async()=>{calls++;throw Error('No opt-in')}
 try{await act(async()=>{root=renderer.create(React.createElement(WebsiteModule,props))});const frame=root.root.findByType('iframe');assert.equal(frame.props.sandbox,'allow-scripts allow-forms allow-popups');assert.equal(frame.props.referrerPolicy,'no-referrer');assert.equal(frame.props.src,'https://external.test/app');assert.ok(root.root.findAllByType('input').every(input=>!input.props.checked));assert.equal(root.root.findAllByType('button').find(button=>button.children.join('')==='显式启用网站能力').props.disabled,true);assert.equal(calls,0)}finally{if(root)await act(async()=>root.unmount());globalThis.window=oldWindow;globalThis.fetch=oldFetch}
})
test('browser without actual embedded-CSP capability keeps authority closed even after explicit opt-in',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch,oldDocument=globalThis.document;globalThis.window=Object.assign(new EventTarget(),{location:{origin:'https://dsh.test'}});globalThis.document={createElement:()=>({})};let root,calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unsupported browser cannot create grant')}
 try{await act(async()=>{root=renderer.create(React.createElement(WebsiteModule,props))});await act(async()=>root.root.findAllByType('input')[0].props.onChange({target:{checked:true}}));await act(async()=>root.root.findAllByType('button').find(button=>button.children.join('')==='显式启用网站能力').props.onClick());assert.match(JSON.stringify(root.toJSON()),/未通过嵌入CSP实际隔离探测/);assert.equal(root.root.findByType('iframe').props.sandbox,'allow-scripts allow-forms allow-popups');assert.equal(calls,0)}finally{if(root)await act(async()=>root.unmount());globalThis.window=oldWindow;globalThis.fetch=oldFetch;globalThis.document=oldDocument}
})
test('late read-share receipt from a replaced module cannot write a success notice into its successor',async()=>{
 const oldWindow=globalThis.window,oldFetch=globalThis.fetch;globalThis.window=Object.assign(new EventTarget(),{location:{origin:'https://dsh.test'}});let root,release,pending;globalThis.fetch=async()=>new Promise(resolve=>release=resolve)
 try{await act(async()=>{root=renderer.create(React.createElement(WebsiteModule,props))});await act(async()=>{pending=root.root.findAllByType('button').find(button=>button.children.join('')==='授权此实例只读引用').props.onClick()});await act(async()=>root.update(React.createElement(WebsiteModule,{...props,props:{view:{id:'replacement-view'},instance:{id:'replacement-instance'}}})));await act(async()=>{release({ok:true,json:async()=>({})});await pending});assert.doesNotMatch(JSON.stringify(root.toJSON()),/所选资料已只读引用到当前实例/)
 }finally{if(root)await act(async()=>root.unmount());globalThis.window=oldWindow;globalThis.fetch=oldFetch}
})
