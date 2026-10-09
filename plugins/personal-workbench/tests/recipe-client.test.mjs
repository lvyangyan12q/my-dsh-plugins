import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const recipe={schemaVersion:1,appId:'app.reading',version:1,name:'Reading',description:'',pages:[{id:'home',label:'Home',layout:'grid',modules:[{id:'summary',type:'stats',title:'Summary',config:{}}]}],connections:[],roles:[]}
test('built Client installs real recipe app registration and keyed runtime; draft/preview do not replace running app',async()=>{
 let api,service,records=[{appId:recipe.appId,revision:1,draft:recipe}],models=0,dependencies={}
 const entries=[],cleanups=[]
 const window={localStorage:{getItem:()=>null,setItem:()=>{}},__ModuleLoader__:{load:({factory})=>{api=factory(require)}}}
 await runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window,console,AbortController,fetch:async(url)=>{if(url==='/api/personal-workbench/recipes')return {ok:true,json:async()=>({version:1,recipes:structuredClone(records),dependencies})};if(url==='/api/personal-workbench/apps')return {ok:true,json:async()=>({version:1,states:[]})};models++;throw new Error('No model or session requests permitted')}})
 const ctx={get:()=>undefined,inject:()=>{},effect:run=>{const remove=run();if(typeof remove==='function')cleanups.push(remove);return remove},reflect:{provide:(name,value)=>{if(name==='personalWorkbench')service=value;return()=>{}}},sessions:{retain:()=>{models++;throw new Error('No Sessions permitted')}},workspaces:{list:{getSnapshot:()=>({phase:'ready',state:'idle',archivedSessionIds:[]}),subscribe:()=>()=>{}}},locale:{register:()=>()=>{}},slots:{inject:(_slot,run)=>{const remove=run();if(remove)cleanups.push(remove)},register:(options,component)=>{const entry={options,component};entries.push(entry);return()=>{entries.splice(entries.indexOf(entry),1)}}}}
 api.apply(ctx)
 const workspace=entries.find(e=>e.options.id==='personal-workbench.workspace'),commands=workspace.options.inject()
 await service.loadLifecycle();await commands.refreshRecipes();assert.equal(service.getSnapshot().definitions.length,0)
 const removeRuntime=api.registerRecipeModuleRenderer('example.dependency',()=>React.createElement('output',null,'Dependency runtime'));
 const running={...recipe,roles:[{id:'analyst',name:'Analyst',presetId:'my-dsh.analyst',skillNames:[]}],pages:[{...recipe.pages[0],modules:[{...recipe.pages[0].modules[0],type:'example.dependency'}]}],connections:[{id:'owned',sourceAppId:recipe.appId,resource:'books'}]};
 const removeSource=api.registerDisplaySource({appId:recipe.appId,resource:'books',label:'Books',load:async()=>({records:[],filters:[],stats:[]})});
 dependencies={[recipe.appId]:[{id:'agent:analyst',available:true}]};records=[{appId:recipe.appId,revision:2,draft:recipe,running}];await commands.refreshRecipes();assert.equal(service.getSnapshot().definitions[0].name,'Reading');service.openApp(recipe.appId)
 const runtime=entries.find(e=>e.options.name==='personal-workbench.app'&&e.options.key===recipe.appId);assert.ok(runtime)
 const html=renderToStaticMarkup(React.createElement(runtime.component,{appId:recipe.appId,instanceId:'default',pageId:'home',active:true,t:key=>key}));assert.match(html,/Dependency runtime/);assert.match(html,/data-recipe-version="1"/)
 records[0].draft={...recipe,version:2,name:'Unsaved running replacement'};records[0].revision=3;await commands.refreshRecipes();assert.equal(service.getSnapshot().definitions[0].name,'Reading')
 const preview=renderToStaticMarkup(React.createElement(api.RecipePage,{recipe:records[0].draft,appId:recipe.appId,instanceId:'preview.fixture',pageId:'home',preview:true,t:key=>key}));assert.match(preview,/data-preview="true"/);assert.equal(service.getSnapshot().definitions[0].version,'1')
 const release=api.registerRecipeModuleRenderer('example.special',({preview,module})=>React.createElement('output',null,module.title+': '+(preview?'preview':'running')))
 const specialized={...recipe,pages:[{...recipe.pages[0],modules:[{...recipe.pages[0].modules[0],type:'example.special'}]}]};const rendered=renderToStaticMarkup(React.createElement(api.RecipePage,{recipe:specialized,appId:recipe.appId,instanceId:'default',pageId:'home',t:key=>key}));assert.match(rendered,/Summary: running/);release();assert.equal(models,0)
 assert.ok(service.getSnapshot().definitions[0].dependencies.every(row=>row.available));
 removeRuntime();removeSource();
 const unavailable=service.getSnapshot().definitions[0].dependencies;
 assert.equal(unavailable.find(row=>row.id==='example.dependency')?.available,false,'withdrawing the actual renderer must update catalog availability');
 assert.equal(unavailable.find(row=>row.id==='connection:owned')?.available,false,'withdrawing the actual data adapter must update catalog availability');
 assert.match(unavailable.find(row=>row.id==='example.dependency')?.reason??'',/renderer/i);
 assert.equal(entries.find(e=>e.options.key===recipe.appId).component,runtime.component);
 const missingMarkup=renderToStaticMarkup(React.createElement(runtime.component,{appId:recipe.appId,instanceId:'default',pageId:'home',active:true,t:key=>key}));assert.match(missingMarkup,/recipeMissingModule.*example.dependency/,'the retained runtime must explain the withdrawn renderer');
 dependencies={[recipe.appId]:[{id:'agent:analyst',available:false,reason:'Unavailable Agent: my-dsh.analyst'}]};await commands.refreshRecipes();assert.equal(service.getSnapshot().definitions[0].dependencies.find(dep=>dep.id==='agent:analyst')?.available,false,'unchanged recipe version must still refresh Host dependency status');
 dependencies={[recipe.appId]:[{id:'agent:analyst',available:true}]};
 const restoreRuntime=api.registerRecipeModuleRenderer('example.dependency',()=>React.createElement('output',null,'Restored'));
 const restoreSource=api.registerDisplaySource({appId:recipe.appId,resource:'books',label:'Books',load:async()=>({records:[],filters:[],stats:[]})});await commands.refreshRecipes();assert.ok(service.getSnapshot().definitions[0].dependencies.every(dep=>dep.available));
 const focused=service.getSnapshot().focused
 records[0].running={...recipe,version:2,name:'Reading updated',pages:[{...recipe.pages[0],label:'Updated home',modules:[{...recipe.pages[0].modules[0],title:'Updated summary'}]}]}
 await commands.refreshRecipes()
 const updatedRuntime=entries.find(e=>e.options.name==='personal-workbench.app'&&e.options.key===recipe.appId)
 assert.equal(updatedRuntime.component,runtime.component,'activating a version preserves the registered component identity')
 assert.equal(service.getSnapshot().focused,focused,'metadata updates do not retire the open instance')
 assert.equal(service.getSnapshot().definitions[0].version,'2')
 assert.equal(service.getSnapshot().definitions[0].name,'Reading updated')
 const updatedHtml=renderToStaticMarkup(React.createElement(updatedRuntime.component,{appId:recipe.appId,instanceId:'default',pageId:'home',active:true,t:key=>key}))
 assert.match(updatedHtml,/Updated summary/)
 assert.match(updatedHtml,/data-recipe-version="2"/)
 restoreRuntime();restoreSource();for(const cleanup of cleanups.reverse())cleanup()
})
