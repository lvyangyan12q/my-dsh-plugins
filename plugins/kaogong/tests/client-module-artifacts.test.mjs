import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { checkClientModuleArtifacts } from '../../../scripts/check-client-module-artifacts.mjs'
const root=fileURLToPath(new URL('../../..',import.meta.url))
const runtime=process.env.KAOGONG_TEST_RUNTIME ?? process.env.DSH_SOURCE

test('three built Client factories resolve through the actual native platform seed and module table', async()=>{
  const result=await checkClientModuleArtifacts({root,runtime})
  assert.equal(result.materialized.length,3)
  assert.equal(result.nodeRequireFallback,false)
  assert.equal(result.modelCalls,0)
})

test('standalone Kaogong factory tolerates an absent optional workbench without unregistered Node dependencies', async()=>{
  const result=await checkClientModuleArtifacts({root,runtime,workbench:false})
  assert.deepEqual(result.materialized,['@deepseek-ai/dsh-tool-kaogong'])
  assert.equal(result.workbenchRegistered,false)
})
