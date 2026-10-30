/**
 * 接缝：插件壳 + 真实 Host 适配的装配。
 * 验证 apply() 在有 Host 服务时用真实网关服务化路由、没有 Host 服务时仍返回 503，
 * 以及 dispose 会同时摘掉路由与 session/event 监听。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { apply } from '../lib/index.js'
import { createFakeHost } from './fake-host.mjs'

function createCtx(host) {
  const routes = []
  const disposers = []
  const registry = {
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
    logger: { warn() {} },
    get: (name) => host.get(name),
    on: (name, listener) => host.on(name, listener),
    inject(_names, callback) {
      callback(ctx)
    },
    effect(fn) {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
      return dispose
    },
  }
  return { ctx, routes, disposers }
}

function makeWorkspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'bs-plugin-'))
  mkdirSync(join(root, '.git'))
  const dataDir = join(root, 'data')
  mkdirSync(dataDir)
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return { root, dataDir }
}

async function post(route, body) {
  return await route.fetch(
    new Request('http://localhost' + route.path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

test('with real host services the bridge routes serve a start request end to end', async (t) => {
  const { root, dataDir } = makeWorkspace(t)
  const host = createFakeHost()
  const { ctx, routes } = createCtx(host)
  apply(ctx, { dataDir, allowedRoots: [root], dirtyCheck: false })

  assert.equal(routes.length, 12)
  assert.equal(host.listenerCount('session/event'), 1, 'host gateway subscribes to session/event')

  const draft = {
    bug: { id: 'BUG-1', uid: 3083, title: '登录失败', description: '500' },
    connection: { host: '10.12.139.111', port: '22', user: 'root' },
    project: { localPath: root, defaultBranch: 'master' },
    specRef: { kind: 'none' },
  }
  const response = await post(routes.find((route) => route.path.endsWith('/start')), { draft })
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.run.state, 'fix_planning')
  assert.equal(host.calls.create.length, 1)

  const runRoute = routes.find((route) => route.path.endsWith('/run'))
  const runResponse = await runRoute.fetch(
    new Request(`http://localhost/api/bug-solver/run?id=${encodeURIComponent(body.run.id)}`),
  )
  assert.equal(runResponse.status, 200)
  assert.equal((await runResponse.json()).run.id, body.run.id)

  // 只读对话镜像：还没有消息，但不报错、没有写入入口。
  const messagesRoute = routes.find((route) => route.path.endsWith('/messages'))
  const messagesResponse = await messagesRoute.fetch(
    new Request(`http://localhost/api/bug-solver/messages?runId=${body.run.id}&role=fix`),
  )
  assert.equal(messagesResponse.status, 200)
  assert.deepEqual((await messagesResponse.json()).messages, [])
})

test('disposing the plugin removes the routes and the session/event listener', async (t) => {
  const { root, dataDir } = makeWorkspace(t)
  const host = createFakeHost()
  const { ctx, routes, disposers } = createCtx(host)
  apply(ctx, { dataDir, allowedRoots: [root] })
  assert.equal(routes.length, 12)
  assert.equal(host.listenerCount('session/event'), 1)

  for (const dispose of [...disposers].reverse()) dispose()
  assert.equal(routes.length, 0)
  assert.equal(host.listenerCount('session/event'), 0)
})

test('a missing host service still loads the plugin and answers 503', async (t) => {
  const { root, dataDir } = makeWorkspace(t)
  const host = createFakeHost()
  host.missing.add('sessionController')
  const { ctx, routes } = createCtx(host)
  apply(ctx, { dataDir, allowedRoots: [root] })

  assert.equal(routes.length, 12, 'routes are registered even without host services')
  const response = await routes.find((route) => route.path.endsWith('/runs')).fetch(
    new Request('http://localhost/api/bug-solver/runs'),
  )
  assert.equal(response.status, 503)
  const body = await response.json()
  assert.equal(body.code, 'bridge-unavailable')
  assert.match(body.message, /sessionController/, 'the real missing-service reason must reach the user')
  assert.equal(host.calls.create.length, 0)
})
