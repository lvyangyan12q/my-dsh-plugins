import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createConnection, createServer } from 'node:net'
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Explicit disposable root and built tools; never inherit a provider or npm configuration.
const [stage, rootArg, cliArg, npmArg] = process.argv.slice(2)
assert(['setup', 'install', 'offline', 'verify'].includes(stage))
assert(rootArg && cliArg && npmArg && [rootArg, cliArg, npmArg].every(isAbsolute))
const root = resolve(rootArg)
const cli = resolve(cliArg)
const plugin = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scratch = resolve(plugin, '../../../../runtime-verification')
const inside = relative(scratch, root)
assert(inside && !inside.startsWith('..') && !isAbsolute(inside), 'Root must be a new runtime-verification child')
const profile = stage === 'install' ? 'packaged-online' : 'packaged-offline'
const env = {
  PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
  DSH_HOME: join(root, 'dsh-home'), USERPROFILE: join(root, 'user'), HOME: join(root, 'user'),
  APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'),
  TEMP: join(root, 'temp'), TMP: join(root, 'temp'), XDG_CONFIG_HOME: join(root, 'config'),
  XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'), XDG_DATA_HOME: join(root, 'data'),
  PNPM_HOME: join(root, 'pnpm'), COREPACK_HOME: join(root, 'corepack'), COREPACK_ENABLE_NETWORK: '0',
  npm_config_cache: join(root, 'npm-cache'), npm_config_userconfig: join(root, 'empty.npmrc'),
  npm_config_globalconfig: join(root, 'empty-global.npmrc'), DSH_TELEMETRY_DISABLED: '1',
}
const guard = join(root, 'network-guard.cjs')
const offlineEnv = { ...env, NODE_OPTIONS: `--require=${JSON.stringify(guard.replaceAll('\\', '/'))}` }
const clean = text => text.replace(/https?:\/\/\S+/g, '<URL omitted>')
async function terminate(child, tree = false) {
  if (tree && process.platform === 'win32') {
    await new Promise((yes, no) => {
      const killer = spawn(join(process.env.SystemRoot, 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'],
        { env, stdio: 'ignore', windowsHide: true })
      const timer = setTimeout(() => { killer.kill('SIGKILL'); yes() }, 3000)
      killer.once('error', no)
      killer.once('close', () => { clearTimeout(timer); yes() })
    })
  }
  child.kill('SIGKILL')
}
async function run(label, args, { timeout = 90000, guarded = false, cwd = join(root, 'workspace'), extraEnv = {} } = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...(guarded ? offlineEnv : env), ...extraEnv },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  let output = '', timedOut = false
  child.stdout.on('data', data => { output = (output + data).slice(-16000) })
  child.stderr.on('data', data => { output = (output + data).slice(-16000) })
  const timer = setTimeout(() => { timedOut = true; void terminate(child, true) }, timeout)
  let code
  try { code = await new Promise((yes, no) => { child.once('error', no); child.once('close', yes) }) }
  finally { clearTimeout(timer) }
  console.log(JSON.stringify({ label, code, timedOut,
    output: label === 'initialize disposable Web profile' && code === 0 ? '<synthetic config omitted>' : clean(output) }))
  assert.equal(timedOut, false, `${label} timed out`)
  assert.equal(code, 0, `${label} failed`)
  return output
}
if (stage === 'setup') {
  await mkdir(root) // Refuse to reuse a previous home.
  for (const name of ['user', 'appdata', 'localappdata', 'temp', 'config', 'cache', 'state', 'data', 'pnpm',
    'corepack', 'npm-cache', 'workspace', 'archives', 'store']) await mkdir(join(root, name))
  await writeFile(join(root, 'empty.npmrc'), '')
  await writeFile(join(root, 'empty-global.npmrc'), '')
  await writeFile(guard, `const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = first && typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : undefined;
  if (host !== undefined && !['127.0.0.1', '::1', 'localhost'].includes(host)) throw new Error('Offline check denied outbound socket');
  return connect.apply(this, args);
};
const denied = () => { throw new Error('Offline check denied HTTP client'); };
for (const name of ['node:http', 'node:https']) { require(name).request = denied; require(name).get = denied; }
globalThis.fetch = denied;
`)
  await writeFile(join(root, 'smoke.patch.yml'), '- id: personal-workbench\n  config:\n    teacherSessionId: synthetic-teacher-ticket02\n- id: session-telemetry-otel\n  disabled: true\n- id: desktop-product-telemetry\n  disabled: true\n- id: product-analytics\n  disabled: true\n- id: agent-loop\n  config:\n    agents: []\n')
  await run('npm pack', [npmArg, 'pack', '--ignore-scripts', '--json', '--pack-destination', join(root, 'archives')], { cwd: plugin, guarded: true })
} else if (stage === 'install' || stage === 'offline') {
  await run('initialize disposable Web profile', [cli, '--profile', profile, '--from-default-profile', 'web', '--dump-config'], { guarded: true })
  await run(`official tarball installer (${stage})`, [cli, 'plugin', '--profile', profile, 'add',
    join(root, 'archives/deepseek-ai-dsh-personal-workbench-0.1.0.tgz'), '--ignore-scripts',
    '--config.auto-install-peers=false', '--registry=https://registry.npmjs.org/',
    '--fetch-retries=0', '--fetch-timeout=20000', '--store-dir', join(root, 'store'), '--cache-dir', join(root, 'cache'),
    ...(stage === 'offline' ? ['--offline'] : [])], { guarded: stage === 'offline' })
} else {
  const profileDir = join(root, 'dsh-home/profiles', profile)
  const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
  const spec = manifest.dependencies['@deepseek-ai/dsh-personal-workbench']
  assert(spec.startsWith('file:') && spec.endsWith('.tgz'), 'Expected tarball dependency, not link')
  assert(manifest.dsh.profile.bundles.includes('@deepseek-ai/dsh-personal-workbench'), 'Installer did not register bundle')
  const require = createRequire(join(profileDir, 'package.json'))
  const artifact = await realpath(require.resolve('@deepseek-ai/dsh-personal-workbench'))
  const artifactRelative = relative(root, artifact)
  assert(!artifactRelative.startsWith('..') && !isAbsolute(artifactRelative), 'Artifact escaped disposable home')
  for (const file of ['index.js', 'client.js']) {
    assert.deepEqual(await readFile(join(dirname(artifact), file)), await readFile(join(plugin, 'lib', file)))
  }
  const dependency = createRequire(artifact).resolve('@deepseek-ai/schemastery/package.json')
  const dependencyRelative = relative(root, await realpath(dependency))
  assert(!dependencyRelative.startsWith('..') && !isAbsolute(dependencyRelative), 'Dependency escaped disposable home')
  assert.equal(JSON.parse(await readFile(dependency, 'utf8')).version, '3.18.4')
  console.log(JSON.stringify({ spec, artifact, dependency, hostSha256: createHash('sha256').update(await readFile(artifact)).digest('hex') }))
  await run('real installed Host import', ['--test', join(plugin, 'tests/host-import.test.mjs')],
    { guarded: true, timeout: 10000, extraEnv: { HOST_ARTIFACT_URL: pathToFileURL(artifact).href } })
  const server = createServer()
  await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes) })
  const port = server.address().port
  await new Promise(yes => server.close(yes))
  const connects = () => new Promise(yes => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const finish = value => { socket.destroy(); yes(value) }
    socket.setTimeout(200)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
  const child = spawn(process.execPath, [cli, '--profile', profile, '--patch', join(root, 'smoke.patch.yml'),
    '--no-open', '--host', '127.0.0.1', '--port', String(port)],
  { cwd: join(root, 'workspace'), env: offlineEnv, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  console.log(JSON.stringify({ label: 'owned Host started', pid: child.pid, port }))
  let exited = false, exitCode, inactive = false, importFailed = false, denied = false, listening = false
  // Never retain raw startup text or bootstrap URLs, even on failure.
  child.stderr.on('data', data => {
    const text = data.toString()
    inactive ||= /entr(?:y|ies) did not activate/.test(text)
    importFailed ||= text.includes('personal-workbench') && text.includes('failed to import')
    denied ||= text.includes('Offline check denied')
  })
  const completion = new Promise((yes, no) => {
    child.once('error', no)
    child.once('close', code => { exited = true; exitCode = code; yes() })
  })
  try {
    const deadline = Date.now() + 12000
    while (!exited && Date.now() < deadline) {
      if (await connects()) { listening = true; break }
      await new Promise(yes => setTimeout(yes, 100))
    }
    if (listening) await new Promise(yes => setTimeout(yes, 1500))
  } finally {
    if (!exited) await terminate(child)
    await completion
  }
  const portClosed = !(await connects())
  console.log(JSON.stringify({ label: 'bounded built Host', pid: child.pid, port, listening, inactiveEntryWarning: inactive,
    personalWorkbenchImportFailure: importFailed, deniedOfflineOperation: denied, childExited: exited, exitCode, portClosed }))
  assert(listening && !inactive && !importFailed && !denied && exited && portClosed, 'Host startup check failed')
}
