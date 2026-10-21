import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
const {createPresentation,describeProtocol,requireProtocol}=await import(process.env.WORKTABLE_SDK_ENTRY??new URL('../01_content/src/sdk.mjs',import.meta.url).href)
const require=createRequire(new URL('../01_content/package.json',import.meta.url))
const React=require('react'),{createRoot}=require('react-dom/client'),{flushSync}=require('react-dom'),{JSDOM}=require('jsdom'),h=React.createElement
function fixture(){const dom=new JSDOM('<div id="root"></div>'),previous={window:globalThis.window,document:globalThis.document};globalThis.window=dom.window;globalThis.document=dom.window.document;const container=document.getElementById('root'),root=createRoot(container);return {dom,container,render(element){flushSync(()=>root.render(element))},close(){flushSync(()=>root.unmount());dom.window.close();Object.assign(globalThis,previous)}}}
test('independent application maps real fields and selects through public controls without Host access',()=>{
 const {List,Stats,Detail}=createPresentation(React),ui=fixture()
 const rows=[{key:'one',name:'合同',duration:12},{key:'two',name:'资料',duration:8}];let selected
 try{ui.render(h(List,{records:rows,mapping:{id:'key',title:'name',description:'missing'},selectedId:'two',onSelect:id=>selected=id}))
 const buttons=ui.container.querySelectorAll('button');buttons[0].click()
 assert.equal(selected,'one');assert.equal(buttons[1].getAttribute('aria-pressed'),'true');assert.match(ui.container.textContent,/合同/);assert.doesNotMatch(ui.container.textContent,/undefined/)
 ui.render(h(Stats,{records:rows,metrics:[{id:'minutes',label:'分钟',field:'duration',aggregate:'sum'}]}));assert.equal(ui.container.querySelector('[data-stat="minutes"]').textContent,'20')
 ui.render(h(Detail,{record:rows[0],fields:[{label:'标题',field:'name'},{label:'作者',field:'author'}]}));assert.match(ui.container.textContent,/未提供/)
 requireProtocol(describeProtocol(),['presentation-components-v1'])
 }finally{ui.close()}
})

test('controlled filters keep caller values, render local theme and truthful loading/error/empty states',()=>{
 const {Surface,Filters,List,Stats}=createPresentation(React),ui=fixture();let changed
 try{
 ui.render(h(Surface,{theme:'dark',label:'应用展示'},h(Filters,{fields:[{id:'category',label:'分类',options:[{value:'',label:'全部'},{value:'work',label:'工作'}]}],values:{category:'',search:'保留'},onChange:value=>changed=value})))
 const select=ui.container.querySelector('select');select.value='work';select.dispatchEvent(new ui.dom.window.Event('change',{bubbles:true}));assert.deepEqual(changed,{category:'work',search:'保留'})
 assert.equal(ui.container.querySelector('section').getAttribute('data-worktable-presentation'),'dark');assert.equal(document.body.style.background,'')
 ui.render(h(List,{phase:'loading',records:[{id:'secret',title:'旧资料'}],mapping:{id:'id',title:'title'}}));assert.match(ui.container.textContent,/正在加载/);assert.doesNotMatch(ui.container.textContent,/旧资料/)
 let retries=0;ui.render(h(List,{phase:'error',error:'权限已撤销',onRetry:()=>retries++,mapping:{id:'id',title:'title'}}));assert.equal(ui.container.querySelector('[role="alert"]').textContent,'权限已撤销重试');ui.container.querySelector('button').click();assert.equal(retries,1)
 ui.render(h(List,{records:[],mapping:{id:'id',title:'title'},emptyText:'没有匹配资料'}));assert.equal(ui.container.textContent,'没有匹配资料')
 ui.render(h(List,{records:[{name:'无标识'}],mapping:{id:'id',title:'name'}}));assert.match(ui.container.querySelector('[role="alert"]').textContent,/标识字段缺失/)
 ui.render(h(Stats,{records:[{minutes:'12'},{minutes:Infinity}],metrics:[{id:'sum',label:'分钟',field:'minutes',aggregate:'sum'}]}));assert.equal(ui.container.querySelector('[data-stat="sum"]').textContent,'未提供')
 }finally{ui.close()}
})

test('invalid metric mapping is an explicit configuration error rather than a plausible total',()=>{
 const {Stats}=createPresentation(React),ui=fixture()
 try{ui.render(h(Stats,{records:[{minutes:12}],metrics:[{id:'value',label:'数值',field:'minutes',aggregate:'median'}]}));assert.match(ui.container.querySelector('[role="alert"]')?.textContent??'',/统计字段映射无效/)}finally{ui.close()}
})
