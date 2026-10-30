import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'

test('apply prefers webServer exact routes over connection.fetch for plain iframe fetch', () => {
  const routes = []
  const webServer = {
    register(spec) {
      routes.push(spec)
      return () => {}
    },
  }
  const ctx = {
    connection: { admit: () => ({}), fetch: { register() { throw new Error('connection.fetch must not be used in real host') } } },
    webServer,
    logger: { warn() {} },
    get: (name) => (name === 'webServer' ? webServer : null),
    inject(_names, callback) { callback(ctx) },
    effect(fn) { fn(); return () => {} },
    on() { return () => {} },
  }
  apply(ctx, {})
  assert.equal(routes.length, 12)
  assert.deepEqual(routes.map((route) => route.path).sort(), [
    '/api/bug-solver/approve',
    '/api/bug-solver/approve-plan',
    '/api/bug-solver/artifact',
    '/api/bug-solver/messages',
    '/api/bug-solver/plan-feedback',
    '/api/bug-solver/request-changes',
    '/api/bug-solver/resume',
    '/api/bug-solver/run',
    '/api/bug-solver/runs',
    '/api/bug-solver/start',
    '/api/bug-solver/stop',
    '/api/bug-solver/writeback',
  ])
  assert.equal(typeof routes[0].handler, 'function')
  assert.equal(routes[0].methods, undefined)
})
