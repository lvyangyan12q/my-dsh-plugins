import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkClientModuleArtifacts } from '../../../scripts/check-client-module-artifacts.mjs'

async function check(options) {
  if (!process.env.READING_LEGACY_ROOT) return checkClientModuleArtifacts(options)
  const root = await mkdtemp(join(tmpdir(), 'reading-factories-'))
  try {
    for (const name of ['kaogong', 'personal-workbench', 'reading-statistics']) {
      const source = name === 'reading-statistics' ? options.root : process.env.READING_LEGACY_ROOT
      await mkdir(join(root, 'plugins', name, 'lib'), { recursive: true })
      for (const file of ['package.json', 'lib/client.js']) await copyFile(join(source, 'plugins', name, file), join(root, 'plugins', name, file))
    }
    return await checkClientModuleArtifacts({ ...options, root })
  } finally { await rm(root, { recursive: true, force: true }) }
}

test('official native browser factory graph boots reading and kaogong with no workbench bundle', async () => {
  const result = await check({ root: fileURLToPath(new URL('../../..', import.meta.url)), runtime: process.env.DSH_SOURCE, workbench: false, readingLifecycle: true })
  assert.deepEqual(result.materialized, ['@deepseek-ai/dsh-tool-kaogong', '@deepseek-ai/dsh-reading-statistics'])
  assert.equal(result.nodeRequireFallback, false)
})

test('official reading entry survives optional platform service loss and recovers one adapter', async () => {
  const result = await check({ root: fileURLToPath(new URL('../../..', import.meta.url)), runtime: process.env.DSH_SOURCE, readingLifecycle: true })
  assert.equal(result.readingEntryActivationTested, true)
  assert.equal(result.nodeRequireFallback, false)
})