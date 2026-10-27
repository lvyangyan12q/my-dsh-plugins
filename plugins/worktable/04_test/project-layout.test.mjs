import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {spawn} from 'node:child_process'
import {readProjectLayout,saveProjectLayout} from '../01_content/src/layout/project-layout.mjs'

function layout(){return {project:{id:'project-a',name:'项目甲'},spec:{id:'project-a',title:'项目甲',top:null,main:[{id:'p1',title:'窗口1',min:200,content:null}],chatWidth:{default:360,min:240,max:600}},geometry:{chatW:360,topH:200,leftW:260,paneWs:{p1:500},topWs:{},leftWs:{}}}}
test('a project is saved to one fixed file and recovered without browser identity',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-layout-'))
  try{
    assert.equal((await readProjectLayout(dir)).status,'missing')
    const saved=await saveProjectLayout(dir,layout(),null)
    assert.equal(saved.status,'ok');assert.equal(saved.document.revision,1)
    const restored=await readProjectLayout(dir)
    assert.deepEqual(restored.document,saved.document)
    assert.equal(restored.document.geometry.paneWs.p1,500)
    assert.equal(JSON.parse(await readFile(join(dir,'.dsh-worktable','layout.json'),'utf8')).project.id,'project-a')
  }finally{await rm(dir,{recursive:true,force:true})}
})

test('invalid content, dimensions and mismatched identity never replace a valid file',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-layout-invalid-'))
  try{
    await saveProjectLayout(dir,layout(),null)
    const file=join(dir,'.dsh-worktable','layout.json'),before=await readFile(file)
    for(const change of [l=>{l.spec.id='other'},l=>{l.geometry.chatW=-1},l=>{l.spec.main[0].content={kind:'arbitrary',secret:'x'}},l=>{l.spec.main.push({...l.spec.main[0]})},l=>{l.spec.main[0].tabs=[{id:'t1',title:'坏引用',content:{kind:'application',appId:'a'}}]}]){
      const invalid=layout();change(invalid)
      assert.equal((await saveProjectLayout(dir,invalid,1)).status,'invalid')
      assert.deepEqual(await readFile(file),before)
    }
  }finally{await rm(dir,{recursive:true,force:true})}
})

test('legacy files are read-only candidates, selection is explicit and a new main file wins',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-layout-legacy-'))
  try{
    const sub=join(dir,'.dsh-worktable');await mkdir(sub)
    const legacy=JSON.stringify({version:1,projectId:'project-a',spec:layout().spec})
    await writeFile(join(sub,'layout-project-a.json'),legacy)
    const candidate=await readProjectLayout(dir)
    assert.equal(candidate.status,'legacy');assert.equal(candidate.document.project.id,'project-a');assert.equal(candidate.document.geometry.chatW,360)
    assert.equal((await readProjectLayout(dir,{projectId:'other'})).status,'ambiguous')
    await writeFile(join(sub,'layout-other.json'),JSON.stringify({version:1,projectId:'other',spec:{...layout().spec,id:'other'}}))
    const ambiguous=await readProjectLayout(dir);assert.equal(ambiguous.status,'ambiguous');assert.deepEqual(ambiguous.candidates,['layout-other.json','layout-project-a.json'])
    assert.equal((await readProjectLayout(dir,{legacyFile:'layout-project-a.json'})).status,'legacy')
    assert.equal((await readProjectLayout(dir,{projectId:'other',legacyFile:'layout-project-a.json'})).document.project.id,'project-a')
    assert.equal((await readProjectLayout(dir,{legacyFile:'../outside.json'})).status,'invalid')
    assert.equal((await saveProjectLayout(dir,candidate.document,null)).status,'ok')
    assert.equal((await readProjectLayout(dir)).status,'ok');assert.equal(await readFile(join(sub,'layout-project-a.json'),'utf8'),legacy)
  }finally{await rm(dir,{recursive:true,force:true})}
})

test('damaged, unsupported and oversized files are preserved instead of initialized from cache',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-layout-preserve-'))
  try{
    const sub=join(dir,'.dsh-worktable');await mkdir(sub)
    const file=join(sub,'layout.json')
    for(const [bytes,status] of [['{broken','invalid'],[JSON.stringify({version:999}),'unsupported'],[JSON.stringify({version:2,revision:1}),'invalid'],['x'.repeat(1024*1024+1),'invalid']]){
      await writeFile(file,bytes)
      assert.equal((await readProjectLayout(dir)).status,status)
      assert.equal((await saveProjectLayout(dir,layout(),null)).status,status)
      assert.equal(await readFile(file,'utf8'),bytes)
    }
  }finally{await rm(dir,{recursive:true,force:true})}
})

test('separate writing processes serialize creation and reject stale revisions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-layout-process-'))
  const moduleUrl=new URL('../01_content/src/layout/project-layout.mjs',import.meta.url).href
  const code="const {saveProjectLayout}=await import(process.argv[1]);console.log(JSON.stringify(await saveProjectLayout(process.argv[2],JSON.parse(process.argv[3]),JSON.parse(process.argv[4]))))"
  function save(title,revision){return new Promise((resolve,reject)=>{
    const value=layout();value.project.name=title;value.spec.title=title
    const child=spawn(process.execPath,['--input-type=module','-e',code,moduleUrl,dir,JSON.stringify(value),JSON.stringify(revision)],{windowsHide:true,stdio:['ignore','pipe','pipe']})
    let output='',error='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>error+=chunk);child.on('error',reject);child.on('exit',status=>{if(status)reject(new Error(error));else resolve(JSON.parse(output))})
  })}
  try{
    const first=await Promise.all([save('writer-a',null),save('writer-b',null)])
    assert.deepEqual(first.map(r=>r.status).sort(),['conflict','ok'])
    const update=await Promise.all([save('update-a',1),save('update-b',1)])
    assert.deepEqual(update.map(r=>r.status).sort(),['conflict','ok'])
    const final=await readProjectLayout(dir)
    assert.equal(final.document.revision,2);assert.equal(final.document.project.name,update.find(r=>r.status==='ok').document.project.name)
  }finally{await rm(dir,{recursive:true,force:true})}
})

test('supported references survive round trip while runtime fields are excluded',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-layout-content-'))
  try{
    const value=layout();value.spec.main[0].tabs=[
      {id:'application',title:'App',content:{kind:'application',appId:'a',instanceId:'i',viewId:'v',title:'App',token:'private'}},
      {id:'file',title:'File',content:{kind:'file',path:'C:/project/notes.md'}},
      {id:'iframe',title:'Page',content:{kind:'iframe',url:'https://example.com/',title:'Page'}},
      {id:'builtin',title:'Terminal',content:{kind:'builtin',type:'terminal'}}
    ];value.spec.main[0].active=2;value.spec.runtime={session:{}};value.project.token='private'
    const saved=await saveProjectLayout(dir,value,null);assert.equal(saved.status,'ok')
    const read=await readProjectLayout(dir);assert.equal(read.document.spec.main[0].active,2)
    assert.deepEqual(read.document.spec.main[0].tabs.map(t=>t.content.kind),['application','file','iframe','builtin'])
    assert.equal(JSON.stringify(read.document).includes('private'),false);assert.equal('runtime' in read.document.spec,false)
  }finally{await rm(dir,{recursive:true,force:true})}
})


test('version 3 keeps pane minimization and left heights, and upgrades version 2 with an exact backup',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-layout-v3-'))
  try{
    const value=layout();value.spec.left={id:'l1',title:'Left',min:120,minimized:true};value.spec.leftMore=[{id:'l2',title:'Left 2',min:120}]
    value.geometry.leftWs={l1:240,l2:240};value.geometry.leftHs={l1:210,l2:390}
    const saved=await saveProjectLayout(dir,value,null)
    assert.equal(saved.status,'ok');assert.equal(saved.document.version,3)
    assert.deepEqual((await readProjectLayout(dir)).document.geometry.leftHs,{l1:210,l2:390})
    assert.equal(saved.document.spec.left.minimized,true)
    const sub=join(dir,'.dsh-worktable'),file=join(sub,'layout.json')
    const old={...saved.document,version:2};delete old.spec.left.minimized;delete old.geometry.leftHs
    const bytes=JSON.stringify(old,null,3)+'\n';await writeFile(file,bytes)
    const read=await readProjectLayout(dir);assert.equal(read.status,'ok');assert.equal(read.document.version,2)
    const upgraded=await saveProjectLayout(dir,{...read.document,geometry:{...read.document.geometry,leftHs:{l1:200,l2:400}}},1)
    assert.equal(upgraded.status,'ok');assert.equal(upgraded.document.version,3)
    assert.equal(await readFile(join(sub,'layout-backup-v2-revision-1.json'),'utf8'),bytes)
    assert.deepEqual(upgraded.document.geometry.leftHs,{l1:200,l2:400})
    const invalid=structuredClone(value);invalid.geometry.leftHs.l1=-1
    assert.equal((await saveProjectLayout(dir,invalid,2)).status,'invalid')
    const changedOld=bytes+' ';await writeFile(file,changedOld)
    assert.equal((await saveProjectLayout(dir,value,1)).status,'error')
    assert.equal(await readFile(file,'utf8'),changedOld)
  }finally{await rm(dir,{recursive:true,force:true})}
})


test('legacy missing pane minima migrate without changing references and modern files stay strict',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'worktable-legacy-min-'))
  try{
    const sub=join(dir,'.dsh-worktable');await mkdir(sub)
    const spec=layout().spec
    spec.left={id:'left1',title:'Left 1',tabs:[{id:'tab1',title:'Keep',content:{kind:'iframe',url:'about:blank'}}],active:0}
    spec.leftMore=[{id:'left2',title:'Left 2',content:null}]
    spec.top=[{id:'top1',title:'Top',content:null}]
    delete spec.main[0].min
    const bytes=JSON.stringify({version:1,projectId:spec.id,spec}),legacy=join(sub,'layout-'+spec.id+'.json')
    await writeFile(legacy,bytes)
    const candidate=await readProjectLayout(dir)
    assert.equal(candidate.status,'legacy','missing legacy minima are a supported old shape')
    const restored=candidate.document.spec
    for(const pane of [restored.left,...restored.leftMore,...restored.top,...restored.main])assert.equal(pane.min,200)
    assert.deepEqual(restored.left.tabs,spec.left.tabs)
    assert.equal((await saveProjectLayout(dir,candidate.document,null)).status,'ok')
    assert.equal(await readFile(legacy,'utf8'),bytes)
    const current=await readProjectLayout(dir);assert.equal(current.document.version,3)
    const file=join(sub,'layout.json');delete current.document.spec.left.min
    const invalid=JSON.stringify(current.document);await writeFile(file,invalid)
    assert.equal((await readProjectLayout(dir)).status,'invalid','modern documents do not silently repair missing required fields')
    assert.equal((await saveProjectLayout(dir,candidate.document,1)).status,'invalid')
    assert.equal(await readFile(file,'utf8'),invalid)
  }finally{await rm(dir,{recursive:true,force:true})}
})
