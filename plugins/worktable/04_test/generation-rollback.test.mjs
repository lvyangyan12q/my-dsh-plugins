import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'
import {createRequire} from 'node:module'
import {fixture} from './generation-fixture.mjs'
import {TaskStore} from '../01_content/src/framework/tasks.mjs'
const require=createRequire(new URL('../01_content/package.json',import.meta.url)),{buildSync}=require('esbuild');
test('actual historical 0.8.4 public reader rejects managed task schema2 and preserves original bytes, new TaskStore reopens it',async()=>{
 const f=await fixture();let reopened;
 try{const generation=await f.generations.prepare({viewId:f.view.id,pageId:'home',moduleId:'output',description:'Synthetic rollback metadata',rootConfirmed:true}),file=join(f.dir,'tasks.json');const managed=await f.tasks.find(generation.taskId);await f.tasks.discard(managed.id,managed.revision);await f.tasks.prepare({viewId:f.view.id,roleId:'maker',text:'Ordinary synthetic follow-up',contexts:[]});await f.tasks.close();const before=await readFile(file);
  // Execute the committed 0.8.4 public RoleStore implementation; do not reconstruct its rules in the test.
  const root=fileURLToPath(new URL('../../../',import.meta.url)),oldSource=execFileSync('git',['show','6e63ea381475b2095f1b6b394d9071497e6b2e58:plugins/worktable/01_content/src/framework/roles.mjs'],{cwd:root,encoding:'utf8'});const old=buildSync({stdin:{contents:oldSource,resolveDir:fileURLToPath(new URL('../01_content/src/framework/',import.meta.url)),sourcefile:'actual-v084-roles.mjs'},bundle:true,platform:'node',format:'esm',write:false});const {RoleStore:OldReader}=await import('data:text/javascript;base64,'+Buffer.from(old.outputFiles[0].text).toString('base64'));await assert.rejects(OldReader.open(file),{code:'schema-incompatible'});assert.deepEqual(await readFile(file),before);reopened=await TaskStore.open(file);const state=await reopened.snapshot();assert.equal(state.schema,2);const restored=state.tasks.find(row=>row.id===generation.taskId);assert.equal(restored.preparation.id,generation.id);assert.equal(restored.status,'discarded');assert.equal(f.prompts,0)
 }finally{await reopened?.close();await f.close()}
})
