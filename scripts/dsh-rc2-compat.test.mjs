/**
 * Keyless rc.2 admission and built-module checks for the three maintained integrations.
 * Run from the official checkout with its tsx loader and DSH_SOURCE set to that checkout.
 * Does not launch a profile, invoke a model, or write user data.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import { gateClientFactory } from '../plugins/worktable/01_content/client-factory-gate.mjs'

const source = process.env.DSH_SOURCE
assert.ok(source, 'Set DSH_SOURCE to the official 0.2.2-rc.2 checkout; run with --import tsx/esm')
const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import(pathToFileURL(join(resolve(source), 'packages/boot/app-boot/src/plugin-compatibility.ts')).href)
const version = getDshRuntimeVersion()
assert.equal(version, '0.2.2-rc.2', 'This regression targets the rc.2 runtime')
const plugins = [
  { directory: 'worktable/01_content', name: 'dsh-worktable', hostInject: ['webServer', 'sessions'], clientInject: ['slots', 'locale', 'sessions', 'conversation', 'workspaces'] },
  { directory: 'bug-solver/bridge', name: 'bug-solver-dispatch', hostInject: ['connection'] },
  { directory: 'paper-reader', name: 'dsh-paper-reader', hostInject: ['webServer'], clientInject: ['slots'] },
]

for (const plugin of plugins) {
  const root = new URL(`../plugins/${plugin.directory}/`, import.meta.url)
  const manifest = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'))
  test(`${plugin.name}: rc.2 admission needs no exemption and the 0.3 line stays excluded`, () => {
    assert.equal(manifest.name, plugin.name)
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined)
    for (const unsupported of ['0.3.0-alpha.1', '0.3.0', '1.0.0']) {
      assert.equal(evaluatePluginCompatibility(manifest, {}, unsupported)?.exempted, false, unsupported)
    }
    const frozen = { ...manifest, engines: { ...manifest.engines, dsh: '0.2.2-rc.1' } }
    assert.deepEqual(evaluatePluginCompatibility(frozen, {}, version)?.requirements, { 'engines.dsh': '0.2.2-rc.1' })
  })
  test(`${plugin.name}: built Host entry imports without activation`, async () => {
    const host = await import(new URL(manifest.main, root).href)
    assert.equal(host.name, manifest.name)
    assert.equal(typeof host.apply, 'function')
    assert.deepEqual(host.inject, plugin.hostInject)
  })
  if (plugin.clientInject) test(`${plugin.name}: built client factory registers its identity and injections`, () => {
    gateClientFactory(readFileSync(new URL('lib/client.js', root), 'utf8'), manifest.name, plugin.clientInject)
    const metadata = JSON.parse(readFileSync(new URL('dsh.plugin.json', root), 'utf8'))
    assert.equal(metadata.name, manifest.name)
    assert.equal(metadata.version, manifest.version)
  })
}
