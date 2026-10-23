import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),{transformSync,buildSync}=require('esbuild')
const source=process.argv[2]?readFileSync(process.argv[2],'utf8'):transformSync(readFileSync(new URL('../01_content/src/client/index.tsx',import.meta.url),'utf8'),{loader:'tsx',format:'esm'}).code
function between(start,end){const a=source.indexOf(start),b=source.indexOf(end,a+start.length);assert.ok(a>=0&&b>a,'actual source boundary exists');return source.slice(a,b)}
function actualFunction(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);let pos=source.indexOf('{',start),depth=0,quote=null;for(let i=pos;i<source.length;i++){const c=source[i],n=source[i+1];if(quote){if(c==='\\'){i++;continue}if(c===quote)quote=null;continue}if(c==='"'||c==="'"||c==='`'){quote=c;continue}if(c==='/'&&n==='/'){i=source.indexOf('\n',i);continue}if(c==='/'&&n==='*'){i=source.indexOf('*/',i+2)+1;continue}if(c==='{')depth++;if(c==='}'&&--depth===0)return source.slice(start,i+1)}assert.fail(name+' unclosed')}
const compatCode=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/sessionCompat.ts',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text
const compat={exports:{}};runInNewContext(compatCode,{module:compat,exports:compat.exports})
test('actual role navigation wiring preserves project layout and application identities without rebinding or disabling ordinary native switches',async()=>{
 const declaration=source.match(/(?:const|var) projectAttachRef =/)[0]
 const state=between(declaration,'function markPluginSessionOpen(')+actualFunction('markPluginSessionOpen')
 const wiring=source.match(/ctx\.effect\(\(\) => configureRoleNavigation\([\s\S]*?\), ["']worktable role native navigation["']\)/)?.[0]
 assert.ok(wiring,'actual apply() configures the role navigation callback')
 const page={kind:'application',appId:'reading-statistics',instanceId:'instance-C',viewId:'view-C-page'}
 const stats={kind:'application',appId:'reading-statistics',instanceId:'instance-C',viewId:'view-C-stats'}
 const spec={id:'project-one',main:[{tabs:[{id:'page-tab',content:page},{id:'stats-tab',content:stats}]}]}
 let closed=0,navigate;const splitStore={active:true,spec,close(){closed++;this.active=false;this.spec=null}}
 const snapshotOf=id=>({phase:'ready',items:[{id}],byId:{[id]:{id,retainedBy:{mainView:1}}}});let snapshot=snapshotOf('baseline')
 const list={getSnapshot:()=>snapshot},sessions={},opened=[]
 const ctx={sessions,effect:fn=>fn()}
 const module={exports:{}}
 runInNewContext(state+'\nlet lastSessionScopeId="";\n'+actualFunction('syncSessionScope')+'\nprojectAttachRef.sessionId="baseline";projectAttachRef.attached="baseline";projectBindingsRef.current={"project-one":"baseline"};\n'+wiring+';\nmodule.exports={syncSessionScope,projectAttachRef,projectBindingsRef};',{
 module,ctx,splitStore,configureRoleNavigation:fn=>{navigate=fn;return()=>{}},
 openHostSession:async(actualCtx,actualSessions,id)=>{assert.equal(actualCtx,ctx);assert.equal(actualSessions,sessions);opened.push(id);snapshot=snapshotOf(id);module.exports.syncSessionScope(list)},
 adaptSessionSnapshot:compat.exports.createSessionSnapshotAdapter(),currentSessionOf:compat.exports.currentSessionOf,sessionStatusSource:null,sessionScopeStore:{snapshot:null},sessionsSnapshotStore:{snapshot:null,listeners:new Set()}
 })
 module.exports.syncSessionScope(list)
 await navigate('role-C')
 assert.equal(closed,0,'plugin role navigation must not close the active Worktable')
 assert.equal(splitStore.active,true);assert.equal(splitStore.spec,spec)
 assert.equal(spec.main[0].tabs[0].content,page);assert.equal(spec.main[0].tabs[1].content,stats)
 assert.equal(module.exports.projectBindingsRef.current['project-one'],'baseline')
 assert.equal(module.exports.projectAttachRef.attached,'baseline')
 assert.deepEqual(opened,['role-C'])
 snapshot=snapshotOf('manual-other')
 module.exports.syncSessionScope(list);assert.equal(closed,1,'ordinary native navigation retains existing close behavior')
 splitStore.active=true;splitStore.spec=spec
 snapshot=snapshotOf('role-C')
 module.exports.syncSessionScope(list);assert.equal(closed,2,'plugin marker is consumed rather than becoming a permanent native-session whitelist')
})
