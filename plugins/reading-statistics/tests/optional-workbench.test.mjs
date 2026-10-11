import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { checkClientModuleArtifacts } from '../../../scripts/check-client-module-artifacts.mjs'

test('official native browser factory graph boots reading and kaogong with no workbench bundle', async () => {
  const result = await checkClientModuleArtifacts({ root: fileURLToPath(new URL('../../..', import.meta.url)), runtime: process.env.DSH_SOURCE, workbench: false, readingLifecycle: true })
  assert.deepEqual(result.materialized, ['@deepseek-ai/dsh-tool-kaogong', '@deepseek-ai/dsh-reading-statistics'])
  assert.equal(result.nodeRequireFallback, false)
})

test('official reading entry survives optional platform service loss and recovers one adapter', async () => {
  const result = await checkClientModuleArtifacts({ root: fileURLToPath(new URL('../../..', import.meta.url)), runtime: process.env.DSH_SOURCE, readingLifecycle: true })
  assert.equal(result.readingEntryActivationTested, true)
  assert.equal(result.nodeRequireFallback, false)
})