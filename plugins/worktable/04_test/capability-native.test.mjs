import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
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
test('a refused native composition reports bounded module facts without instructions or credential-like diagnostic values',async()=>{
 const row={presetId:'worktable.managed.reader',content:'private instructions must not appear',baseComposition:'workspace-basic-v1'}
 const registry={compositionInventory:async()=>[{id:row.presetId,broken:'apiKey=fake-sensitive-value '+('pending '.repeat(300)),rows:[{moduleName:'@deepseek-ai/dsh-tool-fs',enabled:true},{moduleName:'native-normalized-fs',enabled:true,fiberState:2}]}]}
 await assert.rejects(()=>assertManagedComposition(registry,row),error=>{
  assert.match(error.message,/dsh-tool-fs: enabled=true, state=none/)
  assert.match(error.message,/dsh-tool-ask-user: missing/)
  assert.match(error.message,/observed:.*native-normalized-fs/)
  assert.ok(!error.message.includes('fake-sensitive-value'))
  assert.ok(!error.message.includes(row.content))
  assert.ok(error.message.length<1600)
  return true
 })
})
test('official rc.2 plugin Config schemas accept every managed base row including required search deployment choice',{skip:!root},async()=>{
 const official=createRequire(join(root,'packages/client/ui-renderer/package.json'))
 const definition=managedAgentDefinition({presetId:'worktable.managed.reader',title:'Reader',content:'Read.',skillIds:[],baseComposition:'workspace-basic-v1'})
 for(const row of definition.plugins){
  const plugin=await import(pathToFileURL(official.resolve(row.name)))
  assert.equal(typeof plugin.Config,'function',row.name+' exposes its public Config schema')
  if(row.name==='@deepseek-ai/dsh-tool-fs-search')assert.throws(()=>new plugin.Config({}),/sampleOverCapGlobResults/)
  let parsed
  assert.doesNotThrow(()=>{parsed=new plugin.Config(row.config??{})},row.name+' managed declaration must satisfy the real native Config schema')
  if(row.name==='@deepseek-ai/dsh-tool-fs-search')assert.equal(parsed.sampleOverCapGlobResults,false)
 }
})
