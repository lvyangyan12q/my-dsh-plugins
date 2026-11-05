import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { apply } from '../lib/index.js'
import { MAX_DAY_BYTES, storagePaths, writeDayDigest } from '../src/storage.js'

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
  const route = routes.get(path) ?? [...routes.entries()]
    .filter(([registered, entry]) => entry.kind === 'prefix' && path.startsWith(registered))
    .sort((left, right) => right[0].length - left[0].length)
    .map(([, entry]) => entry)[0]
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

const dataRoot = join(home, 'paper-reader')

function dayDocument(date, count = 2) {
  return {
    schemaVersion: 2,
    date,
    generatedAt: `${date}T09:02:00+08:00`,
    run: { status: 'ok', finishedAt: `${date}T09:03:00+08:00`, sources: [{ id: 'arxiv', status: 'ok', items: count }] },
    items: Array.from({ length: count }, (_, index) => ({
      id: `${date}-item-${index}`,
      source: 'arxiv',
      sourceId: 'arxiv',
      sourceLanguage: 'en',
      title: { original: `Title ${index}`, translation: `标题 ${index}` },
      summary: { original: 'Summary', translation: '摘要' },
      direction: 'agent',
      excerpt: false,
      blocks: [{ type: 'paragraph', original: 'Body.', translation: '正文。' }],
    })),
  }
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

/* ------------------------------------------------------------------ */
/* Contract v2                                                         */
/* ------------------------------------------------------------------ */

test('serves a v2 digest whose items carry sourceLanguage and paired text', async () => {
  writeFileSync(digestPath, JSON.stringify(sample), 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 200)
  const body = JSON.parse(response.body)
  assert.equal(body.demo, false)
  assert.equal(body.schemaVersion, 2)
  const items = body.days.flatMap(day => day.items)
  const english = items.find(item => item.sourceLanguage === 'en')
  const chinese = items.find(item => item.sourceLanguage === 'zh')
  assert.ok(english, 'sample keeps an English-source item')
  assert.ok(chinese, 'sample keeps a Chinese-source item')
  assert.equal(typeof english.title.translation, 'string')
  assert.equal(typeof chinese.title.original, 'string')
})

test('rejects a v2 item that omits sourceLanguage', async () => {
  const broken = structuredClone(sample)
  delete broken.days[0].items[0].sourceLanguage
  writeFileSync(digestPath, JSON.stringify(broken), 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 422)
  assert.equal(JSON.parse(response.body).error, 'digest_unavailable')
  assert.match(JSON.parse(response.body).message, /sourceLanguage/)
})

test('rejects a v2 paragraph that is missing the paired translation field', async () => {
  const broken = structuredClone(sample)
  const block = broken.days[0].items[0].blocks.find(entry => entry.type === 'paragraph')
  delete block.translation
  writeFileSync(digestPath, JSON.stringify(broken), 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 422)
  assert.match(JSON.parse(response.body).message, /translation/)
})

test('rejects a v2 figure caption that is not a pair', async () => {
  const broken = structuredClone(sample)
  const block = broken.days[0].items[0].blocks.find(entry => entry.type === 'figure')
  block.caption = 'a bare string is not a pair'
  writeFileSync(digestPath, JSON.stringify(broken), 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 422)
  assert.match(JSON.parse(response.body).message, /caption/)
})

test('accepts explicit null translations: an untranslated block is valid, not broken', async () => {
  const pending = {
    schemaVersion: 2,
    days: [{
      date: '2026-11-04',
      items: [{
        id: 'pending-one',
        sourceLanguage: 'en',
        title: { original: 'A title', translation: null },
        translationState: 'pending',
        blocks: [{ type: 'paragraph', original: 'Body.', translation: null, translationState: 'pending' }],
      }],
    }],
  }
  writeFileSync(digestPath, JSON.stringify(pending), 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 200)
  assert.equal(JSON.parse(response.body).days[0].items[0].translationState, 'pending')
})

test('still accepts a legacy v1 digest with en/zh fields', async () => {
  const legacy = {
    schemaVersion: 1,
    days: [{
      date: '2026-11-04',
      items: [{
        id: 'legacy-one',
        titleZh: '旧标题',
        titleEn: 'Legacy title',
        blocks: [{ type: 'heading', en: 'Abstract', zh: '摘要' }],
      }],
    }],
  }
  writeFileSync(digestPath, JSON.stringify(legacy), 'utf8')
  const response = await call('/api/paper-reader/digest')
  assert.equal(response.status, 200)
  assert.equal(JSON.parse(response.body).days[0].items[0].id, 'legacy-one')
})

test('sample digest satisfies the v2 item contract and includes a Chinese source', () => {
  assert.equal(sample.schemaVersion, 2)
  assert.ok(Array.isArray(sample.directions) && sample.directions.length > 0)
  assert.ok(Array.isArray(sample.sources) && sample.sources.length > 0)
  const ids = new Set()
  const languages = new Set()
  for (const day of sample.days) {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/)
    for (const item of day.items) {
      assert.equal(typeof item.id, 'string')
      assert.ok(!ids.has(item.id), `duplicate item id ${item.id}`)
      ids.add(item.id)
      assert.ok(['en', 'zh'].includes(item.sourceLanguage), `unknown sourceLanguage on ${item.id}`)
      languages.add(item.sourceLanguage)
      assert.equal(typeof item.title.original, 'string')
      assert.ok('translation' in item.title)
      assert.ok(Array.isArray(item.blocks))
      for (const block of item.blocks) {
        if (block.type === 'paragraph' || block.type === 'heading') {
          assert.equal(typeof block.original, 'string')
          assert.ok('translation' in block, `${item.id} ${block.type} lacks a translation field`)
        }
        if (block.type === 'equation' && block.note) assert.ok('translation' in block.note)
        if (block.type === 'figure' && block.caption) assert.ok('translation' in block.caption)
      }
    }
  }
  assert.ok(languages.has('zh'), 'sample needs one Chinese-source item')
})

/* ------------------------------------------------------------------ */
/* Day-file history                                                    */
/* ------------------------------------------------------------------ */

test('registers the index and by-date routes alongside the legacy digest route', () => {
  assert.ok(routes.has('/api/paper-reader/index'))
  assert.ok(routes.has('/api/paper-reader/digest'))
  assert.ok([...routes.values()].some(route => route.kind === 'prefix' && route.path === '/api/paper-reader/digest/'))
})

test('a missing index answers an explicit empty index, not an error', async () => {
  const response = await call('/api/paper-reader/index')
  assert.equal(response.status, 200)
  const body = JSON.parse(response.body)
  assert.deepEqual(body.days, [])
  assert.equal(body.missing, true)
  assert.equal(body.demo, false)
})

test('the index route lists stored days newest first with their counts', async () => {
  await writeDayDigest({ root: dataRoot, digest: dayDocument('2026-11-03', 2), now: new Date('2026-11-03T09:05:00Z') })
  await writeDayDigest({ root: dataRoot, digest: dayDocument('2026-11-05', 3), now: new Date('2026-11-05T09:05:00Z') })

  const response = await call('/api/paper-reader/index')
  assert.equal(response.status, 200)
  const body = JSON.parse(response.body)
  assert.equal(body.missing, false)
  assert.equal(body.demo, false)
  assert.deepEqual(body.days.map(day => day.date), ['2026-11-05', '2026-11-03'])
  assert.equal(body.days[0].items, 3)
  assert.equal(body.retentionDays, 30)
})

test('the by-date route returns exactly that day and marks it non-demo', async () => {
  const response = await call('/api/paper-reader/digest/2026-11-05')
  assert.equal(response.status, 200)
  const body = JSON.parse(response.body)
  assert.equal(body.demo, false)
  assert.equal(body.date, '2026-11-05')
  assert.equal(body.items.length, 3)
  assert.equal(body.items[0].sourceLanguage, 'en')
})

test('a date with no stored file is a 404 and a malformed date is a 400', async () => {
  const missing = await call('/api/paper-reader/digest/2026-10-01')
  assert.equal(missing.status, 404)
  assert.equal(JSON.parse(missing.body).error, 'digest_missing')

  const invalid = await call('/api/paper-reader/digest/2026-13-01')
  assert.equal(invalid.status, 400)
  assert.equal(JSON.parse(invalid.body).error, 'digest_invalid_date')

  const noDate = await call('/api/paper-reader/digest/')
  assert.equal(noDate.status, 400)
})

test('a corrupt day file is a 422 that names the file', async () => {
  const paths = storagePaths(dataRoot)
  writeFileSync(paths.dayPath('2026-10-30'), '{broken')
  const response = await call('/api/paper-reader/digest/2026-10-30')
  assert.equal(response.status, 422)
  const body = JSON.parse(response.body)
  assert.equal(body.error, 'digest_invalid')
  assert.match(body.message, /2026-10-30/)
})

test('an oversized day file is a 413 rather than a broken page', async () => {
  const paths = storagePaths(dataRoot)
  writeFileSync(
    paths.dayPath('2026-10-29'),
    JSON.stringify({ date: '2026-10-29', schemaVersion: 2, items: [], filler: 'x'.repeat(MAX_DAY_BYTES) }),
  )
  const response = await call('/api/paper-reader/digest/2026-10-29')
  assert.equal(response.status, 413)
  assert.equal(JSON.parse(response.body).error, 'digest_too_large')
})

test('the by-date route rejects unsupported methods and passes admission through', async () => {
  const post = await call('/api/paper-reader/digest/2026-11-05', 'POST')
  assert.equal(post.status, 405)

  connection = { admit: () => ({ rejection: 401 }) }
  const unauthorized = await call('/api/paper-reader/digest/2026-11-05')
  assert.equal(unauthorized.status, 401)
  const unauthorizedIndex = await call('/api/paper-reader/index')
  assert.equal(unauthorizedIndex.status, 401)
  connection = undefined
})

test('HEAD on the by-date route answers headers without a body', async () => {
  const head = await call('/api/paper-reader/digest/2026-11-05', 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(head.body, '')
})

test('a corrupt index is a 422 while day files stay readable', async () => {
  writeFileSync(storagePaths(dataRoot).indexPath, '{broken')
  const response = await call('/api/paper-reader/index')
  assert.equal(response.status, 422)
  assert.equal(JSON.parse(response.body).error, 'index_unavailable')

  const day = await call('/api/paper-reader/digest/2026-11-05')
  assert.equal(day.status, 200)
})
