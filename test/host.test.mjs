import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { apply } from '../lib/index.js'

const sample = JSON.parse(readFileSync(new URL('../sample/digest.json', import.meta.url), 'utf8'))
const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-'))
const profileDir = join(home, 'profiles', 'web')
mkdirSync(profileDir, { recursive: true })
const digestPath = join(home, 'paper-reader', 'digest.json')

let connection
const routes = new Map()
const disposers = []

const ctx = {
  effect(fn) { disposers.push(fn()) },
  webServer: { register(route) { routes.set(route.path, route); return () => {} } },
  get(name) {
    if (name === 'profileContext') return { dir: profileDir }
    if (name === 'connection') return connection
    return undefined
  },
}

before(() => {
  apply(ctx)
})

after(() => {
  for (const dispose of disposers) dispose()
  rmSync(home, { recursive: true, force: true })
})

function call(path, method = 'GET') {
  const route = routes.get(path)
  assert.ok(route, `route ${path} should be registered`)
  return new Promise((resolve, reject) => {
    const result = { status: 0, headers: undefined, body: '' }
    const res = {
      writeHead(status, headers) { result.status = status; result.headers = headers },
      end(body) { result.body = body ?? ''; resolve(result) },
    }
    Promise.resolve(route.handler({ method, url: path, headers: {} }, res)).catch(reject)
  })
}

test('registers both routes with GET handlers', () => {
  assert.ok(routes.has('/api/paper-reader/digest'))
  assert.ok(routes.has('/api/paper-reader/health'))
})

test('missing user digest falls back to the bundled sample marked demo', async () => {
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 200)
  const body = JSON.parse(response.body)
  assert.equal(body.demo, true)
  assert.equal(body.days.length, sample.days.length)
  assert.equal(body.days[0].items.length, sample.days[0].items.length)
})

test('serves a valid user digest with demo:false', async () => {
  mkdirSync(join(home, 'paper-reader'), { recursive: true })
  const userDigest = {
    schemaVersion: 1,
    generatedAt: '2026-11-04T09:00:00+08:00',
    days: [{ date: '2026-11-04', items: [{ id: 'only', titleZh: '测试', titleEn: 'Test', blocks: [] }] }],
  }
  writeFileSync(digestPath, JSON.stringify(userDigest), 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 200)
  const body = JSON.parse(response.body)
  assert.equal(body.demo, false)
  assert.equal(body.days[0].items[0].id, 'only')
})

test('broken JSON is an explicit 422 instead of the sample', async () => {
  writeFileSync(digestPath, '{broken', 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 422)
  assert.equal(JSON.parse(response.body).error, 'digest_unavailable')
})

test('schema mismatch is a 422', async () => {
  writeFileSync(digestPath, JSON.stringify({ days: [{ date: '2026-11-04', items: [{ id: 1 }] }] }), 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 422)
})

test('unsupported methods answer 405', async () => {
  const response = await call('/api/paper-reader/digest', 'POST')
  assert.equal(response.status, 405)
})

test('browser-session admission rejection is passed through', async () => {
  connection = { admit: () => ({ rejection: 403 }) }
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 403)
  connection = undefined
})

test('HEAD answers without a body and health answers ok', async () => {
  writeFileSync(digestPath, JSON.stringify({ days: [] }), 'utf8')
  const head = await call('/api/paper-reader/digest', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body, '')
  const health = await call('/api/paper-reader/health')
  assert.equal(health.status, 200)
  assert.equal(JSON.parse(health.body).ok, true)
})

test('reading never creates or mutates the user digest file', async () => {
  writeFileSync(digestPath, JSON.stringify({ marker: 'unchanged', days: [] }), 'utf8')
  await call('/api/paper-reader/digest')
  assert.equal(JSON.parse(readFileSync(digestPath, 'utf8')).marker, 'unchanged')
})

test('sample digest satisfies the documented item contract', () => {
  assert.ok(Array.isArray(sample.directions) && sample.directions.length > 0)
  assert.ok(Array.isArray(sample.sources) && sample.sources.length > 0)
  const ids = new Set()
  for (const day of sample.days) {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/)
    for (const item of day.items) {
      assert.equal(typeof item.id, 'string')
      assert.ok(!ids.has(item.id), `duplicate item id ${item.id}`)
      ids.add(item.id)
      assert.ok(item.titleZh || item.titleEn)
      assert.ok(Array.isArray(item.blocks))
      for (const block of item.blocks) {
        if (block.type === 'paragraph') assert.equal(typeof block.en, 'string')
        if (block.type === 'heading') assert.ok(block.en || block.zh)
      }
    }
  }
})
