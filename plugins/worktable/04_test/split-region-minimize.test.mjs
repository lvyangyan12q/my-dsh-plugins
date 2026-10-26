import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url))
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom'),{buildSync}=require('esbuild')
const code=buildSync({stdin:{contents:"export * from './split'; export * from './widgetMount'; export * from './annotationTarget'",resolveDir:fileURLToPath(new URL('../01_content/src/client/',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime'],jsx:'automatic',define:{__WT_VERSION__:'"test"'},loader:{'.css':'text','.html':'text'}}).outputFiles[0].text

test('whole rows, columns and all windows can minimize and recover with native chat and manual dimensions intact',async()=>{
  const dom=new JSDOM('<div id="mount"></div><div class="wSkVaW_root" data-phase="hero"><div class="wSkVaW_body"></div></div>',{url:'http://127.0.0.1/'})
  const names=['HTMLElement','self','window','document','navigator','localStorage','MutationObserver','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],old=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]))
  for(const name of names)Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='ResizeObserver'?class{observe(){}disconnect(){}}:name==='requestAnimationFrame'?()=>0:name==='cancelAnimationFrame'?()=>{}:dom.window[name],configurable:true,writable:true})
  dom.window.HTMLCanvasElement.prototype.getContext=()=>null
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  let rect={left:100,top:50,right:1900,bottom:950,width:1800,height:900}
  for(const el of dom.window.document.querySelectorAll('.wSkVaW_root,.wSkVaW_body'))el.getBoundingClientRect=()=>rect
  const module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports)
  const {splitStore,SplitWorkspace,setSplitEnv,widgetTargets,WidgetMountRegistry,captureAnnotationTarget,resolveAnnotationTarget}=module.exports


  const pane=id=>({id,title:id,min:120,tabs:[],active:0})
  const geometry={chatW:520,topH:280,leftW:280,paneWs:{m1:500,m2:499},topWs:{t1:760,t2:759},leftWs:{l1:280,l2:280},leftHs:{l1:300,l2:573}}
  const spec={id:'regions',title:'Regions',left:pane('l1'),leftMore:[pane('l2')],top:[pane('t1'),pane('t2')],main:[pane('m1'),pane('m2')],chatWidth:{default:520,min:360,max:700},leftWidth:{default:280,min:160,max:600},topHeight:{default:280,min:80,max:700},preferFileGeometry:true,fileGeometry:geometry}
  const find=id=>[...document.querySelectorAll('[data-worktable-pane]')].find(el=>el.dataset.worktablePane===id&&el.parentElement.style.visibility!=='hidden')
  const click=async(label)=>{const el=[...document.querySelectorAll('[aria-label="'+label+'"]')].find(el=>dom.window.getComputedStyle(el).visibility!=='hidden');assert.ok(el,label);await act(async()=>el.click())}
  const native=document.querySelector('.wSkVaW_body'),host=document.querySelector('.wSkVaW_root')
  const size=el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top),w:parseFloat(el.style.width),h:parseFloat(el.style.height)})
  let root,captured
  try{
    await act(async()=>{root=createRoot(document.getElementById('mount'));root.render(React.createElement(SplitWorkspace));splitStore.open(spec)})
    splitStore.onLayoutPersisted=(spec,geometry)=>{captured={spec:structuredClone(spec),geometry:structuredClone(geometry)}}
    await click('收起窗口3');await click('收起窗口4')
    assert.equal(size(find('m1')).y,76,'remaining main row fills the top row area')
    assert.equal(native.style.marginTop,'26px')
    await click('收起窗口1');await click('收起窗口2')
    assert.equal(size(find('m1')).x,100,'remaining main row fills the left column area')
    await click('收起窗口5');await click('收起窗口6')
    assert.equal(parseFloat(host.style.getPropertyValue('--dsh-chat-user-width')),1800,'native chat fills all released content area')
    assert.equal(parseFloat(native.style.marginLeft),0)
    const bar=document.querySelector('.dsh-wt_splitBar');assert.equal(parseFloat(bar.style.width),1800,'recovery controls keep a real available width')
    assert.equal(document.querySelectorAll('[aria-label^="展开窗口"]').length,6)
    assert.deepEqual(captured.geometry,geometry,'all automatic filling keeps the manual geometry')
    const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
    const {saveProjectLayout,readProjectLayout}=await import('../01_content/src/layout/project-layout.mjs')
    const folder=await mkdtemp(join(tmpdir(),'minimized-regions-'))
    try{
      assert.equal((await saveProjectLayout(folder,{project:{id:'regions',name:'Regions'},...captured},null)).status,'ok')
      const result=await readProjectLayout(folder)
      assert.deepEqual(result.document.geometry,geometry)
      await act(async()=>{splitStore.close();splitStore.open({...result.document.spec,fileGeometry:result.document.geometry,preferFileGeometry:true})})
      assert.equal(document.querySelectorAll('[aria-label^="展开窗口"]').length,6)
      assert.equal(parseFloat(host.style.getPropertyValue('--dsh-chat-user-width')),1800)
    }finally{await rm(folder,{recursive:true,force:true})}
    await click('展开窗口3：t1')
    assert.equal(size(find('t1')).y,76)
    assert.equal(parseFloat(host.style.getPropertyValue('--dsh-chat-user-width')),1800,'with only a top row, native chat fills the row below')
    await click('展开窗口1：l1')
    assert.equal(size(find('l1')).w,280)
    assert.equal(parseFloat(host.style.getPropertyValue('--dsh-chat-user-width')),1520)
    await act(async()=>{splitStore.close();splitStore.open({...spec,id:'chat-full',chatFullHeight:true})})
    await click('收起窗口5');await click('收起窗口6')
    assert.equal(size(find('t1')).h,874,'top content fills the empty main content area beside full-height native chat')
    const narrowSpec=structuredClone(spec);for(const pane of [narrowSpec.left,...narrowSpec.leftMore,...narrowSpec.top,narrowSpec.main[0]])pane.minimized=true
    await act(async()=>{splitStore.close();rect={...rect,right:700,width:600};splitStore.open({...narrowSpec,id:'narrow'})})
    assert.equal(splitStore.chatW,520,'opening a narrow viewport does not rewrite the manual chat baseline')
    await click('收起窗口6')
    assert.notEqual(native.style.visibility,'hidden');assert.notEqual(native.inert,true)
    assert.equal(parseFloat(host.style.getPropertyValue('--dsh-chat-user-width')),600)
    assert.equal(parseFloat(document.querySelectorAll('.dsh-wt_splitBar')[2].style.width),600)
    const select=[...document.querySelectorAll('[aria-label="切换模块或原生对话"]')].at(-1)
    await act(async()=>{const {Simulate}=require('react-dom/test-utils');Simulate.change(select,{target:{value:'pane:m2'}})})
    assert.equal(splitStore.spec.main[1].minimized,false,'selecting a minimized narrow-screen window restores it')
    assert.equal(native.style.visibility,'hidden');assert.equal(find('m2').style.visibility,'')
    await act(async()=>{rect={...rect,right:1900,width:1800};splitStore.refreshGeom();splitStore.applyMargin();splitStore.notify()})
    assert.notEqual(native.style.visibility,'hidden');assert.equal(splitStore.chatW,520)
    assert.equal(parseFloat(host.style.getPropertyValue('--dsh-chat-user-width')),520)
    assert.equal(splitStore.topH,280);assert.equal(splitStore.leftW,280)
    await click('展开窗口3：t1')
    await act(async()=>{rect={...rect,bottom:150,height:100};splitStore.refreshGeom();splitStore.applyMargin();splitStore.notify()})
    const small=size(find('m2'));assert.ok(small.h>=0&&small.y+small.h<=150,'short viewports retain a bounded recoverable surface')
    const widePane=(id,min)=>({...pane(id),min})
    const constrained={...spec,id:'top-minimum',left:null,leftMore:null,chatFullHeight:true,top:[widePane('wide1',500),widePane('wide2',500)],main:[pane('main')],fileGeometry:{...geometry,chatW:500,topWs:{wide1:500,wide2:500},paneWs:{main:700},leftWs:{},leftHs:{}}}
    await act(async()=>{splitStore.close();rect={left:0,top:0,right:1200,bottom:900,width:1200,height:900};splitStore.open(constrained)})
    assert.ok(find('wide1').closest('div').parentElement.querySelector('.dsh-wt_narrowSelect'),'top row minimum widths trigger a recoverable single-surface layout')
    assert.equal(size(find('wide1')).w,1200)
    await act(async()=>{rect={...rect,right:1600,width:1600};splitStore.refreshGeom();splitStore.applyMargin();splitStore.notify()})
    assert.ok(size(find('wide1')).w>=500&&size(find('wide2')).w>=500,'when both top panes fit their minimum widths are preserved')
    assert.equal(splitStore.chatW,500,'viewport projection keeps the manual chat baseline')
    await act(async()=>{splitStore.close();rect={left:0,top:0,right:1800,bottom:300,width:1800,height:300};splitStore.open({...constrained,id:'top-height-minimum',topHeight:{default:260,min:260,max:700},fileGeometry:{...constrained.fileGeometry,topH:260}})})
    assert.ok(find('wide1').parentElement.querySelector('.dsh-wt_narrowSelect'),'top height and the native/main row minimum trigger single-surface recovery')
    assert.ok(size(find('wide1')).y+size(find('wide1')).h<=300)
    await act(async()=>{rect={...rect,bottom:500,height:500};splitStore.refreshGeom();splitStore.applyMargin();splitStore.notify()})
    assert.ok(size(find('wide1')).h>=260&&size(find('main')).h>=80,'fitting top and main rows keep both height minima')
    assert.equal(splitStore.topH,260)
    await act(async()=>{splitStore.close();rect={left:0,top:0,right:1800,bottom:160,width:1800,height:160};splitStore.open({...spec,id:'left-height-minimum',top:null,main:[pane('main')]})})
    assert.ok(find('l1').parentElement.querySelector('.dsh-wt_narrowSelect'),'stacked left panes need their cumulative minimum heights')
    assert.ok(size(find('l1')).y+size(find('l1')).h<=160)
    await act(async()=>{rect={...rect,bottom:300,height:300};splitStore.refreshGeom();splitStore.applyMargin();splitStore.notify()})
    assert.ok(size(find('l1')).h>=80&&size(find('l2')).h>=80,'left panes respect their height minima when they fit')
  }finally{if(root)await act(async()=>{splitStore.close();root.unmount()});dom.window.close();for(const n of names)old[n]?Object.defineProperty(globalThis,n,old[n]):delete globalThis[n]}
})
