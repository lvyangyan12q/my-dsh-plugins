import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createViewTransport, createRoleNavigator, roleIdForKey} from '../src/client-runtime.ts'
import {KaogongViewStatePool} from '../src/view-state.tsx'
import {readPracticeDraft,savePracticeDraft,readAdmittedReviews,markAdmittedReview} from '../src/practice-client.ts'

test('each view sends its own trusted view identity without a global instance selector', async () => {
  const calls: string[] = []
  const send: typeof fetch = async input => {calls.push(String(input)); return new Response('{}')}
  const left = createViewTransport({instanceId:'learning-a',viewId:'view-a'},send)
  const right = createViewTransport({instanceId:'learning-a',viewId:'view-b'},send)
  await left.fetch('/api/kaogong/dashboard')
  await right.fetch('/api/kaogong/knowledge?q=增长率')
  await left.fetch('/api/kaogong/practice/read',{method:'POST',body:'{"roundId":"round-a"}'})
  assert.deepEqual(calls,[
    '/api/kaogong/dashboard?viewId=view-a',
    '/api/kaogong/knowledge?q=%E5%A2%9E%E9%95%BF%E7%8E%87&viewId=view-b',
    '/api/kaogong/practice/read?viewId=view-a',
  ])
  await assert.rejects(()=>left.fetch('/api/kaogong/dashboard?viewId=view-b'),/视图/)
  await assert.rejects(()=>left.fetch('/api/kaogong/dashboard?instanceId=learning-b'),/实例/)
  await assert.rejects(()=>left.fetch('https://example.invalid/api/kaogong/dashboard'),/应用/)
  await assert.rejects(()=>left.fetch('/api/kaogong/../worktable/roles'),/应用/)
  await assert.rejects(()=>left.json('/api/kaogong/practice/read',{instanceId:'learning-b'}),/实例/)
  assert.equal(calls.length,3,'rejected requests never reach the external transport')
})

test('same-instance views share business state while drafts and legacy choices stay isolated',()=>{
  const entries=new Map<string,string>()
  const previous=Object.getOwnPropertyDescriptor(globalThis,'window')
  Object.defineProperty(globalThis,'window',{configurable:true,value:{localStorage:{getItem:(key:string)=>entries.get(key)??null,setItem:(key:string,value:string)=>entries.set(key,value)}}})
  try{
    entries.set('kaogong/default/learning-view/v1',JSON.stringify({version:1,studyOpen:true,page:'errors',pane:'conversation',role:{roleId:'counselor'}}))
    const pool=new KaogongViewStatePool()
    const first=pool.forInstance('learning-a'),same=pool.forInstance('learning-a'),other=pool.forInstance('learning-b')
    first.cell('answers',{}).set({q:'B'})
    assert.deepEqual(same.cell('answers',{}).value,{q:'B'})
    assert.deepEqual(other.cell('answers',{}).value,{})
    pool.forView('learning-a','view-a').cell('reader.query','').set('只属于甲视图')
    assert.equal(pool.forView('learning-a','view-b').cell('reader.query','').value,'')
    assert.equal(first.cell('study.page',null).value,null,'new instance never adopts the old default preferences')
    const draft={roundId:'00000000-0000-4000-8000-000000000001',answers:{q:'B'},errorReasons:{},notes:{}}
    savePracticeDraft(draft,'learning-a')
    markAdmittedReview(draft.roundId,'learning-a')
    assert.deepEqual(readPracticeDraft('learning-a'),draft)
    assert.equal(readPracticeDraft('learning-b'),null)
    assert.deepEqual(readAdmittedReviews('learning-b'),[])
    assert.throws(()=>pool.forInstance('default'),/实例/)
  }finally{if(previous)Object.defineProperty(globalThis,'window',previous);else Reflect.deleteProperty(globalThis,'window')}
})

test('opening a teacher preserves the exact facade binding and never retries a refused navigation',async()=>{
  const calls: unknown[]=[]
  const roles={ensure:async(roleId:string)=>{calls.push(['ensure',roleId]);return {phase:'ready',sessionId:'native-original',revision:7}},
    open:async(...args:unknown[])=>{calls.push(['open',...args])}}
  const open=createRoleNavigator('learning-a',roles)
  await open({appId:'kaogong',instanceId:'learning-a',roleId:'teacher',subject:'行测-资料分析'})
  assert.deepEqual(calls,[['ensure','teacher.data-analysis'],['open','teacher.data-analysis','native-original',7]])
  await assert.rejects(()=>open({appId:'kaogong',instanceId:'learning-b',roleId:'teacher'}),/实例/)
  roles.open=async()=>{throw new Error('navigation denied')}
  await assert.rejects(()=>open({appId:'kaogong',instanceId:'learning-a',roleId:'counselor'}),/navigation denied/)
  assert.equal(calls.filter(row=>Array.isArray(row)&&row[0]==='ensure').length,2)
  assert.equal(roleIdForKey({roleId:'teacher'}),'teacher')
  assert.throws(()=>roleIdForKey({roleId:'teacher',subject:'未知科目'}),/科目/)
})
