import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { managedAgentDefinition } from '../01_content/src/framework/capability-native.mjs'

const root = process.env.WORKTABLE_NATIVE_RC3_ROOT
const revision = '22ddee3792402c3e70ec5f86a63c3e3e895a2f60'
const version = '0.2.1-rc.3'
const names = ['@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-fs-search', '@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-persona']
const definition = () => managedAgentDefinition({ presetId: 'worktable.managed.reader', title: 'Reader', content: 'Read.', skillIds: [], baseComposition: 'workspace-basic-v1' })

// Opt-in owner-code conformance checks: never boot a profile or activate tools.
// An explicit rc.3 root is required; old rc.2 checks are separate evidence.
test('fixed official rc.3 public native contracts', { skip: !root }, async t => {
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

  await t.test('each managed layer satisfies its actual rc.3 exported Config schema', async t => {
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

  await t.test('official rc.3 manifest evaluator exposes current rejection facts without exemptions', async () => {
    const boot = createRequire(join(root, 'packages/boot/app-boot/package.json'))
    const { evaluatePluginCompatibility } = await import(pathToFileURL(boot.resolve('@deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts')).href)
    const manifests = await Promise.all([
      '../01_content/package.json', '../../project-notes/package.json', '../../reading-statistics/package.json',
    ].map(async file => JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'))))
    const [worktable, notes, reading] = manifests.map(manifest => evaluatePluginCompatibility(manifest, {}, version))
    assert.equal(worktable, undefined, 'Worktable wildcard DSH peers pass declaration gate only')
    assert.deepEqual(notes, {
      name: '@deepseek-ai/dsh-project-notes', version: '0.2.1', runtimeVersion: version,
      requirements: { '@deepseek-ai/dsh-storage-domain': '0.2.0-rc.2 || 0.2.1-alpha.2' }, exempted: false,
    })
    assert.deepEqual(reading, {
      name: '@deepseek-ai/dsh-reading-statistics', version: '0.2.2', runtimeVersion: version,
      requirements: {
        '@deepseek-ai/dsh-host-webserver': '0.2.0-rc.2 || 0.2.1-alpha.2',
        '@deepseek-ai/dsh-storage-domain': '0.2.0-rc.2 || 0.2.1-alpha.2',
      }, exempted: false,
    })
  })
})
