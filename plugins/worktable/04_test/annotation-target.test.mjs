import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {runInNewContext} from 'node:vm'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),{buildSync}=require('esbuild');const code=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/annotationTarget.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;const module={exports:{}};runInNewContext(code,{module,exports:module.exports});const{captureAnnotationTarget,resolveAnnotationTarget}=module.exports
const content={kind:'application',appId:'notes',instanceId:'private-instance',viewId:'existing-view',title:'Notes'}
const spec=()=>({id:'project-a',main:[{id:'pane-a',tabs:[{id:'tab-a',content}],active:0},{id:'pane-b',tabs:[],active:0}]})
test('annotation retains stable application identity when its tab moves to another pane',()=>{const s=spec(),t=captureAnnotationTarget(s,'main',0);const [tab]=s.main[0].tabs.splice(0);s.main[1].tabs.push(tab);const r=resolveAnnotationTarget(t,s);assert.equal(r.paneId,'pane-b');assert.equal(r.target.projectId,'project-a');assert.equal(r.target.content.instanceId,'private-instance');assert.equal(r.target.content.viewId,'existing-view');assert.equal(r.target.tabId,'tab-a')})
test('replacement content or another project cannot receive the annotation',()=>{const s=spec(),t=captureAnnotationTarget(s,'main',0);s.main[0].tabs[0].content={...content,viewId:'replacement'};assert.throws(()=>resolveAnnotationTarget(t,s),/替换/);assert.throws(()=>resolveAnnotationTarget(t,{...s,id:'project-b'}),/项目/);s.main[0].tabs=[];assert.throws(()=>resolveAnnotationTarget(t,s),/移除/)})

test('annotation from second left-stack pane resolves its own tab and follows a move',()=>{
  const s={id:'stack',left:{id:'left1',tabs:[{id:'tab1',content:{kind:'file',path:'first.md'}}]},leftMore:[{id:'left2',tabs:[{id:'tab2',content:{kind:'file',path:'second.md'}}]}],top:[],main:[{id:'main1',tabs:[]}]}
  const target=captureAnnotationTarget(s,'left',1)
  assert.equal(target.paneId,'left2');assert.equal(target.tabId,'tab2');assert.equal(target.content.path,'second.md')
  assert.equal(resolveAnnotationTarget(target,s).paneId,'left2')
  s.main[0].tabs=s.leftMore[0].tabs;s.leftMore[0].tabs=[]
  assert.equal(resolveAnnotationTarget(target,s).paneId,'main1')
})
