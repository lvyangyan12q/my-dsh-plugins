import assert from 'node:assert/strict'
import { selectedNativeVersion } from '../../../scripts/native-version-matrix.mjs'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const source = process.env.DSH_SOURCE; assert.ok(source)
const { evaluatePluginCompatibility, getDshRuntimeVersion } = await import(pathToFileURL(resolve(source, 'packages/boot/app-boot/lib/index.js')).href)
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
test('official plugin compatibility accepts independent Workbench package dependency while enforcing native peers', async () => {
  const runtime = getDshRuntimeVersion(); assert.equal(runtime, await selectedNativeVersion(process.env.DSH_SOURCE))
  assert.equal(manifest.peerDependencies['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.optionalDependencies?.['@deepseek-ai/dsh-personal-workbench'], undefined)
  assert.equal(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-personal-workbench'), false)
  assert.equal(evaluatePluginCompatibility(manifest, {}, runtime), undefined)
  const original = { ...manifest, engines: {}, peerDependencies: { ...manifest.peerDependencies, '@deepseek-ai/dsh-personal-workbench': '0.1.0' } }
  assert.equal(evaluatePluginCompatibility(original, {}, runtime).requirements['@deepseek-ai/dsh-personal-workbench'], '0.1.0')
  const incompatibleNative = { ...manifest, engines: {}, peerDependencies: { ...manifest.peerDependencies, '@deepseek-ai/dsh-host-webserver': '0.1.0' } }
  assert.equal(evaluatePluginCompatibility(incompatibleNative, {}, runtime).exempted, false)
})



test('packed reading artifact declares host-provided native services for the rc.3 target and refuses unverified hosts', async () => {
  const { mkdtemp, rm } = await import('node:fs/promises')
  const { tmpdir } = await import('node:os')
  const { dirname, join } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const { createRequire } = await import('node:module')
  const { spawnSync } = await import('node:child_process')
  const npmCli = process.env.READING_NPM_CLI ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  const npm = createRequire(npmCli), pick = npm('npm-pick-manifest'), tar = npm('tar')
  const folder = await mkdtemp(join(tmpdir(), 'reading-package-compat-'))
  try {
    const result = spawnSync(process.execPath, [npmCli, 'pack', '--json', '--pack-destination', folder], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    const [artifact] = JSON.parse(result.stdout)
    await tar.x({ file: join(folder, artifact.filename), cwd: folder, filter: path => path === 'package/package.json' })
    const packed = JSON.parse(await readFile(join(folder, 'package/package.json'), 'utf8'))
    const nativeDependencies = Object.entries({ ...packed.dependencies, ...packed.optionalDependencies, ...packed.peerDependencies }).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'))
    assert.ok(nativeDependencies.length > 0)
    for (const [name, wanted] of nativeDependencies) {
      const versions = Object.fromEntries(['0.2.1-rc.3'].map(version => [version, { name, version }]))
      const selected = pick({ name, versions, 'dist-tags': { latest: '0.2.1-rc.3' } }, wanted)
      assert.ok(selected.version==='0.2.1-rc.3');assert.equal(packed.dependencies?.[name],undefined);assert.equal(packed.optionalDependencies?.[name],undefined)
    }
    assert.equal(evaluatePluginCompatibility(packed, {}, '0.2.1-rc.3'), undefined)
    assert.equal(evaluatePluginCompatibility(packed, {}, '0.2.1-rc.4').exempted, false)
  } finally { await rm(folder, { recursive: true, force: true }) }
})
