import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ApplicationDirectory } from '../01_content/src/framework/applications.mjs'

test('registered website is listed with its stable application identity', async () => {
  const dir=await mkdtemp(join(tmpdir(),'worktable-entry-'))
  try {
    const apps=new ApplicationDirectory(join(dir,'apps.json'))
    await apps.register({id:'reading-web',title:'阅读网页',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'})
    assert.deepEqual((await apps.catalog()).map(a=>a.id),['reading-web'])
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('project scope is explicit and malformed scopes cannot create an instance',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-scope-'))
  try {
    const apps=new ApplicationDirectory(join(dir,'apps.json'))
    await apps.register({id:'web',title:'Example',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'})
    await assert.rejects(()=>apps.createInstance('web',{id:'project-one'}),{code:'invalid-project'})
    await assert.rejects(()=>apps.createInstance('web',''),{code:'invalid-project'})
    assert.equal((await apps.snapshot()).instances.length,0)
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('removing a registration preserves instance and view identities and reports the missing application',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-missing-'))
  try {
    const apps=new ApplicationDirectory(join(dir,'apps.json'))
    await apps.register({id:'web',title:'Example',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'})
    const instance=await apps.createInstance('web',null);const view=await apps.createView(instance.id)
    await apps.unregister('web')
    await assert.rejects(()=>apps.resolveView(view.id),{code:'application-missing'})
    const snapshot=await apps.snapshot()
    assert.equal(snapshot.instances[0].id,instance.id);assert.equal(snapshot.views[0].id,view.id)
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('separate profiles do not share instances and failed saving never reports a new instance',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-profiles-'))
  try {
    const first=new ApplicationDirectory(join(dir,'first','apps.json'))
    const second=new ApplicationDirectory(join(dir,'second','apps.json'))
    const app={id:'web',title:'Example',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'}
    await first.register(app);await second.register(app)
    await first.createInstance('web',null)
    assert.equal(await second.latest('web',null),null)
    const blocked=join(dir,'not-a-directory');await writeFile(blocked,'preserve this file')
    const failing=new ApplicationDirectory(join(blocked,'apps.json'))
    await assert.rejects(()=>failing.register(app),{code:'storage-unavailable'})
    assert.equal((await second.snapshot()).instances.length,0)
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('registration rejects duplicate identities, incompatible versions and native or active content URLs', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-entry-'))
  try {
    const apps=new ApplicationDirectory(join(dir,'apps.json'),{hostOrigin:'http://127.0.0.1:3091'})
    const definition={id:'web',title:'网页',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'}
    await apps.register(definition)
    await assert.rejects(()=>apps.register(definition),{code:'application-conflict'})
    await assert.rejects(()=>apps.register({...definition,id:'other',protocolVersion:2}),{code:'protocol-incompatible'})
    for(const url of ['javascript:alert(1)','data:text/html,test','file:///C:/test','https://user:pass@example.com/','http://127.0.0.1:3091/api/worktable/file','https://example.com/?token=secret']) {
      await assert.rejects(()=>apps.register({...definition,id:'unsafe',url}),{code:'unsafe-entry'})
    }
    assert.deepEqual((await apps.catalog()).map(a=>a.id),['web'])
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('unassigned website instance attaches without changing identity and resumes after restart', async () => {
  const dir=await mkdtemp(join(tmpdir(),'worktable-entry-'))
  try {
    const file=join(dir,'apps.json'); const apps=new ApplicationDirectory(file)
    await apps.register({id:'reading-web',title:'阅读网页',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'})
    assert.equal(await apps.latest('reading-web',null),null)
    const initial=await apps.createInstance('reading-web',null)
    const attached=await apps.attach(initial.id,'project-one',initial.revision)
    assert.equal(attached.id,initial.id)
    assert.equal(attached.projectId,'project-one')
    assert.deepEqual(await apps.attach(initial.id,'project-one',initial.revision),attached)
    assert.equal((await new ApplicationDirectory(file).latest('reading-web','project-one')).id,initial.id)
    assert.equal(await apps.latest('reading-web','project-two'),null)
    await assert.rejects(()=>apps.attach(initial.id,'project-two',attached.revision),{code:'project-conflict'})
    const independent=await apps.createInstance('reading-web','project-one')
    assert.notEqual(independent.id,initial.id)
    const first=await apps.createView(initial.id); const second=await apps.createView(initial.id)
    assert.notEqual(first.id,second.id)
    assert.equal((await apps.resolveView(second.id)).instance.id,initial.id)
  } finally {await rm(dir,{recursive:true,force:true})}
})
