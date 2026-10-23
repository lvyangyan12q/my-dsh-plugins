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

test('explicit resume makes an older instance latest without replacing its view or making queries write',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-resume-'))
  try {
    const apps=new ApplicationDirectory(join(dir,'apps.json'))
    await apps.register({id:'web',title:'Example',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'})
    const first=await apps.createInstance('web','project-one');const firstView=await apps.createView(first.id)
    const second=await apps.createInstance('web','project-one');await apps.createView(second.id)
    assert.equal((await apps.latest('web','project-one')).id,second.id)
    await apps.resolveView(firstView.id)
    assert.equal((await apps.latest('web','project-one')).id,second.id)
    const resumed=await apps.resume(first.id)
    assert.equal(resumed.id,first.id)
    assert.equal((await apps.latest('web','project-one')).id,first.id)
    assert.equal((await apps.resolveView(firstView.id)).view.id,firstView.id)
    assert.equal((await apps.snapshot()).views.length,2)
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
    for(const url of ['javascript:alert(1)','data:text/html,test','file:///C:/test','https://user:pass@example.com/','http://127.0.0.1:3091/api/worktable/file','http://127.0.0.1:18573/','https://example.com/?token=secret']) {
      await assert.rejects(()=>apps.register({...definition,id:'unsafe',url}),{code:'unsafe-entry'})
    }
    assert.deepEqual((await apps.catalog()).map(a=>a.id),['web'])
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('unassigned website instance attaches without changing identity and resumes after restart', async () => {
  const dir=await mkdtemp(join(tmpdir(),'worktable-entry-'))
  try {
    const file=join(dir,'apps.json'); let apps=new ApplicationDirectory(file)
    await apps.register({id:'reading-web',title:'阅读网页',version:'1.0.0',protocolVersion:1,kind:'web',url:'https://example.com/'})
    assert.equal(await apps.latest('reading-web',null),null)
    const initial=await apps.createInstance('reading-web',null)
    const attached=await apps.attach(initial.id,'project-one',initial.revision)
    assert.equal(attached.id,initial.id)
    assert.equal(attached.projectId,'project-one')
    assert.deepEqual(await apps.attach(initial.id,'project-one',initial.revision),attached)
    await apps.close();apps=new ApplicationDirectory(file);assert.equal((await apps.latest('reading-web','project-one')).id,initial.id)
    assert.equal(await apps.latest('reading-web','project-two'),null)
    await assert.rejects(()=>apps.attach(initial.id,'project-two',attached.revision),{code:'project-conflict'})
    const independent=await apps.createInstance('reading-web','project-one')
    assert.notEqual(independent.id,initial.id)
    const first=await apps.createView(initial.id); const second=await apps.createView(initial.id)
    assert.notEqual(first.id,second.id)
    assert.equal((await apps.resolveView(second.id)).instance.id,initial.id)
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('trusted deep contribution restores the same instance and declared modules across plugin lifecycles',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-deep-'))
  try {
    const file=join(dir,'apps.json'),apps=new ApplicationDirectory(file)
    const definition={id:'reading-statistics',title:'阅读',version:'0.1.0',protocolVersion:1,kind:'deep',views:[{id:'page',title:'完整页'},{id:'stats',title:'统计'}]}
    const withdraw=await apps.contribute(definition)
    assert.equal((await apps.catalog())[0].kind,'deep')
    await assert.rejects(()=>apps.unregister(definition.id),{code:'contribution-owned'})
    const first=await apps.createInstance(definition.id,'project-one'),other=await apps.createInstance(definition.id,'project-two')
    const page=await apps.createView(first.id,'page'),stats=await apps.createView(first.id,'stats')
    assert.equal((await apps.resolveView(stats.id)).instance.id,first.id)
    assert.equal((await apps.resolveView(stats.id)).view.type,'stats')
    assert.notEqual(other.id,first.id)
    await assert.rejects(()=>apps.createView(first.id,'unknown'),{code:'view-unsupported'})
    withdraw()
    await assert.rejects(()=>apps.resolveView(page.id),{code:'application-missing'})
    assert.equal((await apps.snapshot()).instances.length,2)
    await apps.close();const next=new ApplicationDirectory(file);await next.contribute(definition)
    assert.equal((await next.resolveView(stats.id)).instance.id,first.id)
    assert.equal((await next.latest(definition.id,'project-two')).id,other.id)
    await assert.rejects(()=>next.contribute(definition),{code:'application-conflict'})
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('a plugin cannot replace an already registered website identity or silently retarget its saved views',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-conflict-'))
  try {
    const apps=new ApplicationDirectory(join(dir,'apps.json'))
    await apps.register({id:'reading',title:'Existing website',version:'1',protocolVersion:1,kind:'web',url:'https://example.com/'})
    const instance=await apps.createInstance('reading',null),view=await apps.createView(instance.id)
    await assert.rejects(async()=>apps.contribute({id:'reading',title:'Plugin',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]}),{code:'application-conflict'})
    assert.equal((await apps.resolveView(view.id)).application.kind,'web')
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('concurrent deep and website registration never acquire the same identity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-registration-race-'))
  try {
    const apps=new ApplicationDirectory(join(dir,'apps.json'))
    for(let index=0;index<100;index++){
      const id='competing-'+index
      const results=await Promise.allSettled([
        apps.contribute({id,title:'Plugin',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]}),
        apps.register({id,title:'Website',version:'1',protocolVersion:1,kind:'web',url:'https://example.com/'})
      ])
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1,'exactly one definition owns '+id)
      assert.equal(results.find(result=>result.status==='rejected').reason.code,'application-conflict')
      if(results[0].status==='fulfilled')results[0].value()
    }
  } finally {await rm(dir,{recursive:true,force:true})}
})

test('withdrawing and restarting a deep plugin cannot redirect its retained instances to a website',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-reserved-'))
  try {
    const file=join(dir,'apps.json'),apps=new ApplicationDirectory(file)
    const definition={id:'reading',title:'Plugin',version:'1',protocolVersion:1,kind:'deep',views:[{id:'page',title:'Page'}]}
    const withdraw=await apps.contribute(definition),instance=await apps.createInstance('reading',null),view=await apps.createView(instance.id)
    withdraw()
    await apps.close();const next=new ApplicationDirectory(file)
    await assert.rejects(()=>next.register({id:'reading',title:'Website',version:'1',protocolVersion:1,kind:'web',url:'https://example.com/'}),{code:'application-conflict'})
    await assert.rejects(()=>next.resolveView(view.id),{code:'application-missing'})
    await next.contribute(definition)
    assert.equal((await next.resolveView(view.id)).application.kind,'deep')
  } finally {await rm(dir,{recursive:true,force:true})}
})
