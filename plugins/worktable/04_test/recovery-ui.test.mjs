import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {JSDOM} from 'jsdom'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),React=require('react'),{act,create}=require('react-test-renderer'),{buildSync}=require('esbuild');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('mounting or remounting the real overlay restores an already active project without switching projects or clearing its content',async()=>{
 const dom=new JSDOM('<div data-phase="active"><header></header><main></main></div>',{url:'http://localhost',pretendToBeVisual:true}),saved=new Map();let root,module;
 for(const [name,value] of Object.entries({window:dom.window,document:dom.window.document,self:dom.window,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,ResizeObserver:class{observe(){}disconnect(){}},localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window)})){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})}
 try{
 const built=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/split.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],write:false});module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);
 const {splitStore,SplitWorkspace}=module.exports;const native=dom.window.document.querySelector('[data-phase]');native.getBoundingClientRect=()=>({left:0,top:0,right:1200,bottom:800,width:1200,height:800});native.children[0].getBoundingClientRect=()=>({left:0,top:0,right:1200,bottom:40,width:1200,height:40});
 const content={kind:'iframe',url:'https://example.com/retained-view'};const spec={id:'existing-project',title:'Existing project',main:[{id:'pane',title:'Saved module',min:200,tabs:[{id:'saved-tab',title:'Saved module',content}],active:0}],chatWidth:{default:320,min:240,max:800}};
 assert.equal(splitStore.open(spec),true);await flush();assert.equal(splitStore.active,true);
 await act(async()=>{root=create(React.createElement(SplitWorkspace));await flush()});assert.equal(root.root.findAllByType('iframe').length,1,'an overlay mounted after open must seed its pool from the current public store');assert.equal(root.root.findByType('iframe').props.src,content.url);
 await act(async()=>root.unmount());assert.equal(splitStore.spec.id,spec.id);
 await act(async()=>{root=create(React.createElement(SplitWorkspace));await flush()});assert.equal(root.root.findByType('iframe').props.src,content.url);assert.equal(splitStore.spec.main[0].tabs[0].id,'saved-tab');
 }finally{if(root)await act(async()=>root.unmount());module?.exports.splitStore.close();for(const [name,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];dom.window.close()}
})
