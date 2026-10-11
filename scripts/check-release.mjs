import assert from 'node:assert/strict'
import { readFile, writeFile, cp, realpath, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { createRequire } from 'node:module'
import { createHash, randomUUID } from 'node:crypto'
import { resolve, join, dirname, relative, isAbsolute, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ownedRoot, isolatedEnv, runNode } from './release-tools.mjs'
import { packRelease } from './release-archive.mjs'
import { checkInstalledTypes } from './check-installed-types.mjs'
import { seedLegacy, assertLegacy, subject, point } from '../tests/release-fixtures.mjs'

const worktree = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = process.env.DSH_SOURCE, cached = process.env.RELEASE_CACHE_ROOT
const oldWorkbench = process.env.RELEASE_BASE_WORKBENCH_ARCHIVE, oldKaogong = process.env.RELEASE_BASE_KAOGONG_ARCHIVE
assert(source && cached && oldWorkbench && oldKaogong, 'Set DSH_SOURCE, RELEASE_CACHE_ROOT and both RELEASE_BASE_*_ARCHIVE inputs')
const root = await ownedRoot(worktree, process.env.RELEASE_ROOT ?? join(worktree, '.scratch', 'release-' + Date.now()))
const env = await isolatedEnv(root), cli = resolve(source, 'apps/cli/lib/bin.js')
const cwd = join(root, 'workspace'), profile = 'release-proof', home = join(root, 'dsh-home/profiles', profile)
await cp(join(cached, 'store'), join(root, 'store'), { recursive: true, filter: path => !relative(join(cached, 'store'), path).split(/[\\/]/).includes('projects') })
await cp(join(cached, 'cache/v11/metadata'), join(root, 'cache/v11/metadata'), { recursive: true })
const packages = []
for (const name of ['personal-workbench', 'kaogong']) packages.push(await packRelease(join(worktree, 'plugins', name), join(root, 'archives'), env))
await writeFile(join(root, 'archives/manifest.json'), JSON.stringify(packages.map(({ archive, sha256, files }) => ({ archive: basename(archive), sha256, files })), null, 2))
const run = args => runNode([cli, ...args], { cwd, env })
const packageArgs = ['--offline', '--ignore-scripts', '--store-dir', join(root, 'store'), '--cache-dir', join(root, 'cache')]
const removeArgs = ['--config.offline=true', '--config.ignore-scripts=true', ...packageArgs.slice(2)]
await run(['--profile', profile, '--from-default-profile', 'web', '--dump-config'])
const install = archives => run(['plugin', '--profile', profile, 'add', ...archives, ...packageArgs])
await install([resolve(oldWorkbench), resolve(oldKaogong)])
assert.match(await readFile(join(home, 'pnpm-workspace.yaml'), 'utf8'), /autoInstallPeers: false/)
const assets = await seedLegacy(source, root)
const teacherKey = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject }
const counselorKey = { appId: 'kaogong', instanceId: 'default', roleId: 'counselor' }
const basePatch = [{ id: 'storage-json', config: { root: join(root, 'data') } }, { id: 'kaogong', config: { roleCwd: cwd, questionImageRoot: assets.assets, mineru: { outputDir: assets.results } } },
  { id: 'agent-loop', config: { agents: [] } }, ...['session-telemetry-otel', 'desktop-product-telemetry', 'product-analytics'].map(id => ({ id, disabled: true }))]
// Native settings owns the profile patch; command-line overlays deliberately refuse edits.
const patchFile = join(home, 'cordis.patch.yml')
const { parse: parseYaml } = createRequire(join(source, 'packages/boot/config-editor/package.json'))('yaml')
const writePatch = async (extra = [], kaogongConfig = basePatch[1].config) => {
  const previous = parseYaml(await readFile(patchFile, 'utf8'))
  assert(Array.isArray(previous))
  const managedIds = new Set([...basePatch.map(row => row.id), 'ticket11-native'])
  const retained = previous.flatMap(row => {
    if (managedIds.has(row.id)) return []
    if (!Array.isArray(row.insert)) return [row]
    const insert = row.insert.filter(entry => entry.id !== 'ticket11-native')
    return insert.length ? [{ ...row, insert }] : []
  })
  await writeFile(patchFile, JSON.stringify([...retained, ...basePatch.map(row => row.id === 'kaogong' ? { ...row, config: kaogongConfig } : row), ...extra]))
}
await writePatch()
let round, score, savedRound, counselorId, teacherId, assignment, completedLesson, unfinishedLesson

async function host(label, visit) {
  const server = createServer(); await new Promise((yes, no) => { server.once('error', no); server.listen(0, '127.0.0.1', yes) })
  const port = server.address().port; await new Promise(yes => server.close(yes))
  const child = spawn(process.execPath, [cli, '--profile', profile, '--no-open', '--host', '127.0.0.1', '--port', String(port)], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let launchUrl, failed = false, exited = false
  const inspect = bytes => { const text = bytes.toString(); launchUrl ??= text.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)?.[0]; failed ||= /Offline check denied|dsh: startup failed|failed to import/.test(text) }
  child.stdout.on('data', inspect); child.stderr.on('data', inspect)
  const completion = new Promise((yes, no) => { child.once('error', no); child.once('close', () => { exited = true; yes() }) })
  try {
    const deadline = Date.now() + 20000
    while (!launchUrl && !exited && Date.now() < deadline) await new Promise(yes => setTimeout(yes, 100))
    assert(launchUrl && !failed, 'Owned installed Host failed to start')
    const origin = `http://127.0.0.1:${port}`
    const response = await fetch(launchUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) })
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    assert(cookie)
    const call = async (path, body, expected = 200, headers = {}) => {
      const response = await fetch(origin + path, { method: 'POST', headers: { origin, cookie, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) })
      if (path === '/api/ticket11/settings' && response.status !== expected) throw Error(JSON.stringify(await response.json()))
      assert.equal(response.status, expected, `${label}: ${path} status`)
      return response.json()
    }
    const image = async (path, expected = 200, headers = { cookie, 'sec-fetch-site': 'same-origin', 'sec-fetch-dest': 'image' }, method = 'GET') => {
      const response = await fetch(origin + path, { method, headers, signal: AbortSignal.timeout(5000) })
      assert.equal(response.status, expected, `${label}: image status`)
      return Buffer.from(await response.arrayBuffer())
    }
    await visit({ call, image, origin, cookie })
    assert(!failed, 'Host emitted offline/import failure')
    console.log(`${label}: passed`)
  } finally { launchUrl = undefined; if (!exited) child.kill(); await completion }
}
const practice = (call, action, body, ...rest) => call('/api/kaogong/practice/' + action, body, ...rest)
const lesson = (call, action, body, ...rest) => call('/api/kaogong/lesson/' + action, body, ...rest)
const roles = (call, action, key) => call('/api/personal-workbench/roles', { action, key })
const manage = (call, body, ...rest) => call('/api/personal-workbench/management', body, ...rest)

await host('old archive pair / synthetic legacy data', async ({ call }) => {
  round = await practice(call, 'start', { subject, title: point })
  assert.equal(round.returned, 10); assert.doesNotMatch(JSON.stringify(round), /correctAnswer|synthetic explanation/)
  score = await practice(call, 'submit', { roundId: round.roundId, answers: round.questions.map(row => ({ id: row.id, answer: 'A' })) })
  assert.equal(score.correctCount, 0)
  counselorId = (await roles(call, 'ensure', counselorKey)).binding.sessionId
  teacherId = (await roles(call, 'ensure', teacherKey)).binding.sessionId
  assert.notEqual(counselorId, teacherId)
  const catalog = await manage(call, { action: 'catalog' })
  const row = catalog.roles.find(row => JSON.stringify(row.key) === JSON.stringify(teacherKey))
  assert(row?.available, 'Actual declared teacher must be assignable')
  assignment = (await manage(call, { action: 'assign', key: teacherKey, expectedRevision: row.assignment.revision, names: ['kaogong-teach'] })).assignment
})
await assertLegacy(source, root, assets)
await install(packages.map(row => row.archive))

async function installedBytesAndTypes() {
  const require = createRequire(join(home, 'package.json'))
  for (const [index, name] of ['personal-workbench', 'tool-kaogong'].entries()) {
    const entry = await realpath(require.resolve('@deepseek-ai/dsh-' + name)), rel = relative(root, entry)
    assert(!rel.startsWith('..') && !isAbsolute(rel), 'Installed artifact must stay inside owned home')
    const packageRoot = dirname(dirname(entry)), candidate = join(worktree, 'plugins', index ? 'kaogong' : 'personal-workbench')
    for (const file of packages[index].files) assert.deepEqual(await readFile(join(packageRoot, file)), await readFile(join(candidate, file)), `Installed bytes: ${file}`)
  }
  await checkInstalledTypes(home, source, root, env)
  console.log('Installed product root/Client consumers: passed (explicit built first-party type anchor; no paths/src mapping)')
}
await installedBytesAndTypes()
await cp(join(worktree, 'tests/release-native-probe.mjs'), join(root, 'native-probe.mjs'))
const secondImages = join(root, 'confirmed-images'), secondResults = join(root, 'confirmed-results')
await mkdir(secondImages); await mkdir(join(secondResults, assets.id, 'assets'), { recursive: true })
const secondPng = await readFile(join(worktree, 'plugins/kaogong/题目_images/verified/资料600-2023-hebei-retail-growth.png'))
await writeFile(join(secondImages, 'old.png'), secondPng); await writeFile(join(secondResults, assets.id, 'assets/chart.png'), secondPng)
await writePatch([{ insert: [{ id: 'ticket11-native', name: pathToFileURL(join(root, 'native-probe.mjs')).href, config: { key: teacherKey, newImageRoot: secondImages, newOutputRoot: secondResults, originalImageRoot: assets.assets, originalOutputRoot: assets.results, agentModule: pathToFileURL(resolve(source, 'packages/core/agent/lib/index.js')).href, llmModule: pathToFileURL(resolve(source, 'packages/llm/llm/lib/index.js')).href } }] }])

await host('upgraded archive pair / lessons, tasks, score and native assignment', async ({ call, image, origin, cookie }) => {
  for (const path of ['/api/kaogong/practice/history', '/api/kaogong/lesson/list', '/api/personal-workbench/management']) {
    const body = path.includes('management') ? { action: 'catalog' } : {}
    await call(path, body, 401, { cookie: '' }); await call(path, body, 403, { origin: 'http://foreign.invalid' })
  }
  assert.deepEqual((await practice(call, 'read', { roundId: round.roundId })).result, score)
  const answers = round.questions.map(row => ({ id: row.id, answer: 'A' }))
  assert.deepEqual(await practice(call, 'submit', { roundId: round.roundId, answers }), score)
  await practice(call, 'submit', { roundId: round.roundId, answers: answers.map(row => ({ ...row, answer: 'B' })) }, 409)
  const entries = answers.map(row => ({ id: row.id, errorReason: '概念混淆', notes: 'synthetic durable reflection' }))
  score = (await practice(call, 'reflection', { roundId: round.roundId, entries })).result
  savedRound = await practice(call, 'review', { roundId: round.roundId, action: 'claim' })
  assert.equal(savedRound.result.review, 'sending')
  score = savedRound.result
  await practice(call, 'review', { roundId: round.roundId, action: 'claim' }, 409)
  const input = { lessonId: randomUUID(), subject, objective: 'Synthetic confirmed objective', knowledgePoint: point, materialIds: ['material'], requireReflections: true }
  await lesson(call, 'create', { ...input, completed: true }, 400)
  await lesson(call, 'create', input); await lesson(call, 'create', input)
  await lesson(call, 'confirm', { lessonId: input.lessonId, confirmed: true }, 409)
  await lesson(call, 'summary', { lessonId: input.lessonId, notes: 'Prose claims completed but has no authority' })
  await lesson(call, 'link', { lessonId: input.lessonId, roundId: round.roundId })
  completedLesson = await lesson(call, 'confirm', { lessonId: input.lessonId, confirmed: true })
  assert(completedLesson.lesson.completion); assert.equal(completedLesson.evidence[0].total, 10)
  assert.deepEqual(await lesson(call, 'confirm', { lessonId: input.lessonId, confirmed: true }), completedLesson)
  assert.equal((await roles(call, 'read', teacherKey)).binding.sessionId, teacherId)
  completedLesson = await lesson(call, 'prepare', { lessonId: input.lessonId })
  assert.equal(completedLesson.lesson.binding.sessionId, teacherId)
  unfinishedLesson = await lesson(call, 'create', { ...input, lessonId: randomUUID(), objective: 'Unfinished synthetic objective' })
  assert.equal(unfinishedLesson.lesson.completion, null)
  assert.deepEqual(await lesson(call, 'current', {}), unfinishedLesson)
  const catalog = await manage(call, { action: 'catalog' })
  assert.deepEqual(catalog.roles.find(row => JSON.stringify(row.key) === JSON.stringify(teacherKey)).assignment, assignment)
  assert.equal((await roles(call, 'read', counselorKey)).binding.sessionId, counselorId)
  const native = await call('/api/ticket11/native', {})
  assert.equal(native.sessionId, teacherId); assert.deepEqual(native.nativeNames, ['kaogong-teach']); assert(native.canonicalBody && native.durableSeqUnchanged)
  assert.equal((await manage(call, { action: 'catalog' })).roles.find(row => JSON.stringify(row.key) === JSON.stringify(teacherKey)).loaded.length, 0)
  const bundled = '/api/kaogong/material-image?asset=' + encodeURIComponent('verified/资料600-2024-jiangsu-17.png')
  assert.deepEqual(await image(bundled), assets.bytes)
  await image('/api/kaogong/material-image?asset=old.png', 401, {})
  await image('/api/kaogong/material-image?asset=old.png', 403, { cookie, origin: 'http://foreign.invalid' })
  await image('/api/kaogong/material-image?asset=old.png', 403, { cookie, origin: 'null' })
  await image('/api/kaogong/material-image?asset=old.png', 403, { cookie, 'sec-fetch-site': 'cross-site' })
  assert.equal((await image('/api/kaogong/material-image?asset=old.png', 200, { cookie }, 'HEAD')).length, 0)
  assert.equal((await image(`/api/kaogong/document-image?id=${assets.id}&asset=chart.png`, 200, { cookie }, 'HEAD')).length, 0)
  assert.deepEqual(await image('/api/kaogong/material-image?asset=old.png'), assets.bytes)
  assert.deepEqual(await image(`/api/kaogong/document-image?id=${assets.id}&asset=chart.png`), assets.bytes)
  const settings = await call('/api/ticket11/settings', {})
  assert(settings.revisionChanged && settings.credentialRedacted && settings.tokenPreserved)
  assert.deepEqual(await image('/api/kaogong/material-image?asset=old.png'), secondPng, 'Native settings must reapply the image route, not just save config')
  assert.deepEqual(await image(`/api/kaogong/document-image?id=${assets.id}&asset=chart.png`), secondPng, 'Native settings must reapply the document reader')
  const restoredSettings = await call('/api/ticket11/settings', {})
  assert(restoredSettings.credentialRedacted && restoredSettings.tokenPreserved)
  assert.deepEqual(await image('/api/kaogong/material-image?asset=old.png'), assets.bytes)
  assert.deepEqual(await image(`/api/kaogong/document-image?id=${assets.id}&asset=chart.png`), assets.bytes)
})

async function verifyRecovery({ call, image }, workbench = true) {
  assert.deepEqual(await practice(call, 'read', { roundId: round.roundId }), savedRound)
  assert.equal((await practice(call, 'history', {})).rounds.length, 1)
  await practice(call, 'review', { roundId: round.roundId, action: 'claim' }, 409)
  assert.deepEqual(await lesson(call, 'read', { lessonId: completedLesson.lesson.request.lessonId }), completedLesson)
  assert.deepEqual(await lesson(call, 'current', {}), unfinishedLesson)
  assert.deepEqual(await image('/api/kaogong/material-image?asset=old.png'), assets.bytes)
  assert.deepEqual(await image(`/api/kaogong/document-image?id=${assets.id}&asset=chart.png`), assets.bytes)
  if (workbench) {
    assert.equal((await roles(call, 'read', teacherKey)).binding.sessionId, teacherId)
    assert.equal((await roles(call, 'read', counselorKey)).binding.sessionId, counselorId)
    const catalog = await manage(call, { action: 'catalog' })
    assert.deepEqual(catalog.roles.find(row => JSON.stringify(row.key) === JSON.stringify(teacherKey)).assignment, assignment)
  } else await lesson(call, 'prepare', { lessonId: completedLesson.lesson.request.lessonId }, 503)
}
await host('cold restart exact durable recovery', verifyRecovery)
await assertLegacy(source, root, assets)
for (const [label, config] of [['omitted optional roots', { roleCwd: cwd }], ['relative optional roots', { roleCwd: cwd, questionImageRoot: './old-images', mineru: { outputDir: './old-output' } }]]) {
  await writePatch([], config)
  await host(label + ' retain installed Host business availability', async ({ call, image }) => {
    assert.deepEqual((await practice(call, 'read', { roundId: round.roundId })).result, score)
    assert.deepEqual(await lesson(call, 'current', {}), unfinishedLesson)
    await image('/api/kaogong/material-image?asset=old.png', 503)
    await image(`/api/kaogong/document-image?id=${assets.id}&asset=chart.png`, 503)
    assert.deepEqual(await image('/api/kaogong/material-image?asset=' + encodeURIComponent('verified/资料600-2024-jiangsu-17.png')), assets.bytes)
  })
}
await writePatch()
const hashes = async () => {
  const { readdir } = await import('node:fs/promises')
  const result = {}
  async function scan(dir, prefix = '') { for (const entry of await readdir(dir, { withFileTypes: true })) { const path = join(dir, entry.name), key = prefix + entry.name; if (entry.isDirectory()) await scan(path, key + '/'); else result[key] = createHash('sha256').update(await readFile(path)).digest('hex') } }
  await scan(join(root, 'data')); return result
}
const beforeUnload = await hashes()
await run(['plugin', '--profile', profile, 'remove', '@deepseek-ai/dsh-personal-workbench', ...removeArgs])
assert.deepEqual(await hashes(), beforeUnload, 'Official uninstall must not purge business/role/management data')
await host('standalone Kaogong after workbench uninstall', api => verifyRecovery(api, false))
await install([packages[0].archive])
await host('workbench reinstall exact role and assignment recovery', verifyRecovery)
const beforeKaogongUnload = await hashes()
await run(['plugin', '--profile', profile, 'remove', '@deepseek-ai/dsh-tool-kaogong', ...removeArgs])
assert.deepEqual(await hashes(), beforeKaogongUnload, 'Kaogong uninstall must not purge data')
await assertLegacy(source, root, assets)
await install([packages[1].archive])
await host('Kaogong reinstall exact lesson/task/score recovery', verifyRecovery)
await assertLegacy(source, root, assets)
await writeFile(join(root, 'verdict.json'), JSON.stringify({ officialOfflineInstall: true, normalPeerPolicy: true, installedConsumers: true, upgrade: true, uninstallReinstall: true, nativePreStep: true, modelCalls: 0, browserAcceptance: 'pending', completedNativeTurn: 'pending', archives: packages.map(({ sha256 }) => sha256) }, null, 2))
console.log('Release checks passed; Chrome visuals, both live sidebar modes and completed native interactive turns remain pending.')
