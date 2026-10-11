import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { apply, Config } from '../lib/index.js'
import { Mineru } from '../src/mineru.ts'

const source = process.env.KAOGONG_TEST_RUNTIME
const require = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { Context, resolveConfig } = require('@deepseek-ai/cordis')
const load = path => import(pathToFileURL(resolve(source, path)).href)
const { default: Storage } = await load('packages/storage/storage/lib/index.js')
const { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js')
const { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')

async function host(root, config = {}) {
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(join(root, 'data')); ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json' }); ctx.storage.mount('domain', facility)
  const routes = new Map(), disposers = []
  await apply({ storageDomain: facility, inject() {}, logger: { warn() {} },
    effect(effect) { const dispose = effect(); if (typeof dispose === 'function') disposers.push(dispose) }, tools: { register() {} },
    connection: { requestRejection(req) { return !req.headers.cookie ? 401 : req.headers.origin && req.headers.origin !== 'http://fixture' ? 403 : undefined } },
    webServer: { register(route) { routes.set(route.path, route.handler); return () => routes.delete(route.path) } },
  }, resolveConfig({ Config }, config))
  return { async call(path, query, headers = { cookie: 'synthetic', 'sec-fetch-site': 'same-origin' }) {
    let status, body
    await routes.get(path)({ method: 'GET', url: path + query, headers }, { writeHead(code) { status = code }, end(value) { body = value } })
    return { status, body }
  }, close: async () => { for (const dispose of disposers.reverse()) await dispose(); await backend.close(); await ctx.fiber.dispose() } }
}

test('omitted parser/image roots keep Host usable and explicitly unavailable; bundled verified assets remain authenticated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-no-root-')); let app
  try {
    app = await host(root)
    assert.equal((await app.call('/api/kaogong/document-image', '?id=unknown&asset=image.png')).status, 503)
    assert.equal((await app.call('/api/kaogong/material-image', '?asset=legacy.png')).status, 503)
    const asset = '?asset=' + encodeURIComponent('verified/资料600-2024-jiangsu-17.png')
    assert.equal((await app.call('/api/kaogong/material-image', asset, {})).status, 401)
    assert.equal((await app.call('/api/kaogong/material-image', asset, { cookie: 'synthetic', origin: 'http://foreign' })).status, 403)
    assert.equal((await app.call('/api/kaogong/material-image', asset)).status, 200)
    await assert.rejects(new Mineru(() => ({})).start('not-a-pdf', 'fixture'), /explicit durable/)
    await app.close(); app = await host(root, { questionImageRoot: './legacy-images', mineru: { outputDir: './legacy-output' } })
    assert.equal((await app.call('/api/kaogong/document-image', '?id=unknown&asset=image.png')).status, 503)
    assert.equal((await app.call('/api/kaogong/material-image', '?asset=legacy.png')).status, 503)
    assert.equal((await app.call('/api/kaogong/material-image', asset)).status, 200)
    await assert.rejects(new Mineru(() => ({ outputDir: './legacy-output' })).start('not-a-pdf', 'fixture'), /explicit durable/)
  } finally { await app?.close(); await rm(root, { recursive: true, force: true }) }
})

test('explicit legacy roots read synthetic image/results without migration or writes and block traversal/symlink escape', async () => {
  const root = await mkdtemp(join(tmpdir(), 'release-legacy-root-')); let app
  try {
    const images = join(root, 'historical-images'), output = join(root, 'durable-results'), id = randomUUID()
    await mkdir(images); await mkdir(join(output, id, 'assets'), { recursive: true })
    const png = Buffer.from('89504e470d0a1a0a', 'hex')
    await writeFile(join(images, 'old.png'), png); await writeFile(join(output, id, 'assets', 'chart.png'), png)
    await writeFile(join(root, 'outside.png'), 'outside')
    await symlink(root, join(images, 'escape'), 'junction')
    app = await host(root, { questionImageRoot: images, mineru: { outputDir: output } })
    assert.deepEqual((await app.call('/api/kaogong/material-image', '?asset=old.png')).body, png)
    assert.deepEqual((await app.call('/api/kaogong/document-image', `?id=${id}&asset=chart.png`)).body, png)
    for (const asset of ['../outside.png', 'escape/outside.png', 'old.txt', 'old.png/../outside.png']) assert.notEqual((await app.call('/api/kaogong/material-image', '?asset=' + encodeURIComponent(asset))).status, 200)
    await app.close(); app = await host(root, { questionImageRoot: images, mineru: { outputDir: output } })
    assert.deepEqual((await app.call('/api/kaogong/material-image', '?asset=old.png')).body, png)
  } finally { await app?.close(); await unlink(join(root, 'historical-images', 'escape')).catch(error => { if (error.code !== 'ENOENT') throw error }); await rm(root, { recursive: true, force: true }) }
})
