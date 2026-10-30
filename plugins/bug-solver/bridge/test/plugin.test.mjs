/**
 * 接缝：可安装 Host 插件壳。验证 package.json/cordis.patch.yml 契约，以及 apply()
 * 通过 ctx.connection.fetch.register 挂载 /api/bug-solver/*；依赖缺失时明确 503。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { apply, inject, name } from '../lib/index.js'
import { createServiceHarness } from './helpers.mjs'

const bridgeDir = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(`${bridgeDir}/package.json`, 'utf8'))

function createFakeCtx() {
  const routes = []
  const disposers = []
  const registry = {
    routes,
    register(spec) {
      routes.push(spec)
      return () => {
        const index = routes.indexOf(spec)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  }
  const ctx = {
    connection: { fetch: registry },
    inject(_names, callback) {
      callback(ctx)
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
    disposers,
  }
  return ctx
}

test('package metadata matches the installable Host plugin contract', () => {
  assert.equal(pkg.name, 'bug-solver-dispatch')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.main, 'lib/index.js')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.engines.dsh, '0.2.1-rc.3 || 0.2.2-alpha.2')
  assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], '*')
  assert.equal(pkg.peerDependenciesMeta['@deepseek-ai/cordis'].optional, true)

  const patch = readFileSync(`${bridgeDir}/cordis.patch.yml`, 'utf8')
  assert.match(patch, /-\s*insert:/)
  assert.match(patch, /id:\s*bug-solver-dispatch/)
  assert.match(patch, /name:\s*bug-solver-dispatch/)
})

test('exports the cordis plugin name/inject and registers every contract route', () => {
  assert.equal(name, 'bug-solver-dispatch')
  assert.deepEqual(inject, ['connection'])

  const ctx = createFakeCtx()
  apply(ctx, {})
  const paths = ctx.connection.fetch.routes.map((route) => route.path)
  assert.deepEqual(paths, [
    '/api/bug-solver/start',
    '/api/bug-solver/runs',
    '/api/bug-solver/run',
    '/api/bug-solver/approve-plan',
    '/api/bug-solver/plan-feedback',
    '/api/bug-solver/request-changes',
    '/api/bug-solver/stop',
    '/api/bug-solver/approve',
    '/api/bug-solver/resume',
    '/api/bug-solver/messages',
    '/api/bug-solver/artifact',
    '/api/bug-solver/writeback',
  ])
  const start = ctx.connection.fetch.routes[0]
  assert.deepEqual(start.methods, ['POST'])
  assert.equal(start.requestBody, 'buffered')
  const runs = ctx.connection.fetch.routes[1]
  assert.deepEqual(runs.methods, ['GET'])
  assert.equal(runs.requestBody, undefined)
  assert.equal(typeof start.fetch, 'function')
  assert.equal(ctx.disposers.length, 1)
})

test('with injected fakes the plugin serves a full start request', async (t) => {
  const h = createServiceHarness(t)
  const ctx = createFakeCtx()
  apply(ctx, { deps: { gateway: h.gateway, store: h.store, clock: h.clock, redactor: h.redactor }, allowedRoots: [h.root] })

  const route = ctx.connection.fetch.routes.find((item) => item.path.endsWith('/start'))
  const response = await route.fetch(
    new Request('http://localhost/api/bug-solver/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draft: h.draft() }),
    }),
  )
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.run.state, 'fix_planning')
  assert.equal(h.gateway.calls.create.length, 1)
})

test('without gateway/store the plugin still loads and answers 503 bridge-unavailable', async () => {
  const ctx = createFakeCtx()
  apply(ctx, {})
  const runs = ctx.connection.fetch.routes.find((item) => item.path.endsWith('/runs'))
  const response = await runs.fetch(new Request('http://localhost/api/bug-solver/runs'))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'bridge-unavailable')
})

test('disposing the plugin unregisters its routes', () => {
  const ctx = createFakeCtx()
  apply(ctx, {})
  assert.equal(ctx.connection.fetch.routes.length, 12)
  for (const dispose of ctx.disposers.reverse()) dispose()
  assert.equal(ctx.connection.fetch.routes.length, 0)
})
