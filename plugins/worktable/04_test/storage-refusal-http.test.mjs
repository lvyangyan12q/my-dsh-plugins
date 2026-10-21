import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,readFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'node:http'
import {spawn} from 'node:child_process'
import {once} from 'node:events'
import {mountApplications} from '../01_content/src/framework/host.mjs'

// Windows ShareDelete is withheld only on this test's synthetic file. No ACL changes,
// fs mocks, real DSH profiles, native models, or production listeners are involved.
test('real filesystem write refusal through HTTP preserves old instances and identical retry succeeds after recovery',{skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'wt-storage-http-')),effects=[],routes=[];let activate,locker,server;
 const ctx={connection:{admit:()=>({peer:{}})},profileContext:{dir},inject:(keys,callback)=>{if(keys.length===2)activate=callback},provide(){},effect:(factory,label)=>effects.push({factory,label}),webServer:{register:route=>{routes.push(route);return()=>{}}}};
 const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
 try{
  mountApplications(ctx);activate(ctx);const route=routes.find(row=>row.path==='/api/worktable/applications');
  server=createServer((req,res)=>route.handler(req,res));server.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
  const call=async body=>{const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:response.status,body:await response.json()}};
  const application={id:'synthetic',title:'Synthetic storage check',version:'1',protocolVersion:1,kind:'web',url:'https://example.com/'};
  assert.equal((await call({action:'register',application})).status,200);
  const old=await call({action:'create',appId:'synthetic',projectId:'synthetic-project'});assert.equal(old.status,200);
  const file=join(dir,'worktable-platform','applications.v1.json'),before=digest(await readFile(file));
  const command="$f=[System.IO.File]::Open($env:WT_REFUSAL_FILE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::ReadWrite); try { [Console]::WriteLine('LOCKED'); [Console]::ReadLine() | Out-Null } finally { $f.Dispose() }";
  locker=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,env:{...process.env,WT_REFUSAL_FILE:file},stdio:['pipe','pipe','pipe']});
  await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('file lock did not become ready')),10000);locker.stdout.on('data',bytes=>{output+=bytes;if(output.includes('LOCKED')){clearTimeout(timer);resolve()}});locker.once('error',error=>{clearTimeout(timer);reject(error)});locker.once('exit',code=>{if(!output.includes('LOCKED')){clearTimeout(timer);reject(Error('file lock process exited '+code))}})});
  const payload={action:'create',appId:'synthetic',projectId:'recovery-project'};
  const refused=await call(payload);assert.equal(refused.status,503);assert.equal(refused.body.code,'storage-unavailable');assert.match(refused.body.error,/状态未保存.*原记录保留/);assert.equal(digest(await readFile(file)),before);
  const snapshot=await (await fetch(url)).json();assert.equal(snapshot.instances.length,1);assert.equal(snapshot.instances[0].id,old.body.id);
  const exited=once(locker,'exit');locker.stdin.end('release\n');await exited;locker=null;
  const retried=await call(payload);assert.equal(retried.status,200);const after=await (await fetch(url)).json();assert.equal(after.instances.length,2);assert.equal(after.instances[0].id,old.body.id);assert.equal(after.instances[1].id,retried.body.id);
  console.log(JSON.stringify({kind:'actual-filesystem-refusal-http',refusedStatus:refused.status,refusedCode:refused.body.code,oldFileHash:before,oldRecordPreserved:true,retryStatus:retried.status,recordsAfterRetry:after.instances.length,aclChanges:false,realProfileTouched:false}));
 }finally{
  if(locker){const exited=once(locker,'exit');locker.stdin.end('release\n');await exited}
  if(server)await new Promise(resolve=>server.close(resolve));
  for(const effect of effects.filter(row=>row.label==='worktable: release application service'))await effect.factory()();
  await rm(dir,{recursive:true,force:true});
 }
})
