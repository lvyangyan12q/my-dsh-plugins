import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classroomFixture } from './support/fixture.mjs'
import { request } from './support/http.mjs'

test('未知 action、未知字段、非 JSON 与不支持的方法一律拒绝且不改状态', async () => {
  const fixture = await classroomFixture()
  try {
    const unknown = await fixture.post({ action: 'delete-everything' })
    assert.equal(unknown.status, 400)
    assert.equal(unknown.body.code, 'unknown-action')
    assert.match(unknown.body.error, /未知命令/)

    const extra = await fixture.post({ action: 'vault-choose', path: fixture.vault, admin: true })
    assert.equal(extra.status, 400)
    assert.equal(extra.body.code, 'invalid-command')

    const missing = await fixture.post({ path: fixture.vault })
    assert.equal(missing.status, 400)
    assert.equal(missing.body.code, 'invalid-command')

    const malformed = await fixture.post('{not json')
    assert.equal(malformed.status, 400)
    assert.equal(malformed.body.code, 'invalid-json')

    const method = await request(fixture.app.handle, { method: 'PUT', body: {} })
    assert.equal(method.status, 405)
    assert.equal(method.headers.allow, 'GET, POST')

    const content = await request(fixture.app.handle, { method: 'POST', body: { action: 'vault-choose', path: fixture.vault }, headers: { 'content-type': 'text/plain' } })
    assert.equal(content.status, 415)

    // The request cap must stay above one maximal note but still reject junk.
    const huge = await fixture.post({ action: 'vault-choose', path: 'x'.repeat(2 * 1024 * 1024 + 1024) })
    assert.equal(huge.status, 413)
    assert.equal(huge.body.code, 'request-too-large')

    const state = await fixture.get()
    assert.equal(state.body.vault.status, 'unset')
    assert.deepEqual(state.body.spaces, [])
  } finally {
    await fixture.close()
  }
})

test('同源校验拒绝未认证请求', async () => {
  const fixture = await classroomFixture({ rejection: () => 401 })
  try {
    const result = await fixture.get()
    assert.equal(result.status, 401)
    assert.equal(result.body.code, 'rejected')
  } finally {
    await fixture.close()
  }
})
