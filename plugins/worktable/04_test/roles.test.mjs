import assert from 'node:assert/strict'
import {test} from 'node:test'
import {mkdtemp,rm,rename,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {ApplicationDirectory} from '../01_content/src/framework/applications.mjs'
import {RoleDirectory,RoleStore} from '../01_content/src/framework/roles.mjs'

test('read creates nothing; concurrent explicit ensure converges and a separate instance stays isolated',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'worktable-roles-'))
 let roles
 try{
 const apps=new ApplicationDirectory(join(dir,'apps.json'))
 await apps.contribute({id:'reader',title:'Reader',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
 const a=await apps.createInstance('reader',null),b=await apps.createInstance('reader',null)
 const created=[]
 roles=new RoleDirectory(await RoleStore.open(join(dir,'roles.json')),apps,{validate:async()=>({presetId:'managed.reader'}),create:async row=>{created.push(row.sessionId);await new Promise(r=>setTimeout(r,10));return row.sessionId},validateExisting:async()=>{}})
 roles.contribute('reader',[{id:'assistant',title:'Assistant',agent:{kind:'agent',source:'managed',id:'reader'},creation:{cwd:dir}}])
 assert.equal((await roles.read(a.id,'assistant')).binding,null)
 assert.equal(created.length,0)
 const [one,two]=await Promise.all([roles.ensure(a.id,'assistant'),roles.ensure(a.id,'assistant')])
 assert.equal(one.sessionId,two.sessionId);assert.equal(created.length,1)
 const separate=await roles.ensure(b.id,'assistant');assert.notEqual(separate.sessionId,one.sessionId)
 await apps.attach(a.id,'project',1)
 assert.equal((await roles.read(a.id,'assistant')).binding.sessionId,one.sessionId)
 }finally{await roles?.dispose();await rm(dir,{recursive:true,force:true})}
})

async function setup(visit,overrides={}){
 const dir=await mkdtemp(join(tmpdir(),'worktable-role-recovery-'));let roles
 const apps=new ApplicationDirectory(join(dir,'apps.json'))
 await apps.contribute({id:'reader',title:'Reader',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]})
 const instance=await apps.createInstance('reader',null),other=await apps.createInstance('reader',null)
 const authority={validate:async d=>({presetId:d.agent.id}),create:async r=>r.sessionId,validateExisting:async()=>{},validateAttachment:async()=>{},...overrides}
 const reopen=async()=>{await roles?.dispose();roles=new RoleDirectory(await RoleStore.open(join(dir,'roles.json')),apps,authority);roles.contribute('reader',[{id:'assistant',title:'Assistant',agent:{kind:'agent',source:'managed',id:'reader'},creation:{cwd:dir}}]);return roles}
 try{await reopen();await visit({get roles(){return roles},instance,other,authority,reopen,dir})}finally{await roles?.dispose();await rm(dir,{recursive:true,force:true})}
}
test('failed creation preserves durable intent; restart read is passive and explicit retry preserves the ID',async()=>setup(async state=>{
 let first
 state.authority.create=async row=>{first=row.sessionId;throw new Error('native temporarily unavailable')}
 await assert.rejects(()=>state.roles.ensure(state.instance.id,'assistant'),/temporarily/)
 const intent=(await state.roles.read(state.instance.id,'assistant')).binding
 assert.equal(intent.phase,'intent');assert.equal(intent.sessionId,first)
 await state.reopen();assert.equal((await state.roles.read(state.instance.id,'assistant')).binding.sessionId,first)
 state.authority.create=async row=>row.sessionId
 const ready=await state.roles.retry(state.instance.id,'assistant',first,intent.revision)
 assert.equal(ready.sessionId,first);assert.equal(ready.phase,'ready')
 await assert.rejects(()=>state.roles.replace(state.instance.id,'assistant',first,intent.revision),/已更新/)
 const replacement=await state.roles.replace(state.instance.id,'assistant',first,ready.revision)
 assert.notEqual(replacement.sessionId,first);assert.deepEqual(replacement.previousSessionIds,[first])
}))
test('reverse ownership rejects attachment of another instance current or retained historical Session',async()=>setup(async state=>{
 const one=await state.roles.ensure(state.instance.id,'assistant')
 await assert.rejects(()=>state.roles.attach(state.other.id,'assistant',one.sessionId,null,0),/归属/)
 const replacement=await state.roles.replace(state.instance.id,'assistant',one.sessionId,one.revision)
 await assert.rejects(()=>state.roles.attach(state.other.id,'assistant',one.sessionId,null,0),/归属/)
 assert.deepEqual(replacement.previousSessionIds,[one.sessionId])
}))
test('ensure cannot silently ignore a selected replacement Agent on an existing binding',async()=>setup(async state=>{
 await state.roles.ensure(state.instance.id,'assistant')
 await assert.rejects(()=>state.roles.ensure(state.instance.id,'assistant',{kind:'agent',source:'managed',id:'different'}),/替换/)
}))

test('native success followed by an actual filesystem commit failure resumes the original durable intent',async()=>setup(async state=>{
 const file=join(state.dir,'roles.json'),backup=file+'.saved';let calls=0,first
 state.authority.create=async row=>{calls++;first=row.sessionId;await rename(file,backup);await mkdir(file);return row.sessionId}
 await assert.rejects(()=>state.roles.ensure(state.instance.id,'assistant'),/读取|directory|EISDIR/)
 await rm(file,{recursive:true});await rename(backup,file)
 const intent=(await state.roles.read(state.instance.id,'assistant')).binding
 assert.equal(intent.phase,'intent');assert.equal(intent.sessionId,first)
 state.authority.create=async row=>{calls++;return row.sessionId}
 const ready=await state.roles.retry(state.instance.id,'assistant',first,intent.revision)
 assert.equal(ready.sessionId,first);assert.equal(calls,2)
}))
test('failed durable intent writes invoke no native create and another Host owner is rejected',async()=>setup(async state=>{
 const parent=state.dir,backup=parent+'.temporarily-moved';let calls=0
 state.authority.create=async row=>{calls++;return row.sessionId}
 await assert.rejects(()=>RoleStore.open(join(parent,'roles.json')),/Host所有者/)
 await rename(parent,backup)
 try{await assert.rejects(()=>state.roles.ensure(state.instance.id,'assistant'));assert.equal(calls,0)}finally{await rename(backup,parent)}
 assert.equal((await state.roles.read(state.instance.id,'assistant')).binding,null)
}))
