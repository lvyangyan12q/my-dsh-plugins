import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {JSDOM} from 'jsdom'
import {installReading} from '../src/reading-host.ts'
import {ApplicationDirectory} from '../../worktable/01_content/src/framework/applications.mjs'
import {ResourceDirectory} from '../../worktable/01_content/src/framework/resources.mjs'
const source=process.env.DSH_SOURCE;assert.ok(source)
const require=createRequire(import.meta.url),official=createRequire(resolve(source,'packages/client/ui-renderer/package.json'))
const {Context}=official('@deepseek-ai/cordis'),React=require('react'),{act}=React,h=React.createElement
const built=p=>import(pathToFileURL(resolve(source,p,'lib/index.js')).href)
const {default:Storage}=await built('packages/storage/storage'),{JsonStorageBackend}=await built('packages/storage/storage-json'),{DomainFacility}=await built('packages/storage/storage-domain')
test('real reading page controls share only A to B, permit owner writes, isolate filters and visibly revoke',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'reading-grant-ui-')),ctx=new Context(),dom=new JSDOM('<div id="mount"></div>',{url:'http://localhost'}),originals=new Map();let owner,root,views
  try{
    await ctx.plugin(Storage);ctx.storage.backend.register('json',new JsonStorageBackend(folder));const facility=new DomainFacility(ctx,{backend:'json',routes:{}});ctx.storage.mount('domain',facility);owner=await installReading({storageDomain:facility,connection:{requestRejection:()=>undefined}})
    const apps=new ApplicationDirectory(join(folder,'apps.json'));await apps.contribute({id:'reading-statistics',title:'Reading',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
    const instances=await Promise.all(['A','B','C'].map(project=>apps.createInstance('reading-statistics',project))),viewRows=await Promise.all(instances.map(row=>apps.createView(row.id))),grants=new ResourceDirectory(join(folder,'grants.json'),apps);grants.register(owner.resource)
    const fetch=async(url,options={})=>{try{if(url==='/api/worktable/applications')return {ok:true,json:async()=>apps.snapshot()};assert.equal(url,'/api/worktable/resources');const body=JSON.parse(options.body);let data;switch(body.operation){case 'snapshot':data=await grants.snapshot();break;case 'share':data=await grants.share(body);break;case 'permissions':data=await grants.permissions(body.id,body.revision,body.allowedActions);break;case 'revoke':data=await grants.revoke(body.id,body.revision);break;case 'call':data=await grants.call(body);break;default:throw Error('Unknown operation')};return {ok:true,json:async()=>data}}catch(error){return {ok:false,json:async()=>({error:error.message})}}}
    for(const [key,value] of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
    const {build}=require('esbuild'),{runInNewContext}=await import('node:vm'),bundle=await build({entryPoints:[new URL('../src/reading-views.tsx',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],bundle:true,write:false,format:'cjs',platform:'browser',external:['react','react/jsx-runtime']})
    const module={exports:{}};runInNewContext(bundle.outputFiles[0].text,{module,exports:module.exports,require,fetch,window:dom.window,document:dom.window.document,console,AbortController,structuredClone});views=module.exports.createReadingViews();root=require('react-dom/client').createRoot(dom.window.document.getElementById('mount'))
    const flush=async()=>{await act(async()=>{await new Promise(resolve=>setTimeout(resolve,60))})},section=i=>dom.window.document.querySelector('#view'+i),button=(i,text)=>[...section(i).querySelectorAll('button')].find(row=>row.textContent===text),click=async(i,text)=>{assert.ok(button(i,text),text);assert.equal(button(i,text).disabled,false,text);await act(async()=>button(i,text).click());await flush()}
    await act(async()=>root.render(h(React.Fragment,null,...instances.map((instance,i)=>h('div',{id:'view'+i,key:i},h(views.views.page,{application:{id:'reading-statistics'},instance,view:viewRows[i]}))))));await flush();await click(0,'初始化示例记录');assert.equal(section(0).querySelector('[data-stat="books"]').textContent,'3');assert.equal(section(1).querySelector('[data-stat="books"]').textContent,'0')
    const target=section(0).querySelector('[aria-label="共享给阅读实例"]');await act(async()=>{target.value=instances[1].id;target.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});await click(0,'确认只读共享');assert.match(section(1).textContent,/只读共享/);assert.equal(button(1,'新增阅读记录'),undefined);assert.equal(section(2).querySelector('[data-stat="books"]').textContent,'0');assert.equal(owner.read(instances[1].id).records.length,0)
    const category=section(1).querySelector('[aria-label="分类筛选"]');await act(async()=>{category.value='科学 Science';category.dispatchEvent(new dom.window.Event('change',{bubbles:true}))});assert.equal(section(1).querySelector('[data-stat="books"]').textContent,'1');assert.equal(section(0).querySelector('[data-stat="books"]').textContent,'3')
    await click(0,'允许新增、编辑、删除');assert.ok(button(1,'新增阅读记录'));await click(1,'新增阅读记录');const title=section(1).querySelector('[aria-label="书名"]');await act(async()=>{Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(title,'B writes into A');title.dispatchEvent(new dom.window.Event('input',{bubbles:true}))});await act(async()=>section(1).querySelector('[data-reading-editor] form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));await flush();assert.ok(owner.read(instances[0].id).records.some(row=>row.title==='B writes into A'));assert.equal(owner.read(instances[1].id).records.length,0);assert.equal(section(0).querySelector('[data-stat="books"]').textContent,'4')
    await click(0,'撤销共享');assert.match(section(1).textContent,/共享已撤销/);assert.equal(button(1,'新增阅读记录'),undefined);assert.equal(section(1).querySelector('[data-stat="books"]').textContent,'0');assert.equal(owner.read(instances[0].id).records.length,4)
  }finally{if(root)await act(async()=>root.unmount());views?.dispose();dom.window.close();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key]}await owner?.dispose();await ctx.fiber.dispose();await rm(folder,{recursive:true,force:true})}
})
