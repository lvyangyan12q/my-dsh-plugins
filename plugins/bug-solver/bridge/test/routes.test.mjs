/**
 * 接缝：HTTP handler（薄适配层）。只通过 Request/Response 观察状态码与 JSON 错误码，
 * 不关心 DispatchService 内部。
 */
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { DispatchService } from '../lib/dispatch-service.js'
import { handleRoute, ROUTES } from '../lib/routes.js'
import { createServiceHarness, driveToReview, finishReview } from './helpers.mjs'

const url = (name, query = {}) => {
  const target = new URL(`http://localhost/api/bug-solver/${name}`)
  for (const [key, value] of Object.entries(query)) target.searchParams.set(key, value)
  return target
}

const get = (service, name, query) => handleRoute(name, service, new Request(url(name, query)))

const post = (service, name, body, { contentType = 'application/json' } = {}) =>
  handleRoute(
    name,
    service,
    new Request(url(name), {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )

test('start accepts a draft and reports idempotency on replay', async (t) => {
  const h = createServiceHarness(t)
  const draft = h.draft()
  const first = await post(h.service, 'start', { draft, requestId: 'req-1' })
  assert.equal(first.status, 200)
  const firstBody = await first.json()
  assert.equal(firstBody.idempotent, false)
  assert.equal(firstBody.run.state, 'fix_planning')

  const replay = await post(h.service, 'start', { draft, requestId: 'req-1' })
  assert.equal(replay.status, 200)
  const replayBody = await replay.json()
  assert.equal(replayBody.idempotent, true)
  assert.equal(replayBody.run.id, firstBody.run.id)
})

test('start maps transport and validation errors to stable codes', async (t) => {
  const h = createServiceHarness(t)

  const wrongType = await post(h.service, 'start', { draft: h.draft() }, { contentType: 'text/plain' })
  assert.equal(wrongType.status, 415)
  assert.equal((await wrongType.json()).code, 'unsupported-media-type')

  const badJson = await handleRoute(
    'start',
    h.service,
    new Request(url('start'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    }),
  )
  assert.equal(badJson.status, 400)
  assert.equal((await badJson.json()).code, 'bad-json')

  const invalid = await post(h.service, 'start', { draft: h.draft({ project: { localPath: '' } }) })
  assert.equal(invalid.status, 422)
  const invalidBody = await invalid.json()
  assert.equal(invalidBody.code, 'invalid-draft')
  assert.ok(invalidBody.details.some((detail) => detail.code === 'local-path-missing'))
})

test('runs/run expose read models and use 404/400 for bad lookups', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  const list = await get(h.service, 'runs')
  assert.equal(list.status, 200)
  assert.deepEqual((await list.json()).runs.map((item) => item.id), [run.id])

  const one = await get(h.service, 'run', { runId: run.id })
  assert.equal(one.status, 200)
  assert.equal((await one.json()).run.id, run.id)

  const missing = await get(h.service, 'run', { runId: 'nope' })
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).code, 'run-not-found')

  const noId = await get(h.service, 'run')
  assert.equal(noId.status, 400)
  assert.equal((await noId.json()).code, 'bad-request')
})

test('approve-plan / plan-feedback / approve map conflicts and validation to 409/400', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  const early = await post(h.service, 'approve-plan', { runId: run.id })
  assert.equal(early.status, 409)
  assert.equal((await early.json()).code, 'illegal-transition')

  const emptyFeedback = await post(h.service, 'plan-feedback', { runId: run.id, feedback: ' ' })
  assert.equal(emptyFeedback.status, 409, 'feedback is only accepted at the approval gate')

  const missingRun = await post(h.service, 'approve', {})
  assert.equal(missingRun.status, 400)
})

test('stop is exposed and idempotent over HTTP', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  const first = await post(h.service, 'stop', { runId: run.id })
  assert.equal(first.status, 200)
  assert.equal((await first.json()).run.state, 'stopped')

  const second = await post(h.service, 'stop', { runId: run.id })
  assert.equal((await second.json()).idempotent, true)
})

test('messages pages backwards with before and rejects unknown roles', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  h.gateway.setMessages(run.fixSessionId, [
    { seq: 1, at: 1, role: 'user', kind: 'text', text: 'password=Hunter2' },
    { seq: 2, at: 2, role: 'assistant', kind: 'text', text: '收到' },
    { seq: 3, at: 3, role: 'assistant', kind: 'text', text: '最新' },
  ])

  const page = await get(h.service, 'messages', { runId: run.id, role: 'fix', limit: '1' })
  assert.equal(page.status, 200)
  const body = await page.json()
  assert.equal(body.messages.length, 1)
  assert.equal(body.messages[0].seq, 3, 'first request returns the newest page')
  assert.equal(body.hasMore, true)
  assert.equal(body.before, 3)

  const older = await get(h.service, 'messages', { runId: run.id, role: 'fix', before: '3', limit: '1' })
  const olderBody = await older.json()
  assert.equal(olderBody.messages[0].seq, 2)
  assert.equal(olderBody.before, 2)

  const badRole = await get(h.service, 'messages', { runId: run.id, role: 'all' })
  assert.equal(badRole.status, 400)
  assert.equal((await badRole.json()).code, 'bad-role')

  const badBefore = await get(h.service, 'messages', { runId: run.id, role: 'fix', before: '-1' })
  assert.equal(badBefore.status, 400)
  assert.equal((await badBefore.json()).code, 'bad-before')
})

test('artifact download returns a text attachment inside the run directory', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const dir = join(h.root, '.bug-solver', 'runs', run.id, 'round-1')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plan.md'), '# 方案\npassword=Hunter2', 'utf8')

  const download = await get(h.service, 'artifact', { runId: run.id, name: 'round-1/plan.md', download: '1' })
  assert.equal(download.status, 200)
  assert.match(download.headers.get('content-type'), /text\/plain/)
  assert.match(download.headers.get('content-disposition'), /attachment; filename="plan\.md"/)
  const text = await download.text()
  assert.match(text, /# 方案/)
  assert.ok(!text.includes('Hunter2'), 'downloads are redacted too')
})

test('writeback route validates and atomically writes window2 ssh-config', async (t) => {
  const h = createServiceHarness(t)
  const dataDir = join(h.root, 'data')
  mkdirSync(dataDir, { recursive: true })
  const sshConfigPath = join(dataDir, 'ssh-config.json')
  writeFileSync(
    sshConfigPath,
    JSON.stringify({
      version: 2,
      connections: [],
      projects: [{ id: 'proj-api', name: 'api', localPath: '' }],
      links: [],
      serviceMap: [],
    }),
    'utf8',
  )
  mkdirSync(join(h.root, '.git'), { recursive: true })

  const service = new DispatchService({
    gateway: h.gateway,
    store: h.store,
    clock: h.clock,
    redactor: h.redactor,
    allowedRoots: [h.root],
    sshConfigPath,
  })
  const response = await post(service, 'writeback', {
    projectId: 'proj-api',
    localPath: h.root,
    serviceMap: [{ match: ['api'], projectId: 'proj-api', container: 'docker-api-1' }],
  })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.ok, true)
  assert.equal(body.version, 2)

  const saved = JSON.parse(readFileSync(sshConfigPath, 'utf8'))
  assert.equal(saved.projects[0].localPath, realpathSync(h.root))
  assert.equal(saved.serviceMap[0].container, 'docker-api-1')

  const bad = await post(service, 'writeback', { projectId: 'missing', localPath: h.root })
  assert.equal(bad.status, 422)
  assert.equal((await bad.json()).code, 'project-not-found')
})

test('resume and request-changes are exposed with the right transitions', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  await finishReview(h, reviewRun, { verdict: 'needs_info', blocking: ['需要确认预期'] })

  const resumed = await post(h.service, 'resume', { runId: run.id, note: '预期是 401' })
  assert.equal(resumed.status, 200)
  assert.equal((await resumed.json()).run.state, 'review_running')

  await finishReview(h, await h.service.getRun(run.id), { verdict: 'approve' })
  assert.equal((await h.service.getRun(run.id)).state, 'awaiting_user_approval')

  const requested = await post(h.service, 'request-changes', { runId: run.id, note: '再补一条测试' })
  assert.equal(requested.status, 200)
  assert.equal((await requested.json()).run.state, 'fix_planning')

  const wrongState = await post(h.service, 'request-changes', { runId: run.id, note: '再来' })
  assert.equal(wrongState.status, 409)
  assert.equal((await wrongState.json()).code, 'illegal-transition')
})

test('artifact reads are GET-only and map bad names to 400/404', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())

  const missingName = await get(h.service, 'artifact', { runId: run.id })
  assert.equal(missingName.status, 400)

  const escape = await get(h.service, 'artifact', { runId: run.id, name: '../runs.json' })
  assert.equal(escape.status, 400)
  assert.equal((await escape.json()).code, 'artifact-invalid-name')

  const missing = await get(h.service, 'artifact', { runId: run.id, name: 'round-1/plan.md' })
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).code, 'artifact-not-found')

  assert.equal(ROUTES.find((route) => route.name === 'artifact').method, 'GET')
})

test('the bridge is explicit when unavailable and never emits CORS headers', async (t) => {
  const h = createServiceHarness(t)
  const unavailable = await get(null, 'runs')
  assert.equal(unavailable.status, 503)
  assert.equal((await unavailable.json()).code, 'bridge-unavailable')

  const withReason = await handleRoute(
    'runs',
    null,
    new Request(url('runs')),
    '缺少 Host 服务：sessionController',
  )
  assert.equal(withReason.status, 503)
  assert.match((await withReason.json()).message, /sessionController/, 'the real reason must reach the user')

  const response = await get(h.service, 'runs')
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})

test('messages and artifact are read-only at the routing table level', () => {
  const messageRoute = ROUTES.find((route) => route.name === 'messages')
  const artifactRoute = ROUTES.find((route) => route.name === 'artifact')
  assert.equal(messageRoute.method, 'GET')
  assert.equal(artifactRoute.method, 'GET')
  assert.ok(ROUTES.every((route) => !/send|reply|approve-message/.test(route.name)))
  assert.ok(!ROUTES.some((route) => route.name === 'write'))
  assert.ok(ROUTES.some((route) => route.name === 'writeback'), 'writeback is the only config-writing route')
})
