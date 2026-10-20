/** Runs the actual installed client factory, UI callbacks and native navigation contract. */
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {JSDOM} from 'jsdom'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),React=require('react'),{create,act}=require('react-test-renderer')
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
 const spec={id:'project',title:'Preserved project',main:[{id:'pane',title:'Module',min:200,tabs:[{id:'tab',title:'Example',content:{kind:'iframe',url:'https://example.com'}}],active:0},{id:'second-pane',title:'Second module',min:200,tabs:[{id:'second-tab',title:'Second',content:{kind:'iframe',url:'https://second.example.com'}}],active:0}],chatWidth:{default:384,min:384,max:800}}
 localStorage.setItem('dsh.worktable.projects.v1',JSON.stringify({layouts:[spec],bindings:{project:'existing'}}));exports.apply(ctx)
 await act(async()=>{root=create(React.createElement(exports.WorktableSection));await flush()})
 const buttons=()=>root.root.findAllByType('button');const project=buttons().find(b=>b.props['data-wt-id']==='project')??buttons().find(b=>b.findAllByType('span').some(s=>s.children.includes('Preserved project')))
 assert.ok(project,'installed Worktable project button must be rendered')
 await act(async()=>{await project.props.onClick({currentTarget:{}});await flush()})
 assert.equal(panel,null);assert.equal(store.active,true);assert.equal(store.spec.id,'project');assert.equal(store.spec.main[0].tabs[0].id,'tab');assert.ok(opened.every(id=>id==='existing'))
 await act(async()=>{layout.selectPanel('plugins');await flush()});assert.equal(panel,'plugins','a single native click must retain global panel');assert.equal(store.active,false)
 await act(async()=>{await project.props.onClick({currentTarget:{}});await flush()});assert.equal(store.active,true);assert.equal(panel,null)
 await act(async()=>{overlay=create(React.createElement(overlayComponent));await flush()})
 const nativeInput=document.querySelector('[data-phase] main textarea');nativeInput.focus()
 await act(async()=>{frameWidth=444;store.syncAnchor();await flush()})
 const mobilePanes=()=>overlay.root.findAllByProps({className:'dsh-wt_pane'})
 assert.equal(mobilePanes()[0].props.style.width,444,'narrow module must use entire available 444px rather than the old 60px remainder')
 const nativeBody=document.querySelector('[data-phase]').children[1]
 assert.notEqual(document.activeElement,nativeInput)
 assert.equal(nativeBody.inert,true,'native composer must not be focusable behind the application')
 const mobileSelect=()=>overlay.root.findByProps({'aria-label':'切换模块或原生对话'})
 assert.equal(mobilePanes()[1].props.inert,'');assert.equal(mobilePanes()[1].props.style.visibility,'hidden')
 await act(async()=>{mobileSelect().props.onChange({target:{value:'pane:second-pane'}});await flush()})
 assert.equal(mobilePanes()[1].props.style.width,444);assert.equal(mobilePanes()[1].props.style.visibility,undefined);assert.equal(mobilePanes()[0].props.inert,'')
 assert.equal(store.spec.main[0].tabs[0].id,'tab');assert.equal(store.spec.main[1].tabs[0].id,'second-tab')
 await act(async()=>{mobileSelect().props.onChange({target:{value:'native'}});await flush()})
 assert.equal(nativeBody.inert,false);assert.equal(nativeBody.style.visibility,'');assert.ok(mobilePanes().every(p=>p.props.style.visibility==='hidden'&&p.props.inert===''))
 await act(async()=>{mobileSelect().props.onChange({target:{value:'pane:pane'}});await flush()})
 assert.equal(nativeBody.inert,true);assert.equal(mobilePanes()[0].props.style.visibility,undefined)
 await act(async()=>{frameWidth=1200;store.syncAnchor();await flush()})
 assert.equal(nativeBody.inert,false);assert.equal(nativeBody.style.visibility,'');assert.equal(overlay.root.findAllByProps({'aria-label':'切换模块或原生对话'}).length,0)
 assert.equal(document.activeElement,nativeInput);assert.equal(nativeInput.value,'Untouched native draft')

 const annot=()=>overlay.root.findAllByType('button').find(b=>b.props.className==='dsh-wt_annotBtn')
 await act(async()=>{annot().props.onClick();await flush()})
 await act(async()=>{document.body.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,clientX:100,clientY:100}));document.body.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true,clientX:100,clientY:100}));await flush()})
 const editor=()=>overlay.root.findByProps({className:'dsh-wt_annotInput'})
 await act(async()=>{editor().props.onChange({target:{value:'Keep this request'}});await flush()})
 await act(async()=>{store.setTabContent('main',0,'tab',{kind:'iframe',url:'https://replacement.example.com'});await flush()})
 await act(async()=>{overlay.root.findByProps({className:'dsh-wt_annotOk'}).props.onClick();await flush()})
 assert.equal(draft,'','replacement cannot receive original annotation');assert.equal(editor().props.value,'Keep this request');assert.ok(overlay.root.findAllByProps({role:'alert'}).some(n=>n.children.join('').includes('保留')))
 await act(async()=>{overlay.root.findByProps({className:'dsh-wt_annotNo'}).props.onClick();await flush()})
 await act(async()=>{annot().props.onClick();await flush()})
 await act(async()=>{document.body.dispatchEvent(new window.MouseEvent('mousedown',{bubbles:true,clientX:100,clientY:100}));document.body.dispatchEvent(new window.MouseEvent('mouseup',{bubbles:true,clientX:100,clientY:100}));await flush();editor().props.onChange({target:{value:'Explicit second request'}});await flush()})
 await act(async()=>{overlay.root.findByProps({className:'dsh-wt_annotOk'}).props.onClick();await flush()})
 assert.match(draft,/稳定目标/);assert.match(draft,/project/);assert.match(draft,/replacement.example.com/);assert.match(draft,/Explicit second request/)
 const before=opened.length;await act(async()=>{store.close();await flush()});assert.equal(opened.length,before+1,'explicit close keeps existing restore intent')
 console.log('installed client callback gate passed: narrow full-width module/native switch, inert/focus/draft restoration; native panel reveal/leave/reopen, stable IDs, explicit restore; annotation replacement refused with draft preserved; explicit annotation fills native draft only')
}finally{window.__dshWorktable?.splitStore.close(false);if(overlay)await act(async()=>overlay.unmount());if(root)await act(async()=>root.unmount());for(const f of cleanup.reverse())f();await flush();dom.window.close();for(const[name,descriptor]of saved)if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name]}
