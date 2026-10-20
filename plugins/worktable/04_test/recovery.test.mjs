import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
const definition={id:'web',title:'Saved application',version:'1',protocolVersion:1,kind:'web',url:'https://example.com/'};
test('one canonical application file has one writer; clean close transfers ownership without deleting a new generation lock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-recovery-owner-'));let first,next;
 try{const file=join(dir,'apps.json');first=new ApplicationDirectory(file);await first.register(definition);const instance=await first.createInstance('web',null);const view=await first.createView(instance.id);
 const second=new ApplicationDirectory(join(dir,'.','apps.json'));await assert.rejects(second.snapshot(),{code:'owner-conflict'});await first.close();next=new ApplicationDirectory(file);assert.equal((await next.resolveView(view.id)).instance.id,instance.id);await first.close();await assert.rejects(new ApplicationDirectory(file).snapshot(),{code:'owner-conflict'});assert.equal((await next.snapshot()).instances.length,1);
 }finally{await first?.close();await next?.close();await rm(dir,{recursive:true,force:true})}
})

test('future, duplicate and dangling application state is blocked without rewriting the source',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-recovery-schema-'));try{
 const cases=[{schema:2,applications:[],instances:[],views:[]},{schema:1,applications:[],instances:[],views:[{id:'orphan',instanceId:'missing',type:'page'}]},{schema:1,applications:[definition,definition],instances:[],views:[]}];
 for(let index=0;index<cases.length;index++){const file=join(dir,'state-'+index+'.json'),bytes=JSON.stringify(cases[index]);await writeFile(file,bytes);const owner=new ApplicationDirectory(file);try{await assert.rejects(owner.snapshot(),error=>['schema-incompatible','storage-invalid'].includes(error.code));assert.equal(await readFile(file,'utf8'),bytes)}finally{await owner.close()}}
 }finally{await rm(dir,{recursive:true,force:true})}
})

import nativeFs from 'node:fs'
import {syncBuiltinESMExports} from 'node:module'
test('failed initialization-marker publication preserves good state and permits an ordinary reopen after storage recovers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-marker-failure-')),file=join(dir,'apps.json');const original=nativeFs.promises.open;let owner;
 const good=JSON.stringify({schema:1,applications:[definition],instances:[],views:[]});await writeFile(file,good);
 try{
 nativeFs.promises.open=async(path,...args)=>{const handle=await original(path,...args);if(String(path).includes('.initialized')){const write=handle.writeFile.bind(handle);handle.writeFile=async()=>{await write('{');throw new Error('simulated medium failure during marker write')}}return handle};syncBuiltinESMExports();
 owner=new ApplicationDirectory(file);await assert.rejects(owner.snapshot());assert.equal(await readFile(file,'utf8'),good);await owner.close();
 nativeFs.promises.open=original;syncBuiltinESMExports();owner=new ApplicationDirectory(file);assert.equal((await owner.catalog())[0].id,'web');assert.equal(await readFile(file,'utf8'),good);
 }finally{nativeFs.promises.open=original;syncBuiltinESMExports();await owner?.close();await rm(dir,{recursive:true,force:true})}
})

import {fork} from 'node:child_process'
import {once} from 'node:events'
import {fileURLToPath} from 'node:url'
import {rename} from 'node:fs/promises'
import {FileOwner} from '../01_content/src/framework/persistence.mjs'
test('two actual processes recovering a dead directory or legacy role lock never both become writers',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-owner-process-')),children=[];
 const claim=async file=>{const child=fork(fileURLToPath(new URL('./recovery-owner-worker.mjs',import.meta.url)),[file],{stdio:['ignore','ignore','ignore','ipc']});children.push(child);const [result]=await once(child,'message');return {child,...result}};
 try{for(const format of ['directory','legacy']){const file=join(dir,format+'.json'),original='{"schema":1,"preserve":"recent data"}';await writeFile(file,original);const old=await claim(file);assert.equal(old.status,'owned');old.child.kill('SIGKILL');await once(old.child,'exit');if(format==='legacy'){await rename(file+'.lock',file+'.lock.original');await writeFile(file+'.lock',JSON.stringify({pid:old.pid}))}
 const contenders=await Promise.all([claim(file),claim(file)]),winners=contenders.filter(row=>row.status==='owned');assert.equal(winners.length,1,'one recovery owner for '+format);await assert.rejects(FileOwner.acquire(file),{code:'owner-conflict'});assert.equal(await readFile(file,'utf8'),original);const winner=winners[0].child;const exited=once(winner,'exit');winner.send('close');await exited;
 const next=await FileOwner.acquire(file);await next.close();
 }}finally{for(const child of children)if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await rm(dir,{recursive:true,force:true})}
})
test('a removed initialized file is blocked, and an observed external edit conflicts rather than replacing newer state',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-state-conflict-'));let owner;
 try{const file=join(dir,'apps.json');owner=new ApplicationDirectory(file);await owner.register(definition);await owner.close();await rename(file,file+'.saved');owner=new ApplicationDirectory(file);await assert.rejects(owner.snapshot(),{code:'storage-missing'});await owner.close();await rename(file+'.saved',file);owner=new ApplicationDirectory(file);assert.equal((await owner.catalog())[0].id,'web');
 await owner.close();const store=new ProfileFileStore(file,()=>({schema:1,applications:[],instances:[],views:[]}),applicationState),data=await store.read();const newer={...data,externalVersion:2};await writeFile(file,JSON.stringify(newer));data.instances=[];await assert.rejects(store.write(data),{code:'storage-conflict'});assert.equal(JSON.parse(await readFile(file,'utf8')).externalVersion,2);await store.close();
 }finally{await owner?.close();await rm(dir,{recursive:true,force:true})}
})

import {ProfileFileStore} from '../01_content/src/framework/persistence.mjs'
import {applicationState} from '../01_content/src/framework/state-schema.mjs'

test('a directory-cleanup failure after owner release cannot leave an empty active lock that prevents a safe new generation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-lock-cleanup-')),file=join(dir,'state.json');const original=nativeFs.promises.rmdir;let owner,next,failed=false;
 try{owner=await FileOwner.acquire(file);nativeFs.promises.rmdir=async(path,...args)=>{if(!failed&&String(path).includes('.lock')){failed=true;throw new Error('simulated directory cleanup failure')}return original(path,...args)};syncBuiltinESMExports();await owner.close().catch(()=>{});nativeFs.promises.rmdir=original;syncBuiltinESMExports();next=await FileOwner.acquire(file);await owner.close().catch(()=>{});await assert.rejects(FileOwner.acquire(file),{code:'owner-conflict'});assert.equal(failed,true)}
 finally{nativeFs.promises.rmdir=original;syncBuiltinESMExports();await next?.close();await owner?.close().catch(()=>{});await rm(dir,{recursive:true,force:true})}
})
