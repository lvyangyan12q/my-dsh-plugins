import assert from 'node:assert/strict'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {build} from 'esbuild'

// Run explicitly: node plugins/personal-workbench/tests/native-panel-layout.browser.mjs
// Uses a fresh headless Chrome profile, file-only content, actual component/CSS, no DSH Host.
const project=fileURLToPath(new URL('../../../',import.meta.url))
const chrome=process.env.CHROME_EXECUTABLE??'C:/Program Files/Google/Chrome/Application/chrome.exe'
const temporary=await mkdtemp(join(tmpdir(),'pwb-native-panel-layout-'))
try{
 const entry=`
 import React,{useSyncExternalStore} from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';
 import {Workspace,ManagementPanel} from './plugins/personal-workbench/src/workbench-view.tsx';
 import {Workbench} from './plugins/personal-workbench/src/workbench.ts';
 import {RecipePage} from './plugins/personal-workbench/src/recipe-view.tsx';
 import nativeLayout from './node_modules/@deepseek-ai/dsh-client-ui-layout/src/client/AppFrame.module.css';
 const wb=new Workbench();wb.registerApp({id:'layout-proof',name:'Layout proof',version:'1',source:'layout-proof',icon:'layout-grid',pages:[{id:'home',label:'Home'}],defaultLayout:{pageId:'home',width:800,height:600}});wb.openApp('layout-proof');
 const recipe={schemaVersion:1,appId:'layout-proof',name:'Layout proof',version:1,description:'',roles:[],connections:[],pages:[{id:'home',label:'Home',layout:'split',modules:[{id:'left',title:'Left',type:'empty',config:{}},{id:'right',title:'Right',type:'empty',config:{}}]}]};
 const state=selector=>selector(useSyncExternalStore(wb.subscribe,wb.getSnapshot));
 function App(){return <div id="native-frame" className={nativeLayout.frame} style={{gridTemplateColumns:'280px minmax(0,1fr) 0px',height:900}}><aside id="native-sidebar"><button>Native menu</button></aside><main id="native-center" className={nativeLayout.centerCol}><div style={{display:'contents'}}><Workspace useWorkbench={state} openApp={wb.openApp} closeWorkspace={wb.closeWorkspace} focusWindow={wb.focus} setMode={wb.setMode} selectPage={wb.selectPage} setPreference={wb.setPreference} t={k=>k} renderSlot={(_,p)=><RecipePage recipe={recipe} pageId={p.pageId} appId={p.appId} instanceId={p.instanceId} t={k=>k}/>}/></div></main><aside id="native-rightbar"/><div data-shell-overlay style={{position:'absolute',inset:0,pointerEvents:'none',display:'contents'}}><ManagementPanel useNavigation={selector=>selector({panel:'agents'})} useWorkbench={state} close={()=>{}} t={k=>k}/></div></div>}
 flushSync(()=>createRoot(document.getElementById('root')).render(<App/>));
 const rect=node=>{const b=node.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height}};
 const sample=()=>{const center=document.getElementById('native-center'),panel=document.querySelector('.pwb-project-shell:not(.pwb-independent-management)'),canvas=panel.querySelector('.pwb-recipe-page');return {center:rect(center),panel:rect(panel),sidebar:rect(document.getElementById('native-sidebar')),dividerVisible:[...panel.querySelectorAll('[role="separator"]')].some(node=>node.getBoundingClientRect().width>0),canvas:canvas?rect(canvas):null}};
 const frame=()=>new Promise(resolve=>setTimeout(resolve,80));
 async function run(){await frame();const normal=sample(),initialManagement=rect(document.querySelector(".pwb-independent-management"));document.querySelector('button[aria-label="maximize: Layout proof"]').click();await frame();const maximized=sample();document.getElementById('native-frame').style.gridTemplateColumns='280px minmax(0,1fr) 200px';await frame();const rightbar=sample();document.getElementById('native-frame').style.width='960px';await frame();const narrow=sample();document.getElementById('result').textContent=JSON.stringify({normal,maximized,rightbar,narrow,initialManagement})}run().catch(e=>document.getElementById('result').textContent=JSON.stringify({error:String(e)}));
 `
 await build({stdin:{contents:entry,loader:'tsx',resolveDir:project},bundle:true,platform:'browser',format:'iife',outfile:join(temporary,'app.js'),jsx:'automatic',logLevel:'silent'})
 await writeFile(join(temporary,'index.html'),'<!doctype html><html><head><link rel="stylesheet" href="app.css"><style>html,body{margin:0;width:1920px;height:900px}#root{height:100%}#result{display:none}</style></head><body><div id="root"></div><pre id="result"></pre><script>window.addEventListener("error",e=>document.getElementById("result").textContent=JSON.stringify({error:e.message}));window.addEventListener("unhandledrejection",e=>document.getElementById("result").textContent=JSON.stringify({error:String(e.reason)}));</script><script src="app.js"></script></body></html>')
 const browser=spawnSync(chrome,['--headless=new','--window-size=1920,1080','--no-first-run','--disable-background-networking','--disable-extensions','--no-default-browser-check','--user-data-dir='+join(temporary,'chrome-profile'),'--virtual-time-budget=2500','--dump-dom','file:///'+join(temporary,'index.html').replaceAll('\\','/')],{encoding:'utf8',timeout:30000,maxBuffer:10*1024*1024})
 assert.equal(browser.status,0,browser.stderr)
 const match=browser.stdout.match(/<pre id="result">([^<]+)<\/pre>/);assert.ok(match,'headless renderer must produce dimensions: '+browser.stdout.slice(-1400)+' STDERR '+browser.stderr.slice(-1000))
 const evidence=JSON.parse(match[1].replaceAll('&quot;','"').replaceAll('&amp;','&'));assert.equal(evidence.error,undefined)
 console.log(JSON.stringify(evidence))
 for(const key of ['normal','maximized','rightbar','narrow']){
  const sample=evidence[key];assert.equal(sample.panel.x,sample.center.x,key+' panel starts at assigned center, not over native sidebar');assert.equal(sample.panel.width,sample.center.width,key+' panel fills native center width');assert.equal(sample.panel.height,sample.center.height,key+' panel fills native center height');assert.equal(sample.sidebar.width,280,key+' native sidebar remains unchanged')
 }
 assert.deepEqual(evidence.initialManagement,evidence.normal.center,'independent management overlay keeps its center-bound geometry');assert.equal(evidence.normal.center.y,0,'main content remains in the native assigned row');assert.equal(evidence.normal.center.width,1640);assert.equal(evidence.normal.dividerVisible,true,'wide split canvas exposes divider');assert.equal(evidence.maximized.dividerVisible,true,'maximize does not shrink split canvas');assert.equal(evidence.narrow.dividerVisible,false,'genuinely narrow assigned center hides split divider')
 console.log('native main-panel geometry GREEN')
}finally{await rm(temporary,{recursive:true,force:true})}
