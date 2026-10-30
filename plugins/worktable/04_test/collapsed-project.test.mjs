/** Runs the actual installed client factory, UI callbacks and native navigation contract. */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'

const require=createRequire(new URL('../01_content/package.json',import.meta.url)),{JSDOM}=require('jsdom'),React=require('react'),{create,act}=require('react-test-renderer')
const bundle=process.argv[2]??fileURLToPath(new URL('../01_content/lib/client.js',import.meta.url))
const dom=new JSDOM('<html><head></head><body></body></html>',{url:'http://localhost',pretendToBeVisual:true}),saved=new Map(),cleanup=[]
let root,overlay,exports,overlayComponent,draft=''
const installGlobals={window:dom.window,self:dom.window,document:dom.window.document,navigator:dom.window.navigator,HTMLElement:dom.window.HTMLElement,Element:dom.window.Element,CustomEvent:dom.window.CustomEvent,MutationObserver:dom.window.MutationObserver,ResizeObserver:class{observe(){}disconnect(){}},localStorage:dom.window.localStorage,requestAnimationFrame:dom.window.requestAnimationFrame.bind(dom.window),cancelAnimationFrame:dom.window.cancelAnimationFrame.bind(dom.window),fetch:async()=>({ok:true,json:async()=>({applications:[],instances:[],views:[],connections:[],items:[],groups:[]})})}
for(const[name,value]of Object.entries(installGlobals)){saved.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,configurable:true,writable:true})}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
try{
 dom.window.HTMLCanvasElement.prototype.getContext=()=>null;let captured;window.__ModuleLoader__={load:d=>captured=d};new Function(readFileSync(bundle,'utf8'))();assert.equal(captured.id,'dsh-worktable');exports=captured.factory(id=>{if(id==='react'||id==='react/jsx-runtime')return require(id);throw Error('unexpected external '+id)})
 const store=window.__dshWorktable.splitStore;let frameWidth=1200;let panel='plugins',signal=new AbortController(),listeners=new Set(),opened=[]
 function anchor(){document.querySelector('[data-phase]')?.remove();const el=document.createElement('div');el.dataset.phase='active';el.innerHTML='<header></header><main><textarea>Untouched native draft</textarea></main>';el.getBoundingClientRect=()=>({left:0,top:0,right:frameWidth,bottom:800,width:frameWidth,height:800});el.children[0].getBoundingClientRect=()=>({left:0,top:0,right:frameWidth,bottom:40,width:frameWidth,height:40});document.body.append(el)}
 const layout={panelInfo:{getSnapshot:()=>({activePanelId:panel}),subscribe:f=>{listeners.add(f);return()=>listeners.delete(f)}},selectPanel(id){signal.abort();panel=id;if(id!==null)document.querySelector('[data-phase]')?.remove();else anchor();for(const f of [...listeners])f()},beginNavigation(){signal.abort();signal=new AbortController();return signal.signal}}
 const snapshot={current:'existing',byId:{existing:{id:'existing',cwd:'',running:false}}}
 const ctx={get:name=>name==='layout'?layout:name==='uiWorkspace'?{openSession(id){opened.push(id);layout.selectPanel(null)}}:undefined,provide(){},effect:f=>{const dispose=f();if(typeof dispose==='function')cleanup.push(dispose)},inject(){},sessions:{scope:()=>({}),list:{getSnapshot:()=>snapshot,subscribe:()=>()=>{}}},conversation:{input:{for:()=>({state:{getSnapshot:()=>({draft,draftRev:0,phase:'plain',occurrences:[]})},actions:{insertText:text=>{draft+=text;return true}}})}},workspaces:{},slots:{entries:()=>[],subscribe:()=>()=>{},inject(_name,fn){fn()},register(options,component){if(options.name==='shell.overlay')overlayComponent=component;return()=>{}}}}
 localStorage.setItem('dsh.worktable.projects.v1',JSON.stringify({layouts:[],bindings:{'wt-console':'existing'}}));exports.apply(ctx)
 await act(async()=>{root=create(React.createElement(exports.WorktableSection,{wide:false}));await flush()})
 await act(async()=>{root.root.findByProps({'aria-label':'控制室'}).props.onClick({currentTarget:{}});await flush()})
 await act(async()=>{overlay=create(React.createElement(overlayComponent));await flush()})
 const add=overlay.root.findByProps({title:'添加项目'});await act(async()=>{add.props.onClick();await flush()})
 assert.ok(root.root.findAllByProps({className:'dsh-wt_menu dsh-wt_add dsh-wt_pop'}).length,'collapsed sidebar must immediately render the add-project dialog')
 assert.equal(root.root.findByProps({className:'dsh-wt_section dsh-wt_rail'}).props.className,'dsh-wt_section dsh-wt_rail','plugin must not expand native sidebar to expose dialog')
 const dialog=()=>root.root.findByProps({role:'dialog','aria-label':'添加项目'});await act(async()=>{dialog().props.onKeyDown({key:'Escape',nativeEvent:{isComposing:true}});await flush()});assert.ok(dialog(),'IME composing Escape must keep dialog');await act(async()=>{dialog().props.onKeyDown({key:'Escape',nativeEvent:{isComposing:false}});await flush()});assert.equal(root.root.findAllByProps({role:'dialog','aria-label':'添加项目'}).length,0)
 console.log('collapsed sidebar add-project public click and composing-Escape passed')
}finally{window.__dshWorktable?.splitStore.close(false);if(overlay)await act(async()=>overlay.unmount());if(root)await act(async()=>root.unmount());for(const f of cleanup.reverse())f();await flush();dom.window.close();for(const[name,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}
