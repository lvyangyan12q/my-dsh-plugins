import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,readdir,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
import {readProjectLayout,saveProjectLayout} from '../01_content/src/layout/project-layout.mjs'

const cli=fileURLToPath(new URL('../../bug-solver/scripts/worktable-layout.cjs',import.meta.url))
function run(folder,...args){const result=spawnSync(process.execPath,[cli,...args,'--folder',folder,'--json'],{encoding:'utf8'});return {...result,value:(()=>{try{return JSON.parse(result.stdout)}catch{return null}})()}}
test('layout CLI reads the selected project directory without initializing it',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'layout-cli-'))
  try{const result=run(folder,'show');assert.equal(result.status,0);assert.equal(result.value?.status,'missing');assert.equal((await readProjectLayout(folder)).status,'missing')}
  finally{await rm(folder,{recursive:true,force:true})}
})

test('layout CLI preserves populated tabs, renames stacked left panes, and rejects stale revisions',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'layout-cli-preserve-'))
  try{
    assert.equal(run(folder,'set','--top','1','--main','2','--title','Project').status,0)
    const initial=await readProjectLayout(folder),layout=initial.document
    layout.spec.main[1].tabs=[{id:'tab',title:'Keep this',content:{kind:'file',path:'/project/notes.md'}}];layout.spec.main[1].active=0
    layout.spec.left={id:'left-one',title:'Left',min:100,minimized:true};layout.spec.leftMore=[{id:'left-two',title:'Second',min:100}]
    layout.geometry.leftHs={'left-one':220,'left-two':380}
    assert.equal((await saveProjectLayout(folder,layout,layout.revision)).status,'ok')
    const renamed=run(folder,'rename-pane','left-two','新名称');assert.equal(renamed.status,0,renamed.stderr)
    let current=await readProjectLayout(folder);assert.equal(current.document.spec.leftMore[0].title,'新名称')
    assert.deepEqual(current.document.spec.main[1].tabs,layout.spec.main[1].tabs)
    assert.equal(current.document.version,3);assert.equal(current.document.spec.left.minimized,true)
    assert.deepEqual(current.document.geometry.leftHs,{'left-one':220,'left-two':380})
    const bytes=await readFile(join(folder,'.dsh-worktable','layout.json'),'utf8')
    const rejected=run(folder,'set','--main','1');assert.equal(rejected.status,1);assert.match(rejected.value.message,/移除已有内容/)
    assert.equal(await readFile(join(folder,'.dsh-worktable','layout.json'),'utf8'),bytes)
    assert.equal(run(folder,'set','--title','Stale','--expect-revision','1').value.status,'conflict')
    assert.equal(await readFile(join(folder,'.dsh-worktable','layout.json'),'utf8'),bytes)
    const backed=run(folder,'backup');assert.equal(backed.status,0);assert.match(backed.value.backup,/^layout-backup-/)
    const backup=JSON.parse(await readFile(join(folder,'.dsh-worktable',backed.value.backup),'utf8'));assert.deepEqual(backup,current.document)
    assert.equal((await readdir(join(folder,'.dsh-worktable'))).filter(name=>name==='layout.json').length,1)
  }finally{await rm(folder,{recursive:true,force:true})}
})

test('layout CLI refuses invalid primary files and migrates a legacy candidate without replacing its identity',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'layout-cli-legacy-'))
  try{
    assert.equal(run(folder,'set','--title','Legacy').status,0)
    const first=await readProjectLayout(folder),file=join(folder,'.dsh-worktable','layout.json')
    await writeFile(file,'BROKEN')
    assert.equal(run(folder,'set','--title','Replacement').value.status,'invalid');assert.equal(await readFile(file,'utf8'),'BROKEN')
    await rm(file)
    const legacy=join(folder,'.dsh-worktable','layout-'+first.document.project.id+'.json')
    const old=JSON.stringify({version:1,projectId:first.document.project.id,spec:first.document.spec})
    await writeFile(legacy,old)
    assert.equal(run(folder,'show').value.status,'legacy')
    assert.equal(run(folder,'set','--title','Migrated').status,0)
    const migrated=await readProjectLayout(folder);assert.equal(migrated.document.project.id,first.document.project.id);assert.equal(migrated.document.project.name,'Migrated')
    assert.equal(await readFile(legacy,'utf8'),old)
  }finally{await rm(folder,{recursive:true,force:true})}
})

test('layout CLI creates one fixed file with a stable identity and does not reset unchanged panes',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'layout-cli-create-'))
  try{
    const created=run(folder,'set','--top','1','--main','2','--title','测试项目');assert.equal(created.status,0,created.stderr)
    const first=await readProjectLayout(folder);assert.equal(first.status,'ok');assert.equal(first.document.project.name,'测试项目')
    assert.equal(first.document.spec.top.length,1);assert.equal(first.document.spec.main.length,2)
    const changed=run(folder,'set','--title','新标题');assert.equal(changed.status,0,changed.stderr)
    const second=await readProjectLayout(folder);assert.equal(second.document.project.id,first.document.project.id)
    assert.equal(second.document.spec.top.length,1);assert.equal(second.document.spec.main.length,2)
    assert.deepEqual(second.document.spec.main.map(p=>p.id),first.document.spec.main.map(p=>p.id))
  }finally{await rm(folder,{recursive:true,force:true})}
})

test('layout CLI ratio adjustment scales the stored top height without assuming a viewport size',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'layout-cli-ratio-'))
  try{
    assert.equal(run(folder,'set','--top','1','--main','1','--title','Ratios').status,0)
    assert.equal(run(folder,'set','--ratio','0.6').status,0)
    const result=await readProjectLayout(folder);assert.equal(result.document.geometry.topH,240);assert.equal(result.document.spec.topHeightRatio,0.6)
  }finally{await rm(folder,{recursive:true,force:true})}
})
