import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir, writeFile, lstat, realpath } from 'node:fs/promises'
import { dirname, resolve, relative, isAbsolute, join } from 'node:path'
import { spawn } from 'node:child_process'

export function npmCli() {
  const path = process.env.RELEASE_NPM_CLI ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  assert(isAbsolute(path) && existsSync(path), 'Set RELEASE_NPM_CLI to the installed npm CLI script')
  return path
}

export async function ownedRoot(worktree, path) {
  const base = resolve(worktree, '.scratch'), root = resolve(path)
  const rel = relative(base, root)
  assert(rel && !rel.startsWith('..') && !isAbsolute(rel), 'Expected a strict child of this worktree .scratch')
  await mkdir(base, { recursive: true })
  assert(!(await lstat(base)).isSymbolicLink(), 'Scratch must not be a junction')
  assert.equal(await realpath(base), base)
  const parent = await realpath(dirname(root))
  const parentRelative = relative(base, parent)
  assert(!parentRelative.startsWith('..') && !isAbsolute(parentRelative), 'Root parent must stay inside owned scratch')
  await mkdir(root) // Existing roots are never implicitly purged or reused.
  return root
}

export async function isolatedEnv(root) {
  for (const name of ['workspace', 'user', 'temp', 'data', 'cache', 'store', 'archives', 'appdata', 'localappdata', 'config', 'state', 'pnpm', 'corepack', 'npm-cache']) await mkdir(join(root, name))
  await writeFile(join(root, 'empty.npmrc'), '')
  await writeFile(join(root, 'empty-global.npmrc'), '')
  await writeFile(join(root, 'offline.cjs'), `const net = require('node:net'); const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { const first = Array.isArray(args[0]) ? args[0][0] : args[0]; const host = first && typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : undefined; if (host !== undefined && !['127.0.0.1','::1','localhost'].includes(host)) throw Error('Offline check denied outbound socket'); return connect.apply(this,args); };
const denied = () => { throw Error('Offline check denied HTTP client'); }; for (const name of ['node:http','node:https']) { require(name).request = denied; require(name).get = denied; } globalThis.fetch = denied;
`)
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
    DSH_HOME: join(root, 'dsh-home'), USERPROFILE: join(root, 'user'), HOME: join(root, 'user'), APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'),
    TEMP: join(root, 'temp'), TMP: join(root, 'temp'), XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'), XDG_DATA_HOME: join(root, 'data'),
    PNPM_HOME: join(root, 'pnpm'), COREPACK_HOME: join(root, 'corepack'), COREPACK_ENABLE_NETWORK: '0', npm_config_cache: join(root, 'npm-cache'), npm_config_userconfig: join(root, 'empty.npmrc'), npm_config_globalconfig: join(root, 'empty-global.npmrc'),
    npm_config_offline: 'true', npm_config_ignore_scripts: 'true',
    DSH_TELEMETRY_DISABLED: '1', NODE_OPTIONS: '--require=' + JSON.stringify(join(root, 'offline.cjs').replaceAll('\\', '/')) }
  return env
}

export async function runNode(args, { cwd, env, timeout = 60000 } = {}) {
  const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  let output = '', timedOut = false
  child.stdout.on('data', bytes => { output = (output + bytes).slice(-32000) }); child.stderr.on('data', bytes => { output = (output + bytes).slice(-32000) })
  let stopping
  const timer = setTimeout(() => {
    timedOut = true
    if (process.platform === 'win32') {
      stopping = new Promise((yes, no) => {
        const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' })
        kill.once('error', no); kill.once('close', code => code === 0 ? yes() : no(Error('Owned child tree termination failed')))
      })
      void stopping.catch(() => { child.kill() })
    } else {
      try { process.kill(-child.pid, 'SIGKILL') } catch (error) { if (error.code !== 'ESRCH') throw error }
    }
  }, timeout)
  try {
    const code = await new Promise((yes, no) => { child.once('error', no); child.once('close', yes) })
    await stopping
    assert(!timedOut && code === 0, `Child failed (code=${code}, timedOut=${timedOut}): ${output.replace(/https?:\/\/\S+/g, '<URL omitted>').replace(/token=[A-Za-z0-9_-]+/g, 'token=REDACTED')}`)
    return output
  } finally { clearTimeout(timer) }
}
