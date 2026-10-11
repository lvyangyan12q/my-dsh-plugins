import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { createServer } from 'node:net'
import { pathToFileURL } from 'node:url'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const [stage, rootArg, cli, npmCli, cachedRoot] = process.argv.slice(2)
assert(['setup', 'install', 'verify'].includes(stage))
assert([rootArg, cli, npmCli, cachedRoot].every(value => value && isAbsolute(value)))
const plugin = resolve(import.meta.dirname, '..'), worktree = resolve(plugin, '../..'), root = resolve(rootArg)
const rel = relative(resolve(worktree, '.scratch'), root)
assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Use an owned new worktree scratch directory')
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
  DSH_HOME: join(root, 'dsh-home'), USERPROFILE: join(root, 'user'), HOME: join(root, 'user'),
  APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'), TEMP: join(root, 'temp'), TMP: join(root, 'temp'),
  XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'), XDG_DATA_HOME: join(root, 'data'),
  PNPM_HOME: join(root, 'pnpm'), COREPACK_HOME: join(root, 'corepack'), COREPACK_ENABLE_NETWORK: '0',
  npm_config_cache: join(root, 'npm-cache'), npm_config_userconfig: join(root, 'empty.npmrc'), npm_config_globalconfig: join(root, 'empty-global.npmrc'),
  DSH_TELEMETRY_DISABLED: '1', NODE_OPTIONS: `--require=${JSON.stringify(join(plugin, 'tests/fixtures/offline-guard.cjs').replaceAll('\\', '/'))}` }
async function run(label, args, cwd = join(root, 'workspace')) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', value => { output = (output + value).slice(-8000) }); child.stderr.on('data', value => { output = (output + value).slice(-8000) })
  const timer = setTimeout(() => child.kill(), 45000)
  try {
    const status = await new Promise((yes, no) => { child.once('close', yes); child.once('error', no) })
    assert.equal(status, 0, `${label}: ${output.replace(/https?:\/\/\S+/g, '<URL omitted>')}`)
    console.log(`${label}: passed`)
  } finally { clearTimeout(timer) }
}
async function writePatch() {
  await cp(join(plugin, 'tests/fixtures/management-proof.mjs'), join(root, 'management-proof.mjs'))
  const fixture = pathToFileURL(join(root, 'management-proof.mjs')).href
  const patch = [{ id: 'session-telemetry-otel', disabled: true }, { id: 'desktop-product-telemetry', disabled: true }, { id: 'product-analytics', disabled: true },
    { id: 'agent-loop', config: { agents: [] } }, { insert: [{ id: 'ticket09-proof', name: fixture, config: { skillRoot: join(plugin, 'tests/fixtures/skills'),
      agentModule: pathToFileURL(resolve(cli, '../../../../packages/core/agent/lib/index.js')).href,
      llmModule: pathToFileURL(resolve(cli, '../../../../packages/llm/llm/lib/index.js')).href } }] }]
  await writeFile(join(root, 'proof.patch.yml'), JSON.stringify(patch))
}
if (stage === 'setup') {
  await mkdir(root)
  for (const name of ['workspace', 'user', 'appdata', 'localappdata', 'temp', 'config', 'cache', 'state', 'data', 'pnpm', 'corepack', 'npm-cache', 'archives']) await mkdir(join(root, name))
  await writeFile(join(root, 'empty.npmrc'), ''); await writeFile(join(root, 'empty-global.npmrc'), '')
  // Copy cache data only, never reuse or alter the parent's profile or Session state.
  const sourceStore = join(cachedRoot, 'store')
  await cp(sourceStore, join(root, 'store'), { recursive: true,
    filter: path => !relative(sourceStore, path).split(/[\\/]/).includes('projects') })
  await cp(join(cachedRoot, 'cache/v11/metadata'), join(root, 'cache/v11/metadata'), { recursive: true })
  await writePatch()
  await run('archive production workbench', [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', join(root, 'archives')], plugin)
} else if (stage === 'install') {
  if (!existsSync(join(root, 'dsh-home/profiles/ticket09/package.json'))) await run('initialize isolated official Web profile', [cli, '--profile', 'ticket09', '--from-default-profile', 'web', '--dump-config'])
  await run('official offline tarball installation', [cli, 'plugin', '--profile', 'ticket09', 'add', join(root, 'archives/deepseek-ai-dsh-personal-workbench-0.1.0.tgz'),
    '--ignore-scripts', '--offline', '--config.auto-install-peers=false', '--store-dir', join(root, 'store'), '--cache-dir', join(root, 'cache')])
  const profile = join(root, 'dsh-home/profiles/ticket09')
  assert.match(await readFile(join(profile, 'pnpm-workspace.yaml'), 'utf8'), /autoInstallPeers: false/)
  const manifest = JSON.parse(await readFile(join(profile, 'package.json'), 'utf8'))
  assert.match(manifest.dependencies['@deepseek-ai/dsh-personal-workbench'], /^file:.*\.tgz$/)
} else {
  await writePatch()
  const installedRequire = createRequire(join(root, 'dsh-home/profiles/ticket09/package.json'))
  const entry = installedRequire.resolve('@deepseek-ai/dsh-personal-workbench')
  assert(!relative(root, entry).startsWith('..'), 'Artifact must be installed inside owned home')
  const installedHost = await readFile(entry, 'utf8')
  assert.equal(installedHost, await readFile(join(plugin, 'lib/index.js'), 'utf8'), 'Installed Host bytes must match current candidate')
  const managementChunk = installedHost.match(/import\("\.\/(management-host-[^"]+\.mjs)"\)/)?.[1]
  assert(managementChunk)
  const artifactDir = resolve(entry, '..')
  assert.deepEqual(await readFile(join(artifactDir, 'client.js')), await readFile(join(plugin, 'lib/client.js')), 'Installed Client bytes must match current candidate')
  assert.equal(await readFile(join(artifactDir, managementChunk), 'utf8'), await readFile(join(plugin, 'lib', managementChunk), 'utf8'))
  const server = createServer(); await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes) })
  const port = server.address().port; await new Promise(yes => server.close(yes))
  const origin = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, [cli, '--profile', 'ticket09', '--patch', join(root, 'proof.patch.yml'), '--no-open', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: join(root, 'workspace'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let launchUrl, failed = false, exited = false, diagnostic = ''
  const observe = data => {
    const text = data.toString(), found = text.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)
    if (found) launchUrl = found[0]
    failed ||= /Offline check denied|failed to import|dsh: startup failed/.test(text)
    diagnostic += text.split(/\r?\n/).filter(line => /ticket09-proof|failed to import|did not activate|cannot get|Error:|unavailable/.test(line))
      .map(line => line.replace(/https?:\/\/\S+/g, '<URL omitted>')).join('\n')
  }
  child.stdout.on('data', observe); child.stderr.on('data', observe)
  const completion = new Promise((yes, no) => { child.once('error', no); child.once('close', () => { exited = true; yes() }) })
  try {
    const deadline = Date.now() + 20000
    while (!launchUrl && !exited && Date.now() < deadline) await new Promise(yes => setTimeout(yes, 100))
    assert(launchUrl && !failed, `Isolated Host activation failed: ${diagnostic.slice(-4000)}`)
    const response = await fetch(launchUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    assert(cookie)
    const call = async (body, pendingAllowed = false) => {
      const response = await fetch(`${origin}/api/personal-workbench/management`, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
      const value = await response.json()
      if (pendingAllowed && response.status === 503) return null
      assert.equal(response.status, 200, typeof value.error === 'string' ? value.error : 'Management request failed')
      return value
    }
    let catalog, role
    const readyBy = Date.now() + 10000
    do {
      catalog = await call({ action: 'catalog' }, true)
      role = catalog?.roles.find(row => row.key.appId === 'ticket09-proof')
      if (role) break
      await new Promise(yes => setTimeout(yes, 100))
    } while (!failed && Date.now() < readyBy)
    assert(role?.available, role?.error ?? 'Fixture role did not register')
    assert.equal(role.binding, null)
    assert.equal(role.skills.find(skill => skill.name === 'ticket09-proof').source, 'bundled')
    assert.equal(role.loaded.length, 0)
    const saved = await call({ action: 'assign', key: role.key, expectedRevision: role.assignment.revision, names: ['ticket09-proof'] })
    assert.deepEqual(saved.assignment.names, ['ticket09-proof'])
    assert.equal((await call({ action: 'catalog' })).roles.find(row => row.key.appId === 'ticket09-proof').assignment.revision, saved.assignment.revision)
    const probe = await fetch(`${origin}/api/ticket09-proof/pre-step`, { method: 'POST', headers: { origin, cookie }, signal: AbortSignal.timeout(15000) })
    const proposed = await probe.json()
    assert.equal(probe.status, 200, proposed.error ?? 'Installed native pre-step failed')
    assert.equal(proposed.presetId, 'ticket09.proof'); assert.equal(proposed.phase, 'ready')
    assert.deepEqual(proposed.nativeNames, ['ticket09-proof']); assert.equal(proposed.canonicalBody, true); assert.equal(proposed.durableSeqUnchanged, true)
    const after = (await call({ action: 'catalog' })).roles.find(row => row.key.appId === 'ticket09-proof')
    assert.equal(after.scope, 'live-agent'); assert.equal(after.binding.sessionId, proposed.sessionId)
    assert.equal(after.loaded.length, 0, 'Pre-step proposal cannot be presented as committed load history')
    console.log(JSON.stringify({ installedHost: 'passed', peerPolicy: 'autoInstallPeers:false', roleCatalog: 'scoped native provider', assignment: 'persisted',
      nativeAgentPreStep: 'actual native instruction body', durableTurnClaimed: false, modelCalls: 0 }))
  } catch (error) { console.error(error instanceof Error ? error.message : 'Installed management check failed'); process.exitCode = 1 }
  finally { launchUrl = undefined; if (!exited) child.kill(); await completion }
}
