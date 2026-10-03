import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const source = process.env.DSH_SOURCE; assert.ok(source)
const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import(pathToFileURL(resolve(source, 'packages/boot/app-boot/lib/index.js')).href)
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
test('official plugin compatibility accepts independent Workbench package dependency while enforcing native peers', () => {
  const runtime = getDshRuntimeVersion(); assert.equal(runtime, '0.2.0-rc.2')
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.optionalDependencies['@deepseek-ai/dsh-personal-workbench'], '0.1.0')
  assert.ok(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-personal-workbench'))
  assert.equal(evaluatePluginCompatibility(manifest, {}, runtime), undefined)
  const original = { ...manifest, peerDependencies: { ...manifest.peerDependencies, '@deepseek-ai/dsh-personal-workbench': '0.1.0' } }
  assert.equal(evaluatePluginCompatibility(original, {}, runtime).peers['@deepseek-ai/dsh-personal-workbench'], '0.1.0')
  const incompatibleNative = { ...manifest, peerDependencies: { ...manifest.peerDependencies, '@deepseek-ai/dsh-host-webserver': '0.1.0' } }
  assert.equal(evaluatePluginCompatibility(incompatibleNative, {}, runtime).exempted, false)
})
