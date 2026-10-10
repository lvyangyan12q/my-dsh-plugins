import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire, registerHooks } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import vm from 'node:vm'

/** Materialize exact built factories with the official browser resolver; never use Node require as a fallback. */
export async function checkClientModuleArtifacts({ root, runtime, workbench = true, profileRoot }) {
  assert(runtime, 'Set DSH_SOURCE to the built official DSH checkout')
  const tools = createRequire(join(process.env.KAOGONG_TEST_TOOLS ?? runtime, 'package.json'))
  const { JSDOM } = tools('jsdom')
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost' })
  const globals = { window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement, fetch: () => { throw Error('Factory gate forbids network and model calls') } }
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })
  // Browser CSS module bindings are irrelevant to factory resolution; this gate does not render the UI.
  const css = registerHooks({ load(url, context, next) {
    if (new URL(url).pathname.endsWith('.css')) return { format: 'module', source: 'export default Object.freeze({})', shortCircuit: true }
    return next(url, context)
  } })
  try {
    const { ClientModuleSystem } = await import(pathToFileURL(join(runtime, 'packages/client/modules/src/client/system.ts')).href)
    const { parseBootManifest } = await import(pathToFileURL(join(runtime, 'packages/client/modules/src/client/manifest.ts')).href)
    const { getStaticModules } = await import(pathToFileURL(join(runtime, 'packages/client/web/src/seed.ts')).href)
    const products = workbench ? ['personal-workbench', 'kaogong', 'reading-statistics'] : ['kaogong']
    const profile = profileRoot ? createRequire(join(profileRoot, 'package.json')) : null
    const names = { 'personal-workbench': '@deepseek-ai/dsh-personal-workbench', kaogong: '@deepseek-ai/dsh-tool-kaogong', 'reading-statistics': '@deepseek-ai/dsh-reading-statistics' }
    const packageRoot = name => profile ? dirname(profile.resolve(names[name] + '/package.json')) : join(root, 'plugins', name)
    const packages = await Promise.all(products.map(async name => ({ name,
      manifest: JSON.parse(await readFile(join(packageRoot(name), 'package.json'), 'utf8')),
      bundle: await readFile(join(packageRoot(name), 'lib/client.js'), 'utf8') })))
    const ids = packages.map(p => p.manifest.name)
    const target = { mode: 'queue', pendingQueue: [], load(registration) { this.pendingQueue.push(registration) } }
    window.__ModuleLoader__ = target
    for (const pkg of packages) vm.runInThisContext(pkg.bundle, { filename: pkg.name + '/lib/client.js' })
    // This graph tests factory materialization, independently of Cordis entry activation and Host graph composition.
    const manifest = parseBootManifest({ rev: 'artifact-gate',
      entries: ids.map(id => ({ id, url: 'plugins/??' + id + '/client.js&rev=artifact-gate', rev: 'artifact-gate' })),
      batches: [{ phase: 'application', url: 'plugins/??' + ids.map(id => id + '/client.js').join(',') + '&rev=artifact-gate', rev: 'artifact-gate', entries: ids }] })
    const loader = new ClientModuleSystem({ manifest, staticModules: getStaticModules(), registrationTarget: target,
      bootstrapModule: { id: '@deepseek-ai/dsh-client-modules', exports: {} },
      loadBundle: async () => { throw Error('Factory gate must use only registered artifact bytes') } })
    const loaded = []
    for (const pkg of packages) {
      const value = await loader.import(pkg.manifest.name + '/client')
      assert.equal(typeof value.apply, 'function', pkg.name + ' public Client apply')
      assert.equal(loader.importError(pkg.manifest.name), undefined)
      if (pkg.name === 'kaogong') assert.equal(typeof value.KaogongViewState, 'function')
      loaded.push(pkg.manifest.name)
    }
    return { officialModuleResolver: true, officialPlatformSeed: true, nodeRequireFallback: false,
      installedArtifacts: !!profile, workbenchRegistered: workbench, materialized: loaded, entryActivationTested: false, cssRenderingTested: false, modelCalls: 0 }
  } finally {
    css.deregister()
    dom.window.close()
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const installed = process.argv[2] === '--installed-profile'
  if (installed) assert(process.argv[3], 'Installed profile directory required')
  const profileRoot = installed ? resolve(process.argv[3]) : undefined
  const root = process.argv[2] && !profileRoot ? resolve(process.argv[2]) : resolve(fileURLToPath(new URL('..', import.meta.url)))
  console.log(JSON.stringify(await checkClientModuleArtifacts({ root, profileRoot, runtime: process.env.DSH_SOURCE })))
  console.log(JSON.stringify(await checkClientModuleArtifacts({ root, profileRoot, runtime: process.env.DSH_SOURCE, workbench: false })))
}
