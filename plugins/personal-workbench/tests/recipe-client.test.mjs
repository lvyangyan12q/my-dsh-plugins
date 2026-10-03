import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {createRequire} from 'node:module'
import {runInNewContext} from 'node:vm'
const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const recipe={schemaVersion:1,appId:'app.reading',version:1,name:'Reading',description:'',pages:[{id:'home',label:'Home',layout:'grid',modules:[{id:'summary',type:'stats',title:'Summary',config:{}}]}],connections:[],roles:[]}
test('built Client installs real recipe app registration and keyed runtime; draft/preview do not replace running app',async()=>{
 let api,service,records=[{appId:recipe.appId,revision:1,draft:recipe}],models=0
 const entries=[],cleanups=[]
 const window={localStorage:{getItem:()=>null,setItem:()=>{}},__ModuleLoader__:{load:({factory})=>{api=factory(require)}}}
 await runInNewContext(await readFile(new URL('../lib/client.js',import.meta.url),'utf8'),{window,console,AbortController,fetch:async(url)=>{if(url==='/api/personal-workbench/recipes')return {ok:true,json:async()=>({version:1,recipes:structuredClone(records)})};if(url==='/api/personal-workbench/apps')return {ok:true,json:async()=>({version:1,states:[]})};models++;throw new Error('No model or session requests permitted')}})
 const ctx={get:()=>undefined,inject:()=>{},effect:run=>{const remove=run();if(typeof remove==='function')cleanups.push(remove);return remove},reflect:{provide:(name,value)=>{if(name==='personalWorkbench')service=value;return()=>{}}},sessions:{retain:()=>{models++;throw new Error('No Sessions permitted')}},workspaces:{list:{getSnapshot:()=>({phase:'ready',state:'idle',archivedSessionIds:[]}),subscribe:()=>()=>{}}},locale:{register:()=>()=>{}},slots:{inject:(_slot,run)=>{const remove=run();if(remove)cleanups.push(remove)},register:(options,component)=>{const entry={options,component};entries.push(entry);return()=>{entries.splice(entries.indexOf(entry),1)}}}}
 api.apply(ctx)
 const workspace=entries.find(e=>e.options.id==='personal-workbench.workspace'),commands=workspace.options.inject()
 await service.loadLifecycle();await commands.refreshRecipes();assert.equal(service.getSnapshot().definitions.length,0)
 records=[{appId:recipe.appId,revision:2,draft:recipe,running:recipe}];await commands.refreshRecipes();assert.equal(service.getSnapshot().definitions[0].name,'Reading');service.openApp(recipe.appId)
 const runtime=entries.find(e=>e.options.name==='personal-workbench.app'&&e.options.key===recipe.appId);assert.ok(runtime)
 const html=renderToStaticMarkup(React.createElement(runtime.component,{appId:recipe.appId,instanceId:'default',pageId:'home',active:true,t:key=>key}));assert.match(html,/Summary/);assert.match(html,/data-recipe-version="1"/)
 records[0].draft={...recipe,version:2,name:'Unsaved running replacement'};records[0].revision=3;await commands.refreshRecipes();assert.equal(service.getSnapshot().definitions[0].name,'Reading')
 const preview=renderToStaticMarkup(React.createElement(api.RecipePage,{recipe:records[0].draft,appId:recipe.appId,instanceId:'preview.fixture',pageId:'home',preview:true,t:key=>key}));assert.match(preview,/data-preview="true"/);assert.equal(service.getSnapshot().definitions[0].version,'1')
 const release=api.registerRecipeModuleRenderer('stats',({preview,module})=>React.createElement('output',null,module.title+': '+(preview?'preview':'running')))
 const rendered=renderToStaticMarkup(React.createElement(runtime.component,{appId:recipe.appId,instanceId:'default',pageId:'home',active:true,t:key=>key}));assert.match(rendered,/Summary: running/);release();assert.equal(models,0)
 for(const cleanup of cleanups.reverse())cleanup()
})
