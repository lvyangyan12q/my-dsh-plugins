import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

assert(process.env.KAOGONG_TEST_RUNTIME, 'Set KAOGONG_TEST_RUNTIME to the built official DSH checkout')
const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import(pathToFileURL(join(
  resolve(process.env.KAOGONG_TEST_RUNTIME), 'packages/boot/app-boot/lib/index.js')).href)
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('the real Host compatibility gate accepts type-only optional workbench integration without an exemption', () => {
  assert.equal(getDshRuntimeVersion(), '0.2.0-rc.2')
  assert.equal(evaluatePluginCompatibility(manifest), undefined)
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-personal-workbench'], 'file:../personal-workbench')
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-host-webserver'], '0.2.0-rc.2')
})

test('the real gate still rejects a mismatched Host peer and the original false runtime peer', () => {
  for (const [name, range] of [['@deepseek-ai/dsh-host-webserver', '9.0.0'], ['@deepseek-ai/dsh-personal-workbench', '0.1.0']]) {
    const issue = evaluatePluginCompatibility({ ...manifest, peerDependencies: { ...manifest.peerDependencies, [name]: range } })
    assert.deepEqual(issue.peers, { [name]: range })
    assert.equal(issue.exempted, false)
  }
})
