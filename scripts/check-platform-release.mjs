import assert from 'node:assert/strict'
import { readFile, writeFile, realpath } from 'node:fs/promises'
import { resolve, join, dirname, relative, isAbsolute } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { ownedRoot, isolatedEnv, runNode } from './release-tools.mjs'
import { packRelease } from './release-archive.mjs'
import { checkInstalledTypes } from './check-installed-types.mjs'
const worktree = resolve(dirname(fileURLToPath(import.meta.url)), '..'), source = process.env.DSH_SOURCE
assert(source, 'DSH_SOURCE must name the built official rc.2 checkout')
const root = await ownedRoot(worktree, process.env.RELEASE_ROOT ?? join(worktree, '.scratch', 'platform-release-' + Date.now()))
const env = await isolatedEnv(root), cwd = join(root, 'workspace'), profile = 'platform-proof', home = join(root, 'dsh-home/profiles', profile)
const cli = resolve(source, 'apps/cli/lib/bin.js'), run = args => runNode([cli, ...args], { cwd, env })
const products = ['personal-workbench', 'kaogong', 'reading-statistics'], packages = []
for (const name of products) packages.push(await packRelease(join(worktree, 'plugins', name), join(root, 'archives'), env))
await run(['--profile', profile, '--from-default-profile', 'web', '--dump-config'])
// Public dependency anchors are existing built packages; product packages always come from archives.
// This avoids copying user profiles or downloading a second runtime. Compatibility is not exempted.
const require = createRequire(join(worktree, 'package.json')), overrides = {}
for (const name of products) {
  const manifest = JSON.parse(await readFile(join(worktree, 'plugins', name, 'package.json'), 'utf8'))
  for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
    if (dep === '@deepseek-ai/dsh-personal-workbench') continue
    let anchor = dirname(require.resolve(dep)); while (JSON.parse(await readFile(join(anchor, 'package.json'), 'utf8').catch(() => '{}')).name !== dep) anchor = dirname(anchor)
    overrides[dep] = 'link:' + anchor.replaceAll('\\', '/')
  }
}
const workspace = join(home, 'pnpm-workspace.yaml')
assert.match(await readFile(workspace, 'utf8'), /autoInstallPeers: false/)
await writeFile(workspace, (await readFile(workspace, 'utf8')) + '\noverrides: ' + JSON.stringify(overrides) + '\n')
const args = ['--offline', '--ignore-scripts', '--store-dir', join(root, 'store'), '--cache-dir', join(root, 'cache')]
await run(['plugin', '--profile', profile, 'add', ...packages.map(row => row.archive), ...args])
const installed = createRequire(join(home, 'package.json'))
const { evaluatePluginCompatibility, getDshRuntimeVersion, readProfileCompatibility } = await import(pathToFileURL(resolve(source, 'packages/boot/app-boot/lib/index.js')).href)
assert.equal(getDshRuntimeVersion(), '0.2.0-rc.2')
assert.equal(Object.keys(readProfileCompatibility(home).exemptions).length, 0)
for (const [index, name] of ['dsh-personal-workbench', 'dsh-tool-kaogong', 'dsh-reading-statistics'].entries()) {
  const packageRoot = dirname(installed.resolve('@deepseek-ai/' + name + '/package.json'))
  const rel = relative(root, await realpath(packageRoot)); assert(rel && !rel.startsWith('..') && !isAbsolute(rel))
  const manifest = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
  assert.equal(evaluatePluginCompatibility(manifest, {}, getDshRuntimeVersion()), undefined)
  for (const file of packages[index].files) assert.deepEqual(await readFile(join(packageRoot, file)), await readFile(join(worktree, 'plugins', products[index], file)), name + ': installed ' + file)
  const host = await import(pathToFileURL(installed.resolve('@deepseek-ai/' + name)).href); assert.equal(typeof host.apply, 'function')
}
await checkInstalledTypes(home, source, root, env)
// The reading package publishes JS exports; exercise its installed Client export through the native factory format.
const { runInNewContext } = await import('node:vm')
let client
runInNewContext(await readFile(installed.resolve('@deepseek-ai/dsh-reading-statistics/client'), 'utf8'), { window: { __ModuleLoader__: { load: ({ factory }) => { client = factory(name => name === '@deepseek-ai/dsh-personal-workbench/client' ? {} : require(name)) } } } })
assert.equal(typeof client.apply, 'function'); assert.equal(client.readingRecipe().appId, 'reading-statistics')
const patch = join(home, 'cordis.patch.yml')
const { parse } = createRequire(join(source, 'packages/boot/config-editor/package.json'))('yaml')
const previous = parse(await readFile(patch, 'utf8'))
await writeFile(patch, JSON.stringify([...previous, { id: 'storage-json', config: { root: join(root, 'data') } }, { id: 'kaogong', config: { roleCwd: cwd } }, { id: 'agent-loop', config: { agents: [] } }, ...['session-telemetry-otel','desktop-product-telemetry','product-analytics'].map(id => ({ id, disabled: true }))]))
let state
async function host(label, visit) {
  const socket = createServer(); await new Promise(yes => socket.listen(0, '127.0.0.1', yes)); const port = socket.address().port; await new Promise(yes => socket.close(yes))
  const child = spawn(process.execPath, [cli, '--profile', profile, '--no-open', '--host', '127.0.0.1', '--port', String(port)], { cwd, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] })
  let url, exited = false, failure = false
  const inspect = bytes => { const text = bytes.toString(); url ??= text.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]; failure ||= /Offline check denied|dsh: startup failed|failed to import/.test(text) }
  child.stdout.on('data', inspect); child.stderr.on('data', inspect)
  const done = new Promise((yes,no) => { child.once('error', no); child.once('close', () => { exited = true; yes() }) })
  try {
    const deadline = Date.now() + 25000; while (!url && !exited && Date.now() < deadline) await new Promise(yes => setTimeout(yes,100))
    assert(url && !failure, 'Owned installed Host did not start')
    const origin = `http://127.0.0.1:${port}`, auth = await fetch(url, { redirect: 'manual' }), cookie = auth.headers.getSetCookie().map(row => row.split(';')[0]).join('; '); assert(cookie)
    const call = async (path, body, expected = 200, headers = {}) => {
      const response = await fetch(origin + path, { method: 'POST', headers: { origin, cookie, 'content-type':'application/json', ...headers }, body:JSON.stringify(body), signal:AbortSignal.timeout(10000) })
      assert.equal(response.status, expected, `${label}: ${path}`); return response.json()
    }
    await visit(call); assert(!failure); console.log(label + ': passed')
  } finally { url = undefined; if (!exited) child.kill(); await done }
}
const data = (call, body, ...rest) => call('/api/reading-statistics/data', body, ...rest), recipe = (call, body, ...rest) => call('/api/personal-workbench/recipes', body, ...rest), apps = (call, body, ...rest) => call('/api/personal-workbench/apps', body, ...rest)
await host('three installed archives / authenticated draft and reading lifecycle', async call => {
  for (const path of ['/api/reading-statistics/data','/api/personal-workbench/recipes','/api/personal-workbench/apps']) { await call(path, {action:'catalog'},401,{cookie:''}); await call(path,{action:'catalog'},403,{origin:'http://foreign.invalid'}) }
  assert.equal((await data(call,{action:'read',instanceId:'default'})).instance.initialized,false)
  state = (await data(call,{action:'initialize',instanceId:'default',seed:'examples'})).instance
  assert.equal(state.records.length,3); assert.equal(state.records.reduce((sum,row)=>sum+row.minutes,0),210)
  assert.equal((await data(call,{action:'initialize',instanceId:'other',seed:'empty'})).instance.records.length,0)
  await data(call,{action:'initialize',instanceId:'preview.test',preview:true},409)
  assert.equal((await data(call,{action:'read',instanceId:'preview.test'})).instance.initialized,false)
  const app = client.readingRecipe()
  assert.equal((await recipe(call,{action:'save',recipe:app,expectedRevision:0})).record.running,undefined)
  await recipe(call,{action:'preview',appId:app.appId,expectedRevision:1})
  assert.equal((await recipe(call,{action:'catalog'})).recipes[0].running,undefined)
  assert.equal((await recipe(call,{action:'activate',appId:app.appId,expectedRevision:1})).record.running.version,1)
  const invalid = {...app,version:2,pages:[{...app.pages[0],modules:[{id:'bad',type:'unregistered',title:'Bad',config:{}}]}]}
  await recipe(call,{action:'save',recipe:invalid,expectedRevision:2}); await recipe(call,{action:'preview',appId:app.appId,expectedRevision:3},409); await recipe(call,{action:'activate',appId:app.appId,expectedRevision:3},409)
  assert.equal((await recipe(call,{action:'catalog'})).recipes[0].running.version,1)
  await apps(call,{action:'set-enabled',appId:app.appId,enabled:false,expectedRevision:0})
})
await host('cold restart / exact isolated reading data and running version recovery', async call => {
  assert.deepEqual((await data(call,{action:'read',instanceId:'default'})).instance,state)
  assert.equal((await data(call,{action:'read',instanceId:'other'})).instance.records.length,0)
  const rows = (await recipe(call,{action:'catalog'})).recipes; assert.equal(rows[0].revision,3); assert.equal(rows[0].draft.version,2); assert.equal(rows[0].running.version,1)
  assert.equal((await apps(call,{action:'catalog'})).states.find(row=>row.appId==='reading-statistics').enabled,false)
  await apps(call,{action:'set-enabled',appId:'reading-statistics',enabled:true,expectedRevision:1})
  assert.deepEqual((await data(call,{action:'read',instanceId:'default'})).instance,state)
})
await run(['plugin', '--profile', profile, 'remove', '@deepseek-ai/dsh-reading-statistics', '--config.offline=true', '--config.ignore-scripts=true', ...args.slice(2)])
await run(['plugin', '--profile', profile, 'add', packages[2].archive, ...args])
await host('official reading uninstall/reinstall / retained own data and re-enabled state', async call => {
  assert.deepEqual((await data(call,{action:'read',instanceId:'default'})).instance,state)
  assert.equal((await data(call,{action:'read',instanceId:'other'})).instance.records.length,0)
  assert.equal((await recipe(call,{action:'catalog'})).recipes[0].running.version,1)
  assert.equal((await apps(call,{action:'catalog'})).states.find(row=>row.appId==='reading-statistics').enabled,true)
})
await writeFile(join(root,'verdict.json'),JSON.stringify({ officialOfflineArchiveInstall:true, dependencyMode:'existing public dependency links; products installed from exact archives', compatibilityExemptions:0, installedBytes:true, installedConsumers:true, authenticatedLifecycle:true, coldRestart:true, readingUninstallReinstall:true, fixture:'public synthetic reading records', modelCalls:0, archives:packages.map(({sha256})=>sha256) },null,2))
console.log('Platform release checks passed (synthetic profile; zero model calls).')
