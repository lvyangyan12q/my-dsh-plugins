import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

assert(process.env.KAOGONG_TEST_RUNTIME, 'Set KAOGONG_TEST_RUNTIME to the built official DSH checkout')
const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import(pathToFileURL(join(
  resolve(process.env.KAOGONG_TEST_RUNTIME), 'packages/boot/app-boot/lib/index.js')).href)
const { selectedNativeVersion } = await import('../../../scripts/native-version-matrix.mjs')
const runtimeVersion = await selectedNativeVersion(resolve(process.env.KAOGONG_TEST_RUNTIME))
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

test('the real Host compatibility gate accepts optional workbench integration without an exemption', () => {
  assert.equal(getDshRuntimeVersion(), runtimeVersion)
  assert.equal(evaluatePluginCompatibility(manifest), undefined)
  assert.equal(manifest.dependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.devDependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.optionalDependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-host-webserver'], '0.2.1-rc.3')
})

test('the real rc.3 gate refuses unverified runtime versions without an exemption',()=>{
 const issue=evaluatePluginCompatibility({...manifest,engines:{...manifest.engines,dsh:'9.0.0'}})
 assert.deepEqual(issue.requirements,{'engines.dsh':'9.0.0'});assert.equal(issue.exempted,false)
 const {engines,...withoutEngine}=manifest
 const peerIssue=evaluatePluginCompatibility({...withoutEngine,peerDependencies:{'@deepseek-ai/dsh-host-webserver':'9.0.0'}})
 assert.deepEqual(peerIssue.requirements,{'@deepseek-ai/dsh-host-webserver':'9.0.0'})
})
