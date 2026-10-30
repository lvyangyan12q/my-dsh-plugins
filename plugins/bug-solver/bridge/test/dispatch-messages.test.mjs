/**
 * 接缝：DispatchService.messages —— 只读对话镜像。
 * 只通过 role/before/limit 观察分页与脱敏；不存在写入路径。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServiceHarness, driveToReview } from './helpers.mjs'

const RAW = [
  { seq: 1, at: 10, role: 'user', kind: 'text', text: '看下日志 password=Hunter2' },
  { seq: 2, at: 11, role: 'assistant', kind: 'text', text: '已经定位到连接池' },
  { seq: 3, at: 12, role: 'tool', kind: 'tool', text: 'docker logs app --tail 100', toolName: 'ssh' },
  { seq: 4, at: 13, role: 'system', kind: 'notice', text: 'turn ended' },
  { seq: 5, at: 14, role: 'assistant', kind: 'text', text: '修复完成' },
]

async function runWithMessages(t) {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  const reviewRun = await driveToReview(h, run)
  h.gateway.setMessages(reviewRun.fixSessionId, RAW)
  h.gateway.setMessages(reviewRun.reviewSessionId, [
    { seq: 1, at: 20, role: 'assistant', kind: 'review', text: '{"verdict":"approve"}' },
  ])
  return { h, run: reviewRun }
}

test('returns the latest page of the read-only stream with redaction and tool classification', async (t) => {
  const { h, run } = await runWithMessages(t)
  const page = await h.service.messages(run.id, { role: 'fix' })

  assert.equal(page.runId, run.id)
  assert.equal(page.role, 'fix')
  assert.equal(page.hasMore, false)
  assert.equal(page.before, 1)
  assert.deepEqual(page.messages.map((message) => message.seq), [1, 2, 3, 4, 5])
  assert.deepEqual(Object.keys(page.messages[0]).sort(), ['at', 'kind', 'role', 'seq', 'text'])
  assert.ok(!page.messages[0].text.includes('Hunter2'))
  assert.ok(page.messages[0].text.includes('***'))
  assert.deepEqual(page.messages[2], {
    seq: 3,
    at: 12,
    role: 'tool',
    kind: 'tool',
    text: 'docker logs app --tail 100',
    toolName: 'ssh',
  })
  assert.equal(h.gateway.calls.listMessages.at(-1), run.fixSessionId)
})

test('loads the newest page first, then pages backwards with before without duplicates or gaps', async (t) => {
  const { h, run } = await runWithMessages(t)

  const latest = await h.service.messages(run.id, { role: 'fix', limit: 2 })
  assert.deepEqual(latest.messages.map((message) => message.seq), [4, 5])
  assert.equal(latest.hasMore, true)
  assert.equal(latest.before, 4)

  const older = await h.service.messages(run.id, { role: 'fix', before: latest.before, limit: 2 })
  assert.deepEqual(older.messages.map((message) => message.seq), [2, 3])
  assert.equal(older.hasMore, true)
  assert.equal(older.before, 2)

  const oldest = await h.service.messages(run.id, { role: 'fix', before: older.before, limit: 2 })
  assert.deepEqual(oldest.messages.map((message) => message.seq), [1])
  assert.equal(oldest.hasMore, false)
  assert.equal(oldest.before, 1)
})

test('a before cursor past the end still returns the latest page', async (t) => {
  const { h, run } = await runWithMessages(t)
  const page = await h.service.messages(run.id, { role: 'fix', before: 99, limit: 10 })
  assert.deepEqual(page.messages.map((message) => message.seq), [1, 2, 3, 4, 5])
  assert.equal(page.hasMore, false)
  assert.equal(page.before, 1)
})

test('review role reads the review session only', async (t) => {
  const { h, run } = await runWithMessages(t)
  const page = await h.service.messages(run.id, { role: 'review' })
  assert.deepEqual(page.messages.map((message) => message.seq), [1])
  assert.equal(page.messages[0].kind, 'review')
  assert.equal(h.gateway.calls.listMessages.at(-1), run.reviewSessionId)
})

test('review messages are unavailable before the review session exists', async (t) => {
  const h = createServiceHarness(t)
  const { run } = await h.service.start(h.draft())
  await assert.rejects(h.service.messages(run.id, { role: 'review' }), (error) => {
    assert.equal(error.code, 'session-not-available')
    assert.equal(error.status, 404)
    return true
  })
})

test('rejects unknown roles, before cursors, and limits', async (t) => {
  const { h, run } = await runWithMessages(t)
  for (const [options, code] of [
    [{ role: 'all' }, 'bad-role'],
    [{ role: 'fix', before: -1 }, 'bad-before'],
    [{ role: 'fix', before: 'x' }, 'bad-before'],
    [{ role: 'fix', before: 1.5 }, 'bad-before'],
    [{ role: 'fix', limit: 0 }, 'bad-limit'],
    [{ role: 'fix', limit: 201 }, 'bad-limit'],
    [{ role: 'fix', limit: 'many' }, 'bad-limit'],
  ]) {
    await assert.rejects(h.service.messages(run.id, options), (error) => {
      assert.equal(error.code, code)
      assert.equal(error.status, 400)
      return true
    })
  }
})

test('unknown runs are 404 and the mirror exposes no write API', async (t) => {
  const { h, run } = await runWithMessages(t)
  await assert.rejects(h.service.messages('missing-run', { role: 'fix' }), (error) => {
    assert.equal(error.code, 'run-not-found')
    assert.equal(error.status, 404)
    return true
  })
  assert.equal(typeof h.service.sendMessage, 'undefined')
  assert.equal(typeof h.service.postMessage, 'undefined')
  assert.equal(typeof h.service.updateMessage, 'undefined')
  assert.ok(!('sendMessage' in h.service))
})
