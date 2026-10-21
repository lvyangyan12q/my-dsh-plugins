import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),React=require('react'),{act,create}=require('react-test-renderer'),{buildSync}=require('esbuild');
const built=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/taskPanel.tsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime'],write:false});const module={exports:{}};new Function('require','module','exports',built.outputFiles[0].text)(require,module,module.exports);const {TaskPanel,createTaskFacade}=module.exports;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('module prepares with fixed view and context, passive display has no composer or automatic submit, unmount has no Stop',async()=>{
 const saved=globalThis.fetch,actions=[];let root;const row={id:'task',revision:1,status:'prepared',instanceId:'A',roleId:'assistant',sessionId:'native-A',source:{viewId:'view-A',viewType:'page'},text:'Review selection',contexts:[{id:'records:0',title:'Books',text:'Original evidence',metadata:{ownerInstanceId:'owner-A'},reference:{resourceId:'records',selection:{ids:['one']}}}]};let tasks=[];
 globalThis.fetch=async(url,options)=>{const body=JSON.parse(options.body);actions.push(body);return {ok:true,json:async()=>url.endsWith('/roles')?{roles:[{id:'assistant',title:'Reader'}]}:body.action==='list'?tasks:body.action==='prepare'?(tasks=[row],row):body.action==='edit'?(tasks=[{...row,text:body.text,contexts:body.contexts,revision:2}],tasks[0]):{...row,status:'accepted'}}};
 try{
 await act(async()=>{root=create(React.createElement(TaskPanel,{viewId:'view-A',instanceId:'A'}));await flush()});assert.equal(actions.length,0);
 await act(async()=>{await createTaskFacade('view-A').prepare({roleId:'assistant',text:'Review selection',contexts:[{resourceId:'records',selection:{ids:['one']}}]});await flush()});
 const prepare=actions.find(a=>a.action==='prepare');assert.equal(prepare.viewId,'view-A');assert.equal(prepare.instanceId,undefined);assert.equal(prepare.sessionId,undefined);assert.deepEqual(prepare.contexts[0].selection.ids,['one']);assert.equal(actions.some(a=>a.action==='submit'),false);
 const button=name=>root.root.findAllByType('button').find(b=>b.children.join('')===name);
 await act(async()=>{button('编辑准备任务').props.onClick();await flush()});assert.equal(button('确认发送到原生会话').props.disabled,true,'unsaved edits cannot send the old task');
 await act(async()=>{button('移除此上下文').props.onClick();await flush()});assert.equal(root.root.findAllByType('textarea').some(t=>t.props['aria-label']==='编辑上下文 Books'),false);
 await act(async()=>{await root.root.findAllByType('form')[1].props.onSubmit({preventDefault(){}});await flush()});const edited=actions.find(a=>a.action==='edit');assert.deepEqual(edited.contexts,[]);assert.equal(actions.some(a=>a.action==='submit'),false);
 await act(async()=>root.unmount());assert.equal(actions.some(a=>a.action==='stop'),false);
 }finally{if(root)await act(async()=>root.unmount());globalThis.fetch=saved}
})

test('native status shown to the user remains session-scoped and idle or Stop never claims success',async()=>{
 const saved=globalThis.fetch;let root,current={running:true};
 const dispose=module.exports.configureTaskFacts(()=>current);
 const row={id:'task',revision:1,status:'accepted',requestId:'request',roleId:'assistant',sessionId:'native-A',source:{viewId:'view-A',viewType:'page'},text:'Observe task',contexts:[]};
 globalThis.fetch=async(url)=>({ok:true,json:async()=>url.endsWith('/roles')?{roles:[{id:'assistant',title:'Reader'}]}:[row]});
 try{
 await act(async()=>{root=create(React.createElement(TaskPanel,{viewId:'view-A',instanceId:'A'}));await flush()});await act(async()=>{root.root.findByType('details').props.onToggle({currentTarget:{open:true}});await flush()});
 const status=()=>root.root.findAllByProps({role:'status'}).map(p=>p.children.join('')).join(' ');
 assert.match(status(),/正在运行/);
 for(const [facts,expected] of [[{running:true,pendingInteraction:{kind:'approval'}},/等待问题或审批/],[{running:false,lastAgentError:'model unavailable'},/model unavailable/],[{running:false,completionUnread:true},/未读结束提示/],[{running:false},/执行结果未知/]]){
  current=facts;await act(async()=>{root.update(React.createElement(TaskPanel,{viewId:'view-A',instanceId:'A'}));await flush()});assert.match(status(),expected);
 }
 row.stopRequestedAt=123;await act(async()=>{root.root.findAllByType('button').find(b=>b.children.join('')==='刷新任务状态').props.onClick();await flush()});assert.match(status(),/停止请求/);assert.doesNotMatch(status(),/已取消|任务成功/);
 }finally{if(root)await act(async()=>root.unmount());dispose();globalThis.fetch=saved}
})
