import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {managedAgentDefinition,assertManagedComposition} from '../01_content/src/framework/capability-native.mjs'
const names=['@deepseek-ai/dsh-tool-fs','@deepseek-ai/dsh-tool-fs-search','@deepseek-ai/dsh-tool-ask-user','@deepseek-ai/dsh-tool-skill','@deepseek-ai/dsh-persona']
test('explicit managed base names native filesystem/search/question plugins and rejects merely declared or disabled layers',async()=>{
 const row={id:'reader',presetId:'worktable.managed.reader',title:'Reader',content:'Read.',skillIds:[],baseComposition:'workspace-basic-v1'}
 const definition=managedAgentDefinition(row)
 assert.deepEqual(definition.plugins.map(row=>row.name),names)
 let rows=names.map(moduleName=>({moduleName,enabled:true,fiberState:2}))
 const native={compositionInventory:async()=>[{id:row.presetId,rows}]}
 await assertManagedComposition(native,row)
 rows=rows.map((r,i)=>i===0?{...r,fiberState:0}:r)
 await assert.rejects(()=>assertManagedComposition(native,row),/原生基础能力/)
 rows=rows.map((r,i)=>i===0?{...r,fiberState:2,enabled:false}:r)
 await assert.rejects(()=>assertManagedComposition(native,row),/原生基础能力/)
})
const root=process.env.WORKTABLE_NATIVE_RC2_ROOT
test('official unpatched rc.2 public parser accepts the exact managed definition and preserves its enabled plugin layer',{skip:!root},async()=>{
 const pkg=JSON.parse(await readFile(join(root,'packages/preset/agent-preset-registry/package.json'),'utf8'))
 assert.equal(pkg.version,'0.2.0-rc.2')
 const {entryListProblem}=await import(pathToFileURL(join(root,'packages/preset/agent-preset-registry/src/definition.ts')))
 const {definitionComposition}=await import(pathToFileURL(join(root,'packages/preset/agent-preset-registry/src/composition-inventory.ts')))
 const definition=managedAgentDefinition({presetId:'worktable.managed.reader',title:'Reader',content:'Read.',skillIds:[],baseComposition:'workspace-basic-v1'})
 assert.equal(entryListProblem(definition.plugins),undefined)
 const composition=definitionComposition(definition.plugins,()=>{throw new Error('No expression is allowed in this fixed composition')})
 assert.deepEqual(composition.rows.map(row=>[row.moduleName,row.enabled]),names.map(name=>[name,true]))
})
