import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
const require = createRequire(new URL('../01_content/package.json', import.meta.url))
const { buildSync } = require('esbuild')
const module = { exports: {} }
runInNewContext(buildSync({entryPoints:[fileURLToPath(new URL('../01_content/src/client/hostInput.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text,{module,exports:module.exports})
const { createAnnotationInput } = module.exports
function fixture() {
  let selected = 'one', binding = {sessionId:'one'}
  const state = {draftRev:7,phase:'claimed'}, calls = []
  const face = {state:{getSnapshot:()=>state},focus:()=>calls.push('focus')}
  const bridge = {sessions:{list:{getSnapshot:()=>({current:selected})},binding:()=>binding,scope:id=>id},conversation:{input:{for:()=>face,requestDraftInitialization:()=>assert.fail('no initialization fallback')}}}
  const actions = {captureInsertion:()=>({start:2,end:5,draftRev:7}),insertText:(text,span)=>{calls.push({text,span:{...span}});return true}}
  const input = createAnnotationInput(bridge)
  return {input,state,calls,actions,mount:()=>input.mount('one',actions),select:id=>selected=id,regenerate:()=>binding={sessionId:'one'}}
}
test('annotation captures selection end before editing and inserts once through its mounted public face',()=>{
  const f=fixture();f.mount();const captured=f.input.capture();assert.equal(f.calls.length,0)
  captured.insert('要求');assert.deepEqual(f.calls,[{text:'要求',span:{start:5,end:5,draftRev:7}},'focus'])
  assert.throws(()=>captured.insert('要求'),/重新/);assert.equal(f.calls.length,2)
})
test('changed draft, another Session, generation replacement, slot teardown and plugin disposal refuse insertion',()=>{
  for (const change of [f=>f.state.draftRev++,f=>f.select('two'),f=>f.regenerate(),(f,unmount)=>unmount(),f=>f.input.dispose()]) {
    const f=fixture(),unmount=f.mount(),captured=f.input.capture()
    change(f,unmount)
    assert.throws(()=>captured.insert('保留的标注'),/保留/)
    assert.deepEqual(f.calls,[])
  }
})
test('remount never revives an earlier capture and old cleanup does not unregister the new slot',()=>{
  const f=fixture(),unmount=f.mount(),old=f.input.capture()
  f.mount();unmount()
  assert.throws(()=>old.insert('旧要求'),/重建/)
  f.input.capture().insert('新要求')
  assert.equal(f.calls[0].text,'新要求')
})
test('native rejection or exception keeps the capture unusable; no duplicate or alternative channel',()=>{
  for (const result of [false,undefined,'throw']) {
    const f=fixture();f.actions.insertText=()=>{f.calls.push('attempt');if(result==='throw')throw Error('unknown');return result}
    f.mount();const captured=f.input.capture()
    assert.throws(()=>captured.insert('保留的标注'),/保留/)
    assert.throws(()=>captured.insert('保留的标注'),/重新/)
    assert.deepEqual(f.calls,['attempt'])
  }
})
test('missing mount, stale capture, missing binding and disposed bridge cannot capture another input',()=>{
  const missing=fixture();assert.throws(()=>missing.input.capture(),/不可用/)
  const stale=fixture();stale.mount();stale.state.draftRev++;assert.throws(()=>stale.input.capture(),/过期/)
  const generation=fixture();generation.mount();generation.regenerate();assert.throws(()=>generation.input.capture(),/不可用/)
  const disposed=fixture();disposed.input.dispose();disposed.mount();assert.throws(()=>disposed.input.capture(),/不可用/)
})
