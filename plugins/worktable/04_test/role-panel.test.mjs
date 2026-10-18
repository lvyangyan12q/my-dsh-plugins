import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),React=require('react'),{act,create}=require('react-test-renderer'),{buildSync}=require('esbuild')
const built=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/rolePanel.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],write:false})
const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports)
const {RolePanel,configureRoleNavigation}=module.exports
const flush=()=>new Promise(r=>setImmediate(r))
test('opening a role view only reads, native navigation reuses the bound identity and unmount sends no Stop',async()=>{
 const actions=[],opened=[];let root;const saved=globalThis.fetch
 configureRoleNavigation(async id=>opened.push(id))
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);actions.push(body);return {ok:true,json:async()=>body.action==='list'?{roles:[{id:'assistant',title:'Assistant',agent:{kind:'agent',source:'managed',id:'helper'},binding:{phase:'ready',sessionId:'same-native',revision:2,previousSessionIds:[]}}],capabilities:[]}:{sessionId:'same-native'}}}
 try{
 await act(async()=>{root=create(React.createElement(RolePanel,{instanceId:'instance-A'}));await flush()})
 assert.equal(actions.length,0)
 await act(async()=>{root.root.findByType('details').props.onToggle({currentTarget:{open:true}});await flush()})
 assert.deepEqual(actions.map(a=>a.action),['list'])
 await act(async()=>{await root.root.findAllByType('button').find(b=>b.children.join('')==='打开原生对话').props.onClick();await flush()})
 assert.deepEqual(opened,['same-native']);assert.equal(actions.at(-2).instanceId,'instance-A')
 await act(async()=>root.unmount());assert.ok(actions.every(row=>['list','open'].includes(row.action)))
 }finally{globalThis.fetch=saved}
})
