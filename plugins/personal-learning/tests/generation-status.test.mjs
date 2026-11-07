import {test} from 'node:test'
import assert from 'node:assert/strict'
import {describeGeneration} from '../src/generation-status.mjs'

test('no request means no status line',()=>{
 assert.equal(describeGeneration([]),null)
 assert.equal(describeGeneration(undefined),null)
})

test('generation states are distinguishable and never claim success early',()=>{
 assert.match(describeGeneration([{status:'prepared'}]).label,/尚未发送/)
 assert.match(describeGeneration([{status:'accepted'}]).label,/正在生成/)
 assert.match(describeGeneration([{status:'accepted',artifactStatus:'submitted'}]).label,/已提交/)
 assert.match(describeGeneration([{status:'accepted',nativeStatus:'failed'}]).label,/生成失败/)
 assert.match(describeGeneration([{status:'accepted',nativeStatus:'cancelled'}]).label,/已取消/)
 assert.match(describeGeneration([{status:'withdrawn'}]).label,/已撤回/)
 assert.match(describeGeneration([{status:'unknown'}]).label,/核对/)
})

test('the latest request wins over older history',()=>{
 const rows=[{status:'accepted',artifactStatus:'submitted'},{status:'withdrawn'}]
 assert.match(describeGeneration(rows).label,/已提交/)
})
