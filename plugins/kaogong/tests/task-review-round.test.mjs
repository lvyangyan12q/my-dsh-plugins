import assert from 'node:assert/strict'
import {test} from 'node:test'
import {createHash} from 'node:crypto'
import {PracticeRounds} from '../src/practice-rounds.ts'
import {registerTaskOwners} from '../src/task-owners.ts'

const table=()=>{const rows=new Map();return {rows,get:id=>rows.get(id),put:async(id,row)=>{rows.set(id,structuredClone(row))},entries:()=>rows.entries()}}

test('owned review instructions identify the validated round even when two submitted snapshots are identical',async()=>{
 const rounds=table(),bank=table(),notebook=table(),receipts=table(),owners=new Map()
 await bank.put('question',{subject:'行测-资料分析',knowledgePoint:'增长率',questionType:'单选',stem:'合成测试题',options:['A. 10','B. 20'],correctAnswer:'B',explanation:'合成解析',difficulty:'easy',source:'synthetic',origin:'local',reviewStatus:'approved',reviewNotes:'',tags:[],createdAt:'2020-01-01',reviewedAt:''})
 const practice=new PracticeRounds(rounds,bank,notebook),first=await practice.start({subject:'行测-资料分析',title:'真实提交',limit:10})
 await practice.submit(first.roundId,[{id:'question',answer:'B'}])
 const second='00000000-0000-4000-8000-000000000002',original=structuredClone(rounds.get(first.roundId))
 await rounds.put(second,original)
 await receipts.put('already-admitted',{instanceId:'learning',businessId:first.roundId,kind:'review',requestId:'prior-native-request',status:'done'})
 const previousReceipts=structuredClone([...receipts.entries()]),before=structuredClone([...rounds.entries()])
 const host={state:async(instanceId,operation)=>{assert.equal(instanceId,'learning');return operation({instanceId,rounds,practice})}}
 const remove=registerTaskOwners(host,{contribute:(appId,kind,owner)=>{assert.equal(appId,'kaogong');owners.set(kind,owner);return()=>owners.delete(kind)}},receipts,{call:async()=>assert.fail('review preparation has no material access')})
 try{
  const context={appId:'kaogong',instanceId:'learning',viewId:'learning-view',roleId:'counselor'},owner=owners.get('review')
  const one=await owner.prepare(context,{roundId:first.roundId}),two=await owner.prepare(context,{roundId:second})
  for(const [plan,id]of [[one,first.roundId],[two,second]]){
   assert.equal(plan.id,id)
   assert.ok(plan.text.includes('kaogong_practice_read'))
   assert.ok(plan.text.includes(JSON.stringify({roundId:id})),'Native instructions must include exact explicit-round tool parameters')
   assert.match(plan.text,/不得省略 roundId/)
   const content=JSON.parse(plan.text.split('以下是应用核验的数据：\n')[1]),{review,reviewClaim,...expected}=original
   assert.deepEqual(content,expected,'the captured result snapshot is not augmented or rewritten')
   assert.equal(plan.token.fingerprint,createHash('sha256').update(JSON.stringify({content:expected,subject:original.context.subject,materialIds:[]})).digest('hex'))
  }
  assert.notEqual(one.text,two.text,'different round identities cannot produce an ambiguous identical Native instruction')
  assert.deepEqual(one.token,two.token,'content evidence hash remains independent of the instruction text')
  await assert.rejects(owner.prepare(context,{roundId:'missing-round'}),/submitted round/)
  assert.deepEqual([...rounds.entries()],before,'preparation never alters original scores, state schema or review claims')
  assert.deepEqual([...receipts.entries()],previousReceipts,'previously admitted tasks are not rewritten or replayed')
 }finally{await remove()}
})
