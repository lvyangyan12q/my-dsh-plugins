/** Install the candidate archive through the built official CLI into a disposable keyless profile. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import { bankDomainSpec } from '../src/domain.ts'

const source = process.env.KAOGONG_TEST_RUNTIME
const workbenchArchive = process.env.KAOGONG_WORKBENCH_ARCHIVE
const store = process.env.KAOGONG_INSTALL_STORE
const cache = process.env.KAOGONG_INSTALL_CACHE
assert(source && workbenchArchive && store, 'Set KAOGONG_TEST_RUNTIME, KAOGONG_WORKBENCH_ARCHIVE and KAOGONG_INSTALL_STORE')
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = join(packageRoot, 'lib/runtime-' + Date.now())
const cli = resolve(source, 'apps/cli/lib/bin.js')
for (const name of ['workspace', 'temp', 'data', 'dsh-home']) await mkdir(join(root, name), { recursive: true })
await writeFile(join(root, 'empty.npmrc'), '')
await writeFile(join(root, 'network-guard.cjs'), `const net = require('node:net'); const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) { const first = Array.isArray(args[0]) ? args[0][0] : args[0]; const host = first && typeof first === 'object' ? first.host : typeof args[1] === 'string' ? args[1] : undefined; if (host !== undefined && !['127.0.0.1','::1','localhost'].includes(host)) throw Error('Offline check denied outbound socket'); return connect.apply(this,args); };
const denied = () => { throw Error('Offline check denied HTTP client'); }; for (const name of ['node:http','node:https']) { require(name).request = denied; require(name).get = denied; } globalThis.fetch = denied;
`)
const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ComSpec: process.env.ComSpec,
  DSH_HOME: join(root, 'dsh-home'), HOME: join(root, 'user'), USERPROFILE: join(root, 'user'), APPDATA: join(root, 'appdata'), LOCALAPPDATA: join(root, 'localappdata'),
  TEMP: join(root, 'temp'), TMP: join(root, 'temp'), XDG_CONFIG_HOME: join(root, 'config'), XDG_CACHE_HOME: join(root, 'cache'), XDG_STATE_HOME: join(root, 'state'), XDG_DATA_HOME: join(root, 'data'),
  COREPACK_ENABLE_NETWORK: '0', npm_config_userconfig: join(root, 'empty.npmrc'), npm_config_globalconfig: join(root, 'empty.npmrc'), npm_config_cache: join(root, 'npm-cache'), DSH_TELEMETRY_DISABLED: '1',
  NODE_OPTIONS: '--require=' + JSON.stringify(join(root, 'network-guard.cjs').replaceAll('\\', '/')) }
const run = async args => {
  const child = spawn(process.execPath, [cli, ...args], { cwd: join(root, 'workspace'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''; child.stdout.on('data', bytes => { output += bytes }); child.stderr.on('data', bytes => { output += bytes })
  const timer = setTimeout(() => child.kill(), 45000)
  const code = await new Promise((yes, no) => { child.once('error', no); child.once('close', yes) }); clearTimeout(timer)
  assert.equal(code, 0, output.replace(/token=[A-Za-z0-9_-]+/g, 'token=REDACTED').slice(-4000))
}
await run(['--profile', 'practice-proof', '--from-default-profile', 'web', '--dump-config'])
await run(['plugin', '--profile', 'practice-proof', 'add', resolve(workbenchArchive), join(packageRoot, 'lib/deepseek-ai-dsh-tool-kaogong-0.1.0.tgz'), '--offline', '--ignore-scripts', '--store-dir', resolve(store), ...(cache ? ['--cache-dir', resolve(cache)] : [])])
const policy = await readFile(join(root, 'dsh-home/profiles/practice-proof/pnpm-workspace.yaml'), 'utf8')
assert.match(policy, /autoInstallPeers: false/)

// Seed only synthetic questions through the official public DomainFacility before Host opens it.
const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context } = require('@deepseek-ai/cordis')
const load = path => import(pathToFileURL(resolve(source, path)).href)
const { default: Storage } = await load('packages/storage/storage/lib/index.js')
const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js')
const { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')
const ctx = new Context(); await ctx.plugin(Storage)
const backend = new JsonStorageBackend(join(root, 'data')); ctx.storage.backend.register('json', backend)
const facility = new DomainFacility(ctx, { backend: 'json' }); const bank = await facility.open(bankDomainSpec)
const subject = '行测-资料分析'
for (let n = 0; n < 12; n++) await bank.table('questions').put('runtime-' + n, { subject, knowledgePoint: '增长率', questionType: '单选', stem: `合成验收题 ${n}\n<table><tr><td>42</td></tr></table>\n![材料](题目_images/verified/资料600-2024-jiangsu-17.png)`, options: ['A. 10%', 'B. 20%'], correctAnswer: 'B', explanation: 'synthetic explanation', difficulty: 'easy', source: 'synthetic runtime fixture', origin: 'local', reviewStatus: 'approved', reviewNotes: '', tags: [], createdAt: '2026-01-01', reviewedAt: '' })
await bank.close(); await backend.close(); await ctx.fiber.dispose()
await writeFile(join(root, 'smoke.patch.yml'), `- id: storage-json\n  config:\n    root: ${JSON.stringify(join(root, 'data').replaceAll('\\', '/'))}\n- id: kaogong\n  config:\n    roleCwd: ${JSON.stringify(join(root, 'workspace').replaceAll('\\', '/'))}\n- id: agent-loop\n  config:\n    agents: []\n- id: session-telemetry-otel\n  disabled: true\n- id: desktop-product-telemetry\n  disabled: true\n- id: product-analytics\n  disabled: true\n`)
let expectedRound
let expectedCounselor
async function verifyHost(restart) {
  const listener = createServer()
  await new Promise((yes, no) => { listener.once('error', no); listener.listen(0, '127.0.0.1', yes) })
  const port = listener.address().port
  await new Promise(yes => listener.close(yes))
  const child = spawn(process.execPath, [cli, '--profile', 'practice-proof', '--patch', join(root, 'smoke.patch.yml'), '--no-open', '--host', '127.0.0.1', '--port', String(port)], { cwd: join(root, 'workspace'), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let launchUrl, output = ''
  const inspect = bytes => { output += bytes; launchUrl ??= output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0] }
  child.stdout.on('data', inspect); child.stderr.on('data', inspect)
  const completion = new Promise((yes, no) => { child.once('error', no); child.once('close', yes) })
  try {
    const deadline = Date.now() + 15000
    while (!launchUrl && child.exitCode === null && Date.now() < deadline) await new Promise(yes => setTimeout(yes, 100))
    assert(launchUrl, 'Disposable Host did not publish a launch URL')
    const origin = new URL(launchUrl).origin
    const index = await fetch(launchUrl, { redirect: 'manual' })
    const cookie = index.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const call = async (action, body, authenticated = true) => {
      const response = await fetch(origin + '/api/kaogong/practice/' + action, { method: 'POST', headers: { origin, ...(authenticated ? { cookie } : {}), 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
      return { status: response.status, value: await response.json() }
    }
    assert.equal((await call('history', {}, false)).status, 401)
    const foreign = await fetch(origin + '/api/kaogong/practice/history', { method: 'POST', headers: { origin: 'http://foreign.invalid', cookie, 'content-type': 'application/json' }, body: '{}' })
    assert.equal(foreign.status, 403)
    const rolesCall = async body => {
      const response = await fetch(origin + '/api/personal-workbench/roles', { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
      const value = await response.json(); assert.equal(response.status, 200, 'Installed counselor preparation failed'); return value
    }
    const counselorKey = { appId: 'kaogong', instanceId: 'default', roleId: 'counselor' }
    if (!restart) {
      const round = await call('start', { subject, title: '模块练习' })
      assert.equal(round.status, 200); assert.equal(round.value.returned, 10)
      assert.doesNotMatch(JSON.stringify(round.value), /correctAnswer|synthetic explanation/)
      const image = await fetch(origin + '/api/kaogong/material-image?asset=' + encodeURIComponent('verified/资料600-2024-jiangsu-17.png'), { headers: { cookie } })
      assert.equal(image.status, 200); assert.match(image.headers.get('content-type'), /image\/png/)
      const bytes = new Uint8Array(await image.arrayBuffer())
      assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
      assert(bytes.length > 10000)
      const answers = round.value.questions.map(row => ({ id: row.id, answer: 'A' }))
      const scored = await call('submit', { roundId: round.value.roundId, answers })
      assert.equal(scored.status, 200); assert.equal(scored.value.correctCount, 0); assert.equal(scored.value.projection, 'complete')
      assert.deepEqual((await call('submit', { roundId: round.value.roundId, answers })).value, scored.value)
      assert.equal((await call('submit', { roundId: round.value.roundId, answers: answers.map(row => ({ ...row, answer: 'B' })) })).status, 409)
      expectedRound = { roundId: round.value.roundId, answers, result: scored.value }
      const prepared = await rolesCall({ action: 'teach', key: counselorKey, evidence: {
        kind: 'review', context: round.value.context,
        material: { id: round.value.roundId, title: '模块练习', source: 'kaogong/default/committed-practice', content: JSON.stringify({ roundId: round.value.roundId, results: scored.value.results }) },
        result: { total: scored.value.totalCount, correct: scored.value.correctCount, accuracy: scored.value.accuracyRate,
          results: scored.value.results.map(({ id, knowledgePoint, correct, correctAnswer, explanation }) => ({ id, knowledgePoint, correct, correctAnswer, explanation })) },
      } })
      assert.equal(prepared.binding.phase, 'ready'); assert.equal(prepared.binding.presetId, 'kaogong.counselor.v1')
      assert.match(prepared.prompt, /runtime-/); assert.match(prepared.prompt, /userAnswer/)
      expectedCounselor = prepared.binding.sessionId
    } else {
      assert.deepEqual((await call('read', { roundId: expectedRound.roundId })).value.result, expectedRound.result)
      const next = await call('start', { subject, title: '模块练习', previousRoundId: expectedRound.roundId })
      assert.equal(next.value.returned, 10); assert.equal(next.value.cycled, true)
      const restored = await rolesCall({ action: 'read', key: counselorKey })
      assert.equal(restored.binding.sessionId, expectedCounselor)
      assert.equal(restored.binding.phase, 'ready')
    }
    console.log(JSON.stringify({ installedHost: true, normalPeerPolicy: true, keyless: true, restart, practice: 'passed' }))
  } finally { child.kill(); await completion }
}
await verifyHost(false)
await verifyHost(true)
console.log('Installed score and exact native counselor identity recovered after official Host restart; packaged PNG served. Native send/model and Chrome gates remain separate.')
