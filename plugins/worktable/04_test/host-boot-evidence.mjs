/**
 * Keyless boot evidence for one final archive, against an official checkout.
 *
 *   node 04_test/host-boot-evidence.mjs <tgz> [port]
 *
 * Requires DSH_HOST_ROOT (the official checkout). Uses a throwaway DSH_HOME, so the
 * operator's profile, sessions and credentials are never read or written. No model
 * prompt, no business data, no version exemption.
 *
 * Writes ../releases/v<package version>/host-boot-evidence.json and exits non-zero on
 * any failed assertion. "It started" alone is not evidence: the worktable must answer
 * an admitted caller on its protected route and refuse an anonymous one. Its health
 * route is public by design, so it is checked for identity only.
 */
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '..')
const pkg = JSON.parse(readFileSync(join(repo, '01_content', 'package.json'), 'utf8'))
const tgz = process.argv[2]
const port = Number(process.argv[3] ?? 3199)
const hostRoot = process.env.DSH_HOST_ROOT
const failures = []
const check = (ok, label) => { if (!ok) failures.push(label); console.log((ok ? '  ok   ' : '  FAIL ') + label) }

if (!tgz) throw new Error('usage: node 04_test/host-boot-evidence.mjs <tgz> [port]')
if (!hostRoot) throw new Error('Set DSH_HOST_ROOT to the official checkout that will run this archive')

const home = mkdtempSync(join(tmpdir(), 'wt-boot-evidence-'))
const base = join(hostRoot, 'apps', 'cli', 'src', 'bin.ts')
const cli = (args, options = {}) => spawnSync(process.execPath, ['--import', 'tsx/esm', base, ...args], {
  cwd: hostRoot, encoding: 'utf8', env: { ...process.env, DSH_HOME: home }, ...options,
})
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

let child
try {
  console.log('[boot-evidence] isolated DSH_HOME: ' + home)
  const added = cli(['plugin', '--profile', 'web', 'add', resolve(tgz)])
  check(added.status === 0, 'plugin add into the isolated profile (exit ' + String(added.status) + ')')
  if (added.status !== 0) console.error(String(added.stdout ?? '') + String(added.stderr ?? ''))

  const hostVersion = JSON.parse(readFileSync(join(hostRoot, 'package.json'), 'utf8')).version
  child = spawn(process.execPath, ['--import', 'tsx/esm', base, 'web', '--no-open', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: hostRoot, env: { ...process.env, DSH_HOME: home }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => { stdout += String(chunk) })
  child.stderr.on('data', (chunk) => { stderr += String(chunk) })

  const tokenUrlOf = (text) => (String(text).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/) ?? [])[0]
  const deadline = Date.now() + 180_000
  let tokenUrl
  while (Date.now() < deadline) {
    tokenUrl = tokenUrlOf(stdout) ?? tokenUrlOf(stderr)
    if (tokenUrl !== undefined) break
    if (child.exitCode !== null) break
    await sleep(500)
  }
  check(tokenUrl !== undefined, 'host printed an authenticated launch URL')
  if (tokenUrl === undefined) {
    console.error(stdout.slice(-4000))
    console.error(stderr.slice(-4000))
    throw new Error('host did not start in time')
  }

  const exchange = await fetch(tokenUrl, { redirect: 'manual' })
  const cookie = (exchange.headers.getSetCookie?.() ?? []).map((value) => value.split(';', 1)[0]).join('; ')
  check(exchange.status === 200 || exchange.status === 303, 'launch URL accepted (status ' + String(exchange.status) + ')')
  check(cookie !== '', 'browser cookie issued')

  const call = async (path, withCookie) => {
    const response = await fetch('http://127.0.0.1:' + String(port) + path, {
      headers: withCookie && cookie !== '' ? { cookie } : {},
    })
    const text = await response.text()
    let body
    try { body = JSON.parse(text) } catch { body = text.slice(0, 200) }
    return { status: response.status, body }
  }
  // The platform's own profile service is injected asynchronously; retry the protected
  // route briefly instead of treating a boot-time 503 as the plugin's answer.
  const callWhenReady = async (path) => {
    const until = Date.now() + 30_000
    let last = { status: 0, body: undefined }
    while (Date.now() < until) {
      last = await call(path, true)
      if (last.status !== 503) return last
      await sleep(500)
    }
    return last
  }

  const health = await call('/api/worktable/health', true)
  check(health.status === 200, 'authenticated health answered 200 (got ' + String(health.status) + ')')
  check(health.body?.ok === true, 'health reported ok')
  check(health.body?.version === pkg.version, 'health reported the packaged version ' + pkg.version)
  check(health.body?.plugin === 'dsh-worktable', 'health reported the plugin identity')
  check(health.body?.hostCapabilities?.connection === true, 'authenticated health reported host capabilities')

  const protectedCall = await callWhenReady('/api/worktable/applications')
  check(protectedCall.status === 200, 'authenticated protected route answered 200 (got ' + String(protectedCall.status) + ')')

  const anonymous = await call('/api/worktable/applications', false)
  check(anonymous.status === 401, 'unauthenticated protected route was refused (got ' + String(anonymous.status) + ')')

  check(!/disabling profile plugin[^\n]*dsh-worktable/.test(stderr), 'host did not disable the worktable bundle')
  check(!/skipp[^\n]*bundle[^\n]*dsh-worktable/i.test(stderr), 'host did not skip the worktable bundle')

  const evidence = {
    runtime: hostVersion,
    worktable: {
      plugin: 'dsh-worktable',
      version: pkg.version,
      ok: failures.length === 0,
    },
    bridge: '0.1.1',
    checks: {
      isolatedBoot: tokenUrl !== undefined,
      versionExemptions: false,
      authenticatedRuns: protectedCall.status === 200,
      unauthenticatedDenied: anonymous.status === 401,
    },
    healthRoute: 'public by design; reports identity only to anonymous callers',
    hostCapabilities: health.body?.hostCapabilities ?? {},
    limits: 'No model prompts, business fixes, SSH or production data used.',
  }
  const outDir = join(repo, 'releases', 'v' + pkg.version)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'host-boot-evidence.json'), JSON.stringify(evidence, null, 2) + '\n')
  console.log('[boot-evidence] wrote releases/v' + pkg.version + '/host-boot-evidence.json')
  if (failures.length !== 0) {
    console.error('[boot-evidence] FAIL: ' + failures.join('; '))
    process.exitCode = 1
  } else {
    console.log('[boot-evidence] PASS (' + tgz + ' on dsh ' + hostVersion + ')')
  }
} finally {
  if (child !== undefined && child.exitCode === null) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  }
  try { rmSync(home, { recursive: true, force: true }) } catch {}
}
