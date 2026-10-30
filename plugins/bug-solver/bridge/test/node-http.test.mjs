import test from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { registerNodeRoutes } from '../lib/node-http.js'

function fakeWebServer() {
  const routes = new Map()
  return {
    routes,
    register(spec) {
      routes.set(spec.path, spec)
      return () => routes.delete(spec.path)
    },
  }
}

function fakeRes() {
  return {
    status: null,
    headers: null,
    body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { this.body = body ? String(body) : '' },
  }
}

function fakeReq(method, url, body) {
  const req = Readable.from(body ? [Buffer.from(body)] : [])
  req.method = method
  req.url = url
  req.headers = body ? { 'content-type': 'application/json' } : {}
  return req
}

function service() {
  return {
    redactor: { redact: (value) => String(value) },
    listRuns: async () => [{ id: 'run-1', state: 'fix_planning' }],
  }
}

test('registers exact webServer routes and serves GET JSON', async () => {
  const webServer = fakeWebServer()
  const connection = { admit: () => ({}) }
  registerNodeRoutes(webServer, connection, () => service(), () => null)
  const route = webServer.routes.get('/api/bug-solver/runs')
  assert.ok(route)
  const res = fakeRes()
  await route.handler(fakeReq('GET', '/api/bug-solver/runs'), res)
  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(res.body), { runs: [{ id: 'run-1', state: 'fix_planning' }] })
})

test('rejects unauthenticated requests before the handler', async () => {
  const webServer = fakeWebServer()
  const connection = { admit: () => ({ rejection: 401 }) }
  registerNodeRoutes(webServer, connection, () => service(), () => null)
  const res = fakeRes()
  await webServer.routes.get('/api/bug-solver/runs').handler(fakeReq('GET', '/api/bug-solver/runs'), res)
  assert.equal(res.status, 401)
  assert.equal(JSON.parse(res.body).code, 'unauthorized')
})

test('reports 405 for the wrong method and 503 when service is unavailable', async () => {
  const webServer = fakeWebServer()
  const connection = { admit: () => ({}) }
  registerNodeRoutes(webServer, connection, () => null, () => '未配置 Host 服务')
  const res405 = fakeRes()
  await webServer.routes.get('/api/bug-solver/runs').handler(fakeReq('POST', '/api/bug-solver/runs'), res405)
  assert.equal(res405.status, 405)
  const res503 = fakeRes()
  await webServer.routes.get('/api/bug-solver/runs').handler(fakeReq('GET', '/api/bug-solver/runs'), res503)
  assert.equal(res503.status, 503)
  assert.match(JSON.parse(res503.body).message, /未配置 Host 服务/)
})

test('forwards POST JSON bodies to routes', async () => {
  const webServer = fakeWebServer()
  const connection = { admit: () => ({}) }
  const svc = {
    redactor: { redact: (value) => String(value) },
    approvePlan: async (runId) => ({ run: { id: runId, state: 'fix_implementing' } }),
  }
  registerNodeRoutes(webServer, connection, () => svc, () => null)
  const res = fakeRes()
  await webServer.routes.get('/api/bug-solver/approve-plan').handler(
    fakeReq('POST', '/api/bug-solver/approve-plan', JSON.stringify({ runId: 'run-1', round: 1 })),
    res,
  )
  assert.equal(res.status, 200)
  assert.deepEqual(JSON.parse(res.body).run, { id: 'run-1', state: 'fix_implementing' })
})
