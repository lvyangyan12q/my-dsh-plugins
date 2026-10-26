import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url))
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom'),{buildSync}=require('esbuild')
const code=buildSync({stdin:{contents:"export * from './split'; export * from './widgetMount'; export * from './annotationTarget'",resolveDir:fileURLToPath(new URL('../01_content/src/client/',import.meta.url)),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime'],jsx:'automatic',define:{__WT_VERSION__:'"test"'},loader:{'.css':'text','.html':'text'}}).outputFiles[0].text

test('minimizing a pane fills its neighbors without remounting its iframe or losing its draft and ownership',async()=>{
  const dom=new JSDOM('<div id="mount"></div><div class="wSkVaW_root" data-phase="hero"><div class="wSkVaW_body"></div></div>',{url:'http://127.0.0.1/'})
  const names=['HTMLElement','self','window','document','navigator','localStorage','MutationObserver','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],old=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]))
  for(const name of names)Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='ResizeObserver'?class{observe(){}disconnect(){}}:name==='requestAnimationFrame'?()=>0:name==='cancelAnimationFrame'?()=>{}:dom.window[name],configurable:true,writable:true})
  dom.window.HTMLCanvasElement.prototype.getContext=()=>null
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  const rect={left:100,top:50,right:1900,bottom:950,width:1800,height:900}
  for(const el of dom.window.document.querySelectorAll('.wSkVaW_root,.wSkVaW_body'))el.getBoundingClientRect=()=>rect
  const module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports)
  const {splitStore,SplitWorkspace,setSplitEnv,widgetTargets,WidgetMountRegistry,captureAnnotationTarget,resolveAnnotationTarget}=module.exports

  const pane=(id,content)=>({id,title:id,min:120,tabs:content?[{id:'tab-'+id,title:id,content}]:[],active:0})
  const spec={id:'project',title:'Project',left:pane('l1',{kind:'iframe',url:'about:blank'}),leftMore:[pane('l2')],top:null,main:[pane('m1',{kind:'builtin',type:'custom'}),pane('m2'),pane('m3')],chatWidth:{default:400,min:360,max:700},leftWidth:{default:280,min:160,max:600},preferFileGeometry:true,fileGeometry:{chatW:400,topH:250,leftW:280,paneWs:{m1:400,m2:360,m3:358},topWs:{},leftWs:{l1:280,l2:280},leftHs:{l1:300,l2:573}}}
  spec.left.collapsed=true
  setSplitEnv({custom:{getProjects:()=>[{id:'project',name:'Project'}],currentProjectId:()=> 'project',getWorkspaces:()=>[],getSessions:async()=>({groups:[]})}})
  const {Simulate}=require('react-dom/test-utils')
  dom.window.HTMLElement.prototype.attachEvent=()=>{};dom.window.HTMLElement.prototype.detachEvent=()=>{}
  let root,captured
  const find=id=>[...dom.window.document.querySelectorAll('[data-worktable-pane]')].find(el=>el.dataset.worktablePane===id)
  const click=async(label)=>{const el=dom.window.document.querySelector('[aria-label="'+label+'"]');assert.ok(el,'action '+label+' is available');await act(async()=>el.click())}
  try{
    await act(async()=>{root=createRoot(dom.window.document.getElementById('mount'));root.render(React.createElement(SplitWorkspace))})
    await act(async()=>{assert.equal(splitStore.open(spec),true)})
    splitStore.onLayoutPersisted=(s,g)=>{captured={spec:structuredClone(s),geometry:structuredClone(g)}}
    const baseline=structuredClone(spec.fileGeometry),iframe=find('l1').querySelector('iframe'),leftOtherHeight=parseFloat(find('l2').style.height)
    iframe.contentDocument.body.textContent='live iframe state'
    const registry=new WidgetMountRegistry(dom.window.localStorage,()=> 'binding-test')
    const bindings=registry.begin('project',splitStore.spec,'C:/project','session','窗口3'),binding=bindings.find(b=>b.paneId==='m1')
    const annotation=captureAnnotationTarget(splitStore.spec,'main',0)
    await click('收起窗口1')
    assert.equal(find('l1').getAttribute('inert'),'');assert.equal(find('l1').style.visibility,'hidden')
    assert.ok(parseFloat(find('l2').style.height)>leftOtherHeight)
    assert.equal(find('l1').querySelector('iframe'),iframe);assert.equal(iframe.contentDocument.body.textContent,'live iframe state')
    assert.deepEqual(widgetTargets(splitStore.spec).map(t=>[t.pane.id,t.window]),[['l1','窗口1'],['l2','窗口2'],['m1','窗口3'],['m2','窗口4'],['m3','窗口5']])
    assert.equal(registry.isCurrent(binding,splitStore.spec,'C:/project'),true)
    await click('展开窗口1：l1')
    assert.equal(parseFloat(find('l1').style.height),300);assert.equal(find('l1').querySelector('iframe'),iframe);assert.equal(splitStore.spec.left.collapsed,true)
    const draft=find('m1').querySelector('textarea');await act(async()=>Simulate.change(draft,{target:{value:'keep this requirement'}}));draft.focus()
    await click('收起窗口3')
    assert.notEqual(dom.window.document.activeElement,draft);assert.equal(find('m1').getAttribute('inert'),'')
    assert.equal(registry.isCurrent(binding,splitStore.spec,'C:/project'),true);assert.ok(resolveAnnotationTarget(annotation,splitStore.spec))
    assert.deepEqual(captured.geometry,baseline,'automatic filling does not overwrite manual dimensions')
    const wideBefore=parseFloat(find('m2').style.width)
    const divider=[...dom.window.document.querySelectorAll('[title="拖动调整宽度"]')].find(el=>dom.window.getComputedStyle(el).visibility!=='hidden')
    const x=parseFloat(divider.style.left),y=parseFloat(divider.style.top)
    await act(async()=>{divider.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:x,clientY:y}));divider.dispatchEvent(new dom.window.MouseEvent('pointermove',{bubbles:true,clientX:x+50,clientY:y}));divider.dispatchEvent(new dom.window.MouseEvent('pointerup',{bubbles:true}))})
    assert.equal(parseFloat(find('m2').style.width),wideBefore+50)
    assert.equal(captured.geometry.paneWs.m1,baseline.paneWs.m1,'the hidden window keeps its manual baseline')
    await click('展开窗口3：m1')
    assert.equal(find('m1').querySelector('textarea'),draft);assert.equal(draft.value,'keep this requirement')
    assert.equal(splitStore.spec.main[0].collapsed,undefined,'minimization does not reinterpret header collapse')
    await click('收起窗口3')
    const {mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path')
    const {saveProjectLayout,readProjectLayout}=await import('../01_content/src/layout/project-layout.mjs')
    const folder=await mkdtemp(join(tmpdir(),'minimized-layout-'))
    try{
      const value={project:{id:'project',name:'Project'},...captured}
      assert.equal((await saveProjectLayout(folder,value,null)).status,'ok')
      const restored=await readProjectLayout(folder);assert.equal(restored.document.spec.main[0].minimized,true)
      assert.deepEqual(restored.document.geometry,captured.geometry)
      await act(async()=>{splitStore.close();splitStore.open({...restored.document.spec,fileGeometry:restored.document.geometry,preferFileGeometry:true})})
      assert.equal(find('m1').style.visibility,'hidden');assert.ok(dom.window.document.querySelector('[aria-label="展开窗口3：m1"]'))
    }finally{await rm(folder,{recursive:true,force:true})}
  }finally{if(root)await act(async()=>{splitStore.close();root.unmount()});setSplitEnv(null);dom.window.close();for(const n of names)old[n]?Object.defineProperty(globalThis,n,old[n]):delete globalThis[n]}
})
