import {test} from 'node:test'
import assert from 'node:assert/strict'
import {layoutSnapshot} from '../01_content/src/client/projectLayoutClient.mjs'
import {ProjectLayoutMutations} from '../01_content/src/client/projectLayoutMutations.mjs'

const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
const tick=()=>new Promise(r=>setImmediate(r))
const spec=id=>({id,title:id,top:null,main:[{id:'p1',title:'窗口1',min:100,tabs:[],active:0}],chatWidth:{default:360,min:240,max:600}})
function fixture(){
 const state={projects:{layouts:[spec('A'),spec('B')],folders:{A:'/old',B:'/B'},views:{},nameOverrides:{},iconOverrides:{}},width:400,active:'A',navigation:0,opened:[],closed:0,saved:[],dialog:true}
 const geometry=()=>({chatW:state.width,topH:200,leftW:260,paneWs:{p1:300},topWs:{},leftWs:{}})
 const workspace={projects:()=>state.projects,meta:()=>null,navigation:()=>state.navigation,
   capture:id=>{const s=state.projects.layouts.find(p=>p.id===id);return s?layoutSnapshot(s,geometry()):null},geometry,
   commit:fn=>{state.projects=fn(state.projects)},invalidate(){},
   replace(id,next,navigation){if(state.active!==id || state.navigation!==navigation)return null;state.closed++;state.opened.push(id);return layoutSnapshot(next,geometry())},
   reload(id,navigation){if(state.active===id && state.navigation===navigation){state.closed++;state.opened.push(id)}},
 }
 const store={flush:async()=>{},read:async()=>({status:'missing',folder:'/new'}),schedule:(folder,layout)=>state.saved.push({folder,layout}),state:()=>({status:'saved'})}
 const ui={error(){},choose(){},confirmLoad:()=>true,presetChanged(){},restore:async()=>{},created:layout=>state.opened.push(layout.id)}
 const dependencies={store,workspace,ui,createLayout:(_preset,name)=>({...spec('new'),title:name}),makeDirectory:async()=>true}
 const actions=new ProjectLayoutMutations(dependencies)
 return {state,store,workspace,ui,dependencies,actions}
}

test('directory assignment saves edits made while its target read is delayed',async()=>{
 const {state,store,actions}=fixture(),read=gate();store.read=()=>read.promise
 const operation=actions.assignDirectory('A','/new')
 await tick();state.width=580;state.projects.layouts[0].title='latest';read.resolve({status:'missing',folder:'/new'});await operation
 assert.equal(state.saved.at(-1).layout.geometry.chatW,580);assert.equal(state.saved.at(-1).layout.spec.title,'latest')
})

test('a delayed directory save never closes a different project opened meanwhile',async()=>{
 const {state,store,actions}=fixture(),saving=gate();store.flush=folder=>folder==='/new'?saving.promise:Promise.resolve()
 const operation=actions.assignDirectory('A','/new')
 await tick();state.active='B';state.navigation++;saving.resolve();await operation
 assert.equal(state.active,'B');assert.equal(state.closed,0);assert.deepEqual(state.opened,[])
})

test('a delayed preset operation does not replace the project opened after it began',async()=>{
 const {state,store,actions}=fixture(),reading=gate();store.state=()=>({status:'idle'});store.read=()=>reading.promise
 const operation=actions.changePreset('A','grid')
 await tick();state.active='B';state.navigation++;reading.resolve({status:'missing',folder:'/old'});await operation
 assert.equal(state.active,'B');assert.equal(state.closed,0);assert.deepEqual(state.opened,[])
})

test('closing a new-project dialog during mkdir prevents late registration and opening',async()=>{
 const f=fixture(),mkdir=gate();f.dependencies.makeDirectory=()=>mkdir.promise
 const actions=new ProjectLayoutMutations(f.dependencies),operation=actions.create('New','/new','grid',()=>f.state.dialog)
 f.state.dialog=false;mkdir.resolve(true);await operation
 assert.equal(f.state.projects.layouts.length,2);assert.deepEqual(f.state.opened,[])
})

test('directory assignment repeats the target save if an edit arrives while it is writing',async()=>{
 const {state,store,actions}=fixture(),first=gate();let targetSaves=0
 store.flush=folder=>folder==='/new' && ++targetSaves===1?first.promise:Promise.resolve()
 const operation=actions.assignDirectory('A','/new')
 await tick();state.width=640;first.resolve();await operation
 assert.equal(state.saved.length,2);assert.equal(state.saved[1].layout.geometry.chatW,640);assert.equal(state.projects.folders.A,'/new')
})

test('a removed project is not recreated by an in-flight directory assignment',async()=>{
 const {state,store,actions}=fixture(),reading=gate();store.read=()=>reading.promise
 const operation=actions.assignDirectory('A','/new')
 await tick();state.projects.layouts=state.projects.layouts.filter(p=>p.id!=='A');reading.resolve({status:'missing',folder:'/new'});await operation
 assert.equal(state.saved.length,0);assert.equal(state.projects.folders.A,'/old')
})

test('a failed old-directory save leaves the registration and new target untouched',async()=>{
 const {state,store,actions}=fixture();let reads=0
 store.state=folder=>folder==='/old'?{status:'error',pending:true}:{status:'saved'}
 store.read=async()=>{reads++;return {status:'missing',folder:'/new'}}
 await actions.assignDirectory('A','/new')
 assert.equal(state.projects.folders.A,'/old');assert.equal(reads,0);assert.equal(state.saved.length,0)
})
