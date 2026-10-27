import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url))
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{JSDOM}=require('jsdom'),{buildSync}=require('esbuild')
const code=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/split.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',external:['react','react/jsx-runtime'],jsx:'automatic',define:{__WT_VERSION__:'"test"'},loader:{'.css':'text','.html':'text'}}).outputFiles[0].text

test('actual pane dividers resize adjacent windows and persist left heights across reopen',async()=>{
  const dom=new JSDOM('<div id="mount"></div><div class="wSkVaW_root" data-phase="hero"><div class="wSkVaW_body"></div></div>',{url:'http://127.0.0.1/'})
  const names=['HTMLElement','self','window','document','navigator','localStorage','MutationObserver','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],old=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]))
  for(const name of names)Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='ResizeObserver'?class{observe(){}disconnect(){}}:name==='requestAnimationFrame'?()=>0:name==='cancelAnimationFrame'?()=>{}:dom.window[name],configurable:true,writable:true})
  dom.window.HTMLCanvasElement.prototype.getContext=()=>null
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  const rect={left:100,top:50,right:1900,bottom:950,width:1800,height:900}
  for(const el of dom.window.document.querySelectorAll('.wSkVaW_root,.wSkVaW_body'))el.getBoundingClientRect=()=>rect
  const module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports)
  const {splitStore,SplitWorkspace}=module.exports
  const pane=(id)=>({id,title:id,min:120,tabs:[],active:0})
  const spec={id:'resizable',title:'Resize',left:pane('l1'),leftMore:[pane('l2')],top:[pane('t1'),pane('t2')],main:[pane('m1'),pane('m2')],chatWidth:{default:400,min:360,max:700},leftWidth:{default:280,min:160,max:600},topHeight:{default:250,min:80,max:700},preferFileGeometry:true,fileGeometry:{chatW:400,topH:250,leftW:280,paneWs:{m1:560,m2:560},topWs:{t1:760,t2:760},leftWs:{l1:280,l2:280},leftHs:{l1:300,l2:573}}}
  let root,captured
  const panes=()=>[...dom.window.document.querySelectorAll('.dsh-wt_pane')].filter(el=>dom.window.getComputedStyle(el).visibility!=='hidden').map(el=>({title:el.querySelector('.dsh-wt_paneTitle')?.textContent,width:parseFloat(el.style.width),height:parseFloat(el.style.height),left:parseFloat(el.style.left),top:parseFloat(el.style.top)}))
  const drag=async(el,dx,dy)=>{
    assert.ok(el,'visible divider exists');const p={x:parseFloat(el.style.left),y:parseFloat(el.style.top)}
    await act(async()=>{el.dispatchEvent(new dom.window.MouseEvent('pointerdown',{bubbles:true,clientX:p.x,clientY:p.y}));el.dispatchEvent(new dom.window.MouseEvent('pointermove',{bubbles:true,clientX:p.x+dx,clientY:p.y+dy}));el.dispatchEvent(new dom.window.MouseEvent('pointerup',{bubbles:true}))})
  }
  try{
    await act(async()=>{root=createRoot(dom.window.document.getElementById('mount'));root.render(React.createElement(SplitWorkspace))})
    await act(async()=>{assert.equal(splitStore.open(spec),true)})
    splitStore.onLayoutPersisted=(s,g)=>{captured={spec:structuredClone(s),geometry:structuredClone(g)}}
    const before=panes(),leftDivider=dom.window.document.querySelector('[title="拖动调整左列上下高度"]')
    await drag(leftDivider,0,60)
    let after=panes();assert.equal(after.find(p=>p.title==='l1').height,before.find(p=>p.title==='l1').height+60);assert.equal(after.find(p=>p.title==='l2').height,before.find(p=>p.title==='l2').height-60)
    const mainDivider=[...dom.window.document.querySelectorAll('[title="拖动调整宽度"]')].at(-1),mainBefore=panes().filter(p=>p.title.startsWith('m'))
    await drag(mainDivider,75,0)
    after=panes().filter(p=>p.title.startsWith('m'));assert.equal(after[0].width,mainBefore[0].width+75);assert.equal(after[1].width,mainBefore[1].width-75)
    await drag([...dom.window.document.querySelectorAll('[title="拖动调整宽度"]')][0],-55,0)
    const saved=panes();assert.equal(captured.geometry.leftHs.l1,360)
    await act(async()=>{splitStore.close();splitStore.open({...captured.spec,fileGeometry:captured.geometry,preferFileGeometry:true})})
    assert.deepEqual(panes(),saved)
    const chatDivider=dom.window.document.querySelector('[title="拖动调整聊天宽度"]')
    const beforeChat=panes().filter(p=>p.title.startsWith('m')).reduce((n,p)=>n+p.width,0)
    await drag(chatDivider,-50,0)
    assert.equal(panes().filter(p=>p.title.startsWith('m')).reduce((n,p)=>n+p.width,0),beforeChat-50)
    const topBefore=panes().find(p=>p.title==='t1').height
    await drag(dom.window.document.querySelector('[title="拖动调整上下分区"]'),0,45)
    assert.equal(panes().find(p=>p.title==='t1').height,topBefore+45)
    await drag(dom.window.document.querySelector('[title="拖动调整左右列宽"]'),10000,0)
    assert.ok(panes().filter(p=>p.title.startsWith('m')).every(p=>p.width>=120))
    await drag(dom.window.document.querySelector('[title="拖动调整左列上下高度"]'),0,10000)
    assert.ok(panes().find(p=>p.title==='l2').height>=80)
    assert.ok(panes().every(p=>p.width>=0&&p.height>=0&&p.left+p.width<=1900.01&&p.top+p.height<=950.01))
    await act(async()=>{splitStore.close();splitStore.open({...spec,id:'full-height',chatFullHeight:true})})
    assert.ok(panes().filter(p=>p.title.startsWith('t')).every(p=>p.left+p.width<=1500.01),'full-height native chat never overlaps the top row')
    await act(async()=>{splitStore.close();splitStore.open({...spec,id:'left-chat',left:null,leftMore:null,chatSide:'left'})})
    const leftChatBefore=splitStore.chatW
    await drag([...dom.window.document.querySelectorAll('[title="拖动调整聊天宽度"]')].find(el=>dom.window.getComputedStyle(el).visibility!=='hidden'),40,0)
    assert.equal(splitStore.chatW,leftChatBefore+40)
    assert.ok(panes().filter(p=>p.title.startsWith('m')).every(p=>p.left>=100+splitStore.chatW))
    const native=dom.window.document.querySelector('.wSkVaW_body')
    // Chrome serializes fractional pixel assignments with less precision than DOMRect.
    // Model that browser CSSOM boundary while exercising the public pointer/UI path.
    for(const field of ['marginLeft','marginRight','marginTop']){
      let proto=Object.getPrototypeOf(native.style),descriptor
      while(proto&&!descriptor){descriptor=Object.getOwnPropertyDescriptor(proto,field);proto=Object.getPrototypeOf(proto)}
      Object.defineProperty(native.style,field,{configurable:true,get(){return descriptor.get.call(this)},set(value){descriptor.set.call(this,/^-?[\d.]+px$/.test(value)?Number(parseFloat(value).toFixed(3))+'px':value)}})
    }
    await act(async()=>{splitStore.close();Object.assign(rect,{right:1456.3636474609375,width:1356.3636474609375});splitStore.open({...spec,id:'fractional-cssom',left:null,leftMore:null,top:null,main:[pane('m1')],fileGeometry:{chatW:395,topH:250,leftW:0,paneWs:{m1:960},topWs:{},leftWs:{},leftHs:{}}})})
    await drag([...dom.window.document.querySelectorAll('[title="拖动调整聊天宽度"]')].find(el=>dom.window.getComputedStyle(el).visibility!=='hidden'),-35,0)
    assert.equal(splitStore.active,true,'CSSOM normalization of our own drag must not yield the workspace')
    await act(async()=>{[...dom.window.document.querySelectorAll('[aria-label="收起窗口1"]')].find(el=>dom.window.getComputedStyle(el).visibility!=='hidden').click()})
    assert.equal(splitStore.active,true,'minimizing with fractional geometry must keep the workspace open')
    await act(async()=>{[...dom.window.document.querySelectorAll('[aria-label="展开窗口1：m1"]')].find(el=>dom.window.getComputedStyle(el).visibility!=='hidden').click()})
    assert.equal(splitStore.active,true,'restoring with fractional geometry must keep the workspace open')
    await act(async()=>{Object.assign(rect,{right:700.3636474609375,width:600.3636474609375});splitStore.refreshGeom();splitStore.applyMargin();splitStore.notify()})
    assert.equal(splitStore.active,true,'narrow-mode CSSOM writes must not yield the workspace')
    await act(async()=>{Object.assign(rect,{right:1456.3636474609375,width:1356.3636474609375});splitStore.syncAnchor()})
    assert.equal(splitStore.active,true,'reanchoring records the browser-normalized margins')
    await act(async()=>{native.style.marginLeft='17px';await Promise.resolve()})
    assert.equal(splitStore.active,false,'a real external margin override still yields the workspace')
  }finally{if(root)await act(async()=>{splitStore.close();root.unmount()});dom.window.close();for(const n of names)old[n]?Object.defineProperty(globalThis,n,old[n]):delete globalThis[n]}
})


test('legacy stacked panes without min remain visible and keep their labels and tabs',async()=>{
  const dom=new JSDOM('<div id="mount"></div><div class="wSkVaW_root" data-phase="hero"><div class="wSkVaW_body"></div></div>',{url:'http://127.0.0.1/'})
  const names=['HTMLElement','self','window','document','navigator','localStorage','MutationObserver','ResizeObserver','requestAnimationFrame','cancelAnimationFrame','CustomEvent','IS_REACT_ACT_ENVIRONMENT'],old=Object.fromEntries(names.map(n=>[n,Object.getOwnPropertyDescriptor(globalThis,n)]))
  for(const name of names)Object.defineProperty(globalThis,name,{value:name==='IS_REACT_ACT_ENVIRONMENT'?true:name==='ResizeObserver'?class{observe(){}disconnect(){}}:name==='requestAnimationFrame'?()=>0:name==='cancelAnimationFrame'?()=>{}:dom.window[name],configurable:true,writable:true})
  dom.window.HTMLCanvasElement.prototype.getContext=()=>null
  dom.window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}})
  for(const e of document.querySelectorAll('.wSkVaW_root,.wSkVaW_body'))e.getBoundingClientRect=()=>({left:280,top:76,right:1920,bottom:855,width:1640,height:779})
  const module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports)
  const {splitStore,SplitWorkspace}=module.exports
  const pane=id=>({id,title:id,tabs:[{id:'tab-'+id,title:id,content:{kind:'iframe',url:'about:blank'}}],active:0})
  const spec={id:'legacy-left',title:'Legacy',left:pane('p1'),leftMore:[pane('p2')],top:null,main:[{...pane('p3'),min:200,minimized:true}],chatWidth:{default:492,min:360,max:640},leftWidth:{default:838,min:420,max:1400},preferFileGeometry:true}
  let root
  try{
    await act(async()=>{root=createRoot(document.getElementById('mount'));root.render(React.createElement(SplitWorkspace));splitStore.open(spec)})
    for(const id of ['p1','p2']){
      const e=document.querySelector('[data-worktable-pane="'+id+'"]')
      assert.ok(parseFloat(e.style.width)>0,id+' must not be zero-width')
      assert.equal(dom.window.getComputedStyle(e).visibility,'visible')
      assert.equal(e.querySelector('iframe').getAttribute('src'),'about:blank')
      assert.ok(document.querySelector('[aria-label="收起窗口'+(id==='p1'?1:2)+'"]'))
    }
    assert.equal(splitStore.spec.left.min,200);assert.equal(splitStore.spec.leftMore[0].min,200)
    assert.deepEqual(splitStore.spec.left.tabs,spec.left.tabs)
    assert.equal(spec.left.min,undefined,'legacy input is not mutated')
  }finally{if(root)await act(async()=>{splitStore.close();root.unmount()});dom.window.close();for(const n of names)old[n]?Object.defineProperty(globalThis,n,old[n]):delete globalThis[n]}
})
