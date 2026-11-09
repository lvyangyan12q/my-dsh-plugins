import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { managedAgentDefinition } from '../01_content/src/framework/capability-native.mjs'

const root = process.env.WORKTABLE_DSH_ROOT ?? process.env.DSH_SOURCE
const names = ['@deepseek-ai/dsh-tool-fs', '@deepseek-ai/dsh-tool-fs-search', '@deepseek-ai/dsh-tool-ask-user', '@deepseek-ai/dsh-tool-skill', '@deepseek-ai/dsh-persona']
const definition = () => managedAgentDefinition({ presetId: 'worktable.managed.reader', title: 'Reader', content: 'Read.', skillIds: [], baseComposition: 'workspace-basic-v1' })

// Unpinned forward guard: this file never asserts a commit identity, so the same checks run
// against any official checkout. Red here means the new host needs a plugin change before the
// archive's engines.dsh range may keep admitting it. It does not prove feature compatibility.
test('forward surface: public contracts the release gate depends on', { skip: !root }, async t => {
  const hostPkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const version = hostPkg.version
  assert.match(version, /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/, 'checkout version must be a semantic version')
  const official = createRequire(join(root, 'apps/cli/package.json'))
  const registry = createRequire(join(root, 'packages/preset/agent-preset-registry/package.json'))
  const boot = createRequire(join(root, 'packages/boot/app-boot/package.json'))
  const load = name => import(pathToFileURL(official.resolve(name)).href)

  await t.test('the runtime version the gate reads equals the checkout version', async () => {
    const { getDshRuntimeVersion } = await import(pathToFileURL(boot.resolve('@deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts')).href)
    assert.equal(getDshRuntimeVersion(), version)
  })

  await t.test('worktable admits this runtime and refuses the frozen earlier lines', async () => {
    const { evaluatePluginCompatibility } = await import(pathToFileURL(boot.resolve('@deepseek-ai/dsh-app-boot/src/plugin-compatibility.ts')).href)
    const manifest = JSON.parse(await readFile(new URL('../01_content/package.json', import.meta.url), 'utf8'))
    assert.equal(evaluatePluginCompatibility(manifest, {}, version), undefined, 'the declared range must admit the runtime it is packaged against')
    for (const older of ['0.2.1-rc.3', '0.2.2-alpha.2']) {
      const refused = evaluatePluginCompatibility(manifest, {}, older)
      assert.deepEqual(refused?.requirements, { 'engines.dsh': manifest.engines.dsh }, older)
      assert.equal(refused?.exempted, false, older)
    }
  })

  await t.test('managed definition passes the actual exported parser and composition reader', async () => {
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
      const pkg = JSON.parse(await readFile(official.resolve(row.name + '/package.json'), 'utf8'))
      const plugin = await load(row.name)
      assert.equal(typeof plugin.Config, 'function', 'public Config schema must exist in ' + pkg.name)
      if (row.name === '@deepseek-ai/dsh-tool-fs-search') {
        assert.throws(() => new plugin.Config({}), /sampleOverCapGlobResults/, 'negative control: missing deployment choice must fail')
      }
      assert.doesNotThrow(() => { new plugin.Config(row.config ?? {}) })
    })
  })
})
