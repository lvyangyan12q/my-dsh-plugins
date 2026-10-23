import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),React=require('react'),{act,create}=require('react-test-renderer'),{buildSync}=require('esbuild');
const code=buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/migrationPanel.tsx',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']}).outputFiles[0].text,module={exports:{}};new Function('require','module','exports',code)(require,module,module.exports);const {MigrationPanel}=module.exports;
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('module migration UI opens read-only inspection then requires explicit baseline and impact acknowledgement',async()=>{
 const previous=globalThis.fetch,requests=[];let root,managed=false;
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);if(body.action==='adopt')managed=true;return {ok:true,json:async()=>({status:managed?'ready':'legacy-unverified',appId:'sample',instanceId:'A',viewId:'view-A',applicationVersion:'2',baseline:managed?{applicationVersion:'2',dataVersion:'1',dataRevision:'r1'}:null,inspection:{dataVersion:'1',revision:'r1'},plans:[]})}};
 try{
  await act(async()=>{root=create(React.createElement(MigrationPanel,{viewId:'view-A'}));await flush()});assert.equal(requests.length,0);
  await act(async()=>{root.root.findByType('details').props.onToggle({currentTarget:{open:true}});await flush()});assert.deepEqual(requests.map(row=>row.action),['get']);
  const button=label=>root.root.findAllByType('button').find(row=>row.children.join('')===label);assert.equal(button('确认当前基线（不迁移资料）').props.disabled,true);
  await act(async()=>{root.root.findByProps({'aria-label':'确认当前声明基线'}).props.onChange({target:{checked:true}});await flush()});await act(async()=>{button('确认当前基线（不迁移资料）').props.onClick();await flush()});const adopted=requests.find(row=>row.action==='adopt');assert.equal(adopted.confirmed,true);assert.equal(adopted.viewId,'view-A');assert.equal(adopted.dataRevision,'r1');assert.equal(requests.some(row=>row.action==='confirm'),false);
 }finally{if(root)await act(async()=>root.unmount());globalThis.fetch=previous}
})

test('prepared module plans disclose application-wide blocking and require separate irreversible confirmation',async()=>{
 const previous=globalThis.fetch,requests=[];let root;
 const plan={id:'plan-A',revision:2,status:'prepared',fromApplicationVersion:'1',toApplicationVersion:'2',fromDataVersion:'1',toDataVersion:'2',dataRevision:'r1',impact:'Synthetic conversion',irreversible:true,recovery:'Owner checkpoint recovery'};
 globalThis.fetch=async(_url,options)=>{const body=JSON.parse(options.body);requests.push(body);return {ok:true,json:async()=>({managed:true,status:'migration-required',applicationVersion:'2',inspection:{dataVersion:'1',revision:'r1'},plans:[plan]})}};
 try{await act(async()=>{root=create(React.createElement(MigrationPanel,{viewId:'view-A'}));await flush()});await act(async()=>{root.root.findByType('details').props.onToggle({currentTarget:{open:true}});await flush()});assert.match(JSON.stringify(root.toJSON()),/整个应用各项目/);const button=()=>root.root.findAllByType('button').find(row=>row.children.join('')==='确认执行迁移');assert.equal(button().props.disabled,true);await act(async()=>{root.root.findByProps({'aria-label':'确认迁移影响'}).props.onChange({target:{checked:true}})});assert.equal(button().props.disabled,true);assert.equal(requests.some(row=>row.action==='confirm'),false);await act(async()=>{root.root.findByProps({'aria-label':'确认不可逆影响'}).props.onChange({target:{checked:true}})});assert.equal(button().props.disabled,false);await act(async()=>{button().props.onClick();await flush()});const sent=requests.find(row=>row.action==='confirm');assert.deepEqual({id:sent.id,revision:sent.revision,confirmed:sent.confirmed,irreversibleConfirmed:sent.irreversibleConfirmed},{id:'plan-A',revision:2,confirmed:true,irreversibleConfirmed:true})}finally{if(root)await act(async()=>root.unmount());globalThis.fetch=previous}
})
