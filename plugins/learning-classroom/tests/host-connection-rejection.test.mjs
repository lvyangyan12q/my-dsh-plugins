import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestRejection } from '../src/index.ts'

const req = { headers: { host: '127.0.0.1:3091' }, method: 'GET', url: '/api/learning-classroom' }

test('rc.1 host: delegates to connection.requestRejection', () => {
  let seen
  const status = requestRejection({
    requestRejection(request) {
      seen = request
      return 403
    },
    // A 0.2.2-rc.3 host that also offered admit must not be consulted first.
    admit: () => ({ peer: {} }),
  }, req)

  assert.equal(status, 403)
  assert.equal(seen, req)
})

test('rc.1 host: an accepted request has no rejection', () => {
  assert.equal(requestRejection({ requestRejection: () => undefined }, req), undefined)
})

test('rc.3 host: maps connection.admit refusals to the route status', () => {
  assert.equal(requestRejection({ admit: () => ({ rejection: 401 }) }, req), 401)
  assert.equal(requestRejection({ admit: () => ({ rejection: 503 }) }, req), 503)
})

test('rc.3 host: an admitted peer has no rejection', () => {
  assert.equal(requestRejection({ admit: () => ({ peer: {} }) }, req), undefined)
  assert.equal(requestRejection({ admit: () => undefined }, req), undefined)
})

test('older host without either seam: the Web route keeps its own admission', () => {
  assert.equal(requestRejection({}, req), undefined)
})
