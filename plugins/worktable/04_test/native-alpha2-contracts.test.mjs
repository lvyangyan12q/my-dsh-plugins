import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { managedAgentDefinition } from '../01_content/src/framework/capability-native.mjs'

const rc1Root = process.env.WORKTABLE_NATIVE_RC1_ROOT
const root = rc1Root ?? process.env.WORKTABLE_NATIVE_ALPHA2_ROOT
const revision = rc1Root ? 'fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159' : 'f3803c96974ad4a94195fb97e5c637e9c2a3afe3'
const version = rc1Root ? '0.2.2-rc.1' : '0.2.2-alpha.2'
const names = ['@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-fs-search', '@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-persona']
const definition = () => managedAgentDefinition({ presetId: 'worktable.managed.reader', title: 'Reader', content: 'Read.', skillIds: [], baseComposition: 'workspace-basic-v1' })

// Opt-in owner-code conformance checks: never boot a profile or activate tools.
// An explicit fixed official checkout is required.
test('fixed official ' + version + ' public native contracts', { skip: !root }, async t => {
  assert.equal(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), revision)
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.version, version)
  const official = createRequire(join(root, 'apps/cli/package.json'))
  const registry = createRequire(join(root, 'packages/preset/agent-preset-registry/package.json'))
  const load = name => import(pathToFileURL(official.resolve(name)).href)

  await t.test('managed definition passes actual exported parser and declared-composition reader', async () => {
    const { entryListProblem } = await import(pathToFileURL(registry.resolve('@deepseek-ai/dsh-agent-preset-registry')).href)
    const { definitionComposition } = await import(pathToFileURL(registry.resolve('@deepseek-ai/dsh-agent-preset-registry/src/composition-inventory.ts')).href)
    const row = definition()
    assert.equal(entryListProblem(row.plugins), undefined)
    const result = definitionComposition(row.plugins, () => { throw new Error('fixed declaration has no expressions') })
    assert.deepEqual(result.rows.map(item => [item.moduleName, item.enabled]), names.map(name => [name, true]))
    assert.notEqual(entryListProblem([{ config: {} }]), undefined, 'negative control: malformed plugin declarations are refused')
  })

  await t.test('each managed layer satisfies its actual exported Config schema', async t => {
    for (const row of definition().plugins) await t.test(row.name, async () => {
      const pkg = await readFile(official.resolve(row.name + '/package.json'), 'utf8')
      assert.equal(JSON.parse(pkg).version, version)
      const plugin = await load(row.name)
      assert.equal(typeof plugin.Config, 'function', 'public Config schema must exist')
      if (row.name === '@deepseek-ai/dsh-tool-fs-search') {
        assert.throws(() => new plugin.Config({}), /sampleOverCapGlobResults/, 'negative control: missing deployment choice must fail')
      }
      let parsed
      assert.doesNotThrow(() => { parsed = new plugin.Config(row.config ?? {}) })
      if (row.name === '@deepseek-ai/dsh-tool-fs-search') assert.equal(parsed.sampleOverCapGlobResults, false)
    })
  })

  await t.test('the bridge manifest keeps its verified runtimes; worktable targets 0.2.2-rc.1 and later', async () => {
    const boot = createRequire(join(root, 'packages/boot/app-boot/package.json'))
    const { evaluatePluginCompatibility } = await import(pathToFileURL(boot.resolve('@deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts')).href)
    const worktable = JSON.parse(await readFile(new URL('../01_content/package.json', import.meta.url), 'utf8'))
    // The archive rebuilt for 0.2.2-rc.1 no longer admits alpha.2; the frozen archive serves it.
    const frozen = evaluatePluginCompatibility(worktable, {}, version)
    assert.deepEqual(frozen?.requirements, { 'engines.dsh': worktable.engines.dsh })
    assert.equal(frozen?.exempted, false)
    const manifest = JSON.parse(await readFile(new URL('../../bug-solver/bridge/package.json', import.meta.url), 'utf8'))
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, manifest.name)
    assert.equal(evaluatePluginCompatibility(manifest, {}, '0.2.1-rc.3'), undefined, manifest.name)
    for (const candidate of ['0.2.2-alpha.3', '0.2.2', '0.2.1-rc.4']) {
      assert.equal(evaluatePluginCompatibility(manifest, {}, candidate).exempted, false)
    }
  })
})