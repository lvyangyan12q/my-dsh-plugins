/**
 * 接缝：真实 Host 适配（HostSessionGateway）对着 fake DSH Host 的行为。
 * 覆盖创建参数/幂等、rename、sandbox、prompt requestId 与去重、turn/end 定位、
 * 权威日志重读、blocked/unknown、Stop、只读消息分页素材与脱敏。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { createHostGateway } from '../lib/host.js'
import { createRedactor } from '../lib/redact.js'
import { createFakeHost } from './fake-host.mjs'

function harness(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bs-host-'))
  mkdirSync(join(root, '.git'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const host = createFakeHost()
  const gateway = createHostGateway(host, {
    config: { allowedRoots: [root], dirtyCheck: false, ...(options.config ?? {}) },
    redactor: createRedactor(),
    runGit: async () => '',
    ...(options.gateway ?? {}),
  })
  t.after(() => gateway.dispose())
  return { root, host, gateway }
}

test('createSession: realpath workspace, pre-generated id, identity check, workspace-write', async (t) => {
  const { root, host, gateway } = harness(t)
  const created = await gateway.createSession({ cwd: root, sessionId: 'fix-1', title: 'BUG-3083 分析修复' })

  assert.deepEqual(created, { sessionId: 'fix-1', workspaceId: 'ws-1' })
  assert.deepEqual(host.calls.workspaceCreate, [realpathSync(root)])
  assert.deepEqual(host.calls.create, [{ workspaceId: 'ws-1', sessionId: 'fix-1' }])
  assert.equal(host.calls.flush, 1, 'create must flush before returning')

  const events = host.sessions.get('fix-1').events
  const sandbox = events.filter((event) => event.type === 'sandbox/mode')
  assert.equal(sandbox.length, 1)
  assert.equal(sandbox[0].data.mode, 'workspace-write', 'fix session is writable')

  // create 不带 title；rename 由状态机显式调用（DSH create 没有 title 字段）。
  assert.equal(host.calls.rename.length, 0)
  await gateway.rename({ sessionId: 'fix-1', title: 'BUG-3083 分析修复' })
  assert.deepEqual(host.calls.rename, [{ sessionId: 'fix-1', title: 'BUG-3083 分析修复' }])
  assert.equal(events.at(-1).type, 'session/title')
})

test('createSession refuses an identity that already exists and never creates a second time', async (t) => {
  const { root, host, gateway } = harness(t)
  host.stored.add('fix-1')
  await assert.rejects(gateway.createSession({ cwd: root, sessionId: 'fix-1' }), /已存在/)
  assert.equal(host.calls.create.length, 0)
})

test('createSession treats a different returned id as fatal (no retry)', async (t) => {
  const { root, host, gateway } = harness(t)
  host.behavior.createReturns = 'other-id'
  await assert.rejects(gateway.createSession({ cwd: root, sessionId: 'fix-1' }), /不一致/)
  assert.equal(host.calls.create.length, 1, 'identity mismatch must not be retried')
})

test('createSession enforces allowedRoots again and rejects non-absolute cwd', async (t) => {
  const { root, gateway } = harness(t)
  const outside = mkdtempSync(join(tmpdir(), 'bs-outside-'))
  t.after(() => rmSync(outside, { recursive: true, force: true }))
  await assert.rejects(gateway.createSession({ cwd: outside, sessionId: 'x' }), /allowedRoots/)
  await assert.rejects(gateway.createSession({ cwd: 'relative/dir', sessionId: 'x' }), /绝对路径/)
  assert.equal(root.length > 0, true)
})

test('createSession accepts a root added by the window2 provider (allowedRoots union)', async (t) => {
  const { root } = harness(t)
  const extra = mkdtempSync(join(tmpdir(), 'bs-extra-'))
  mkdirSync(join(extra, '.git'))
  t.after(() => rmSync(extra, { recursive: true, force: true }))

  const host = createFakeHost()
  const gateway = createHostGateway(host, {
    config: { allowedRoots: [root], dirtyCheck: false },
    allowedRootsProvider: async () => [extra],
    runGit: async () => '',
  })
  t.after(() => gateway.dispose())

  const created = await gateway.createSession({ cwd: extra, sessionId: 'fix-extra' })
  assert.equal(created.sessionId, 'fix-extra')
  assert.equal(host.calls.create.length, 1)
})

test('prompt sends a deterministic requestId in queue mode with a timeout signal, and dedupes', async (t) => {
  const { host, gateway } = harness(t)
  assert.equal(gateway.promptTimeoutMs, 0, 'no fixed prompt timeout is baked in')
  await gateway.prompt({
    sessionId: 'fix-1',
    requestId: 'run-1:plan:1:1',
    mode: 'queue',
    content: [{ type: 'text', text: '先出方案' }],
  })
  assert.equal(host.calls.prompt.length, 1)
  const call = host.calls.prompt[0]
  assert.equal(call.sessionId, 'fix-1')
  assert.equal(call.requestId, 'run-1:plan:1:1')
  assert.equal(call.mode, 'queue')
  assert.deepEqual(call.content, [{ type: 'text', text: '先出方案' }])
  assert.ok(call.signal instanceof AbortSignal, 'prompt admission needs an AbortSignal')

  const duplicate = await gateway.prompt({
    sessionId: 'fix-1',
    requestId: 'run-1:plan:1:1',
    content: [{ type: 'text', text: '先出方案' }],
  })
  assert.deepEqual(duplicate, { accepted: true, duplicate: true })
  assert.equal(host.calls.prompt.length, 1, 'same requestId is never delivered twice')

  await gateway.prompt({ sessionId: 'fix-1', requestId: 'run-1:fix:1', content: [{ type: 'text', text: '实现' }] })
  assert.equal(host.calls.prompt.length, 2)
  assert.equal(host.calls.prompt[1].requestId, 'run-1:fix:1')
})

test('turn/end is matched by rpcId and turn, then read back from the flushed log', async (t) => {
  const { host, gateway } = harness(t)
  const completed = []
  gateway.onTurnEnd = (sessionId, payload) => completed.push({ sessionId, ...payload })
  host.ensureSession('fix-1')
  await gateway.prompt({ sessionId: 'fix-1', requestId: 'run-1:plan:1:1', content: [{ type: 'text', text: 'plan' }] })

  host.completeTurn('fix-1', 'run-1:plan:1:1', { finalText: '方案：改 A、测 B' })
  await gateway.whenIdle()

  assert.equal(completed.length, 1)
  assert.equal(completed[0].sessionId, 'fix-1')
  assert.equal(completed[0].requestId, 'run-1:plan:1:1')
  assert.deepEqual(completed[0].reason, { kind: 'completed' })
  assert.equal(completed[0].finalText, '方案：改 A、测 B')
  assert.ok(host.calls.open.some((row) => row.sessionId === 'fix-1' && row.access === 'read'))
})

test('a turn/end whose user/message rpcId never matched is ignored (late prompt wins)', async (t) => {
  const { host, gateway } = harness(t)
  const completed = []
  gateway.onTurnEnd = (sessionId, payload) => completed.push(payload)
  host.ensureSession('fix-1')
  await gateway.prompt({ sessionId: 'fix-1', requestId: 'run-1:plan:1:1', content: [{ type: 'text', text: 'plan' }] })

  host.completeTurn('fix-1', 'not-our-request', { finalText: '别人的 turn' })
  await gateway.whenIdle()
  assert.equal(completed.length, 0, 'non-matching rpcId must not complete the pending request')

  host.completeTurn('fix-1', 'run-1:plan:1:1', { finalText: '我们的 turn' })
  await gateway.whenIdle()
  assert.equal(completed.length, 1)
  assert.equal(completed[0].finalText, '我们的 turn')
})

test('the durable log outranks the live turn/end event', async (t) => {
  const { host, gateway } = harness(t)
  const completed = []
  gateway.onTurnEnd = (sessionId, payload) => completed.push(payload)
  host.ensureSession('fix-1')
  await gateway.prompt({ sessionId: 'fix-1', requestId: 'run-1:fix:1', content: [{ type: 'text', text: 'fix' }] })

  host.completeTurn('fix-1', 'run-1:fix:1', { finalText: 'done' })
  host.setBeforeFlush(() => {
    host.patchLog('fix-1', (events) => {
      const end = [...events].reverse().find((event) => event.type === 'turn/end')
      end.data.reason = { kind: 'error', error: { message: 'adapter exploded' } }
    })
  })
  await gateway.whenIdle()

  assert.equal(completed.length, 1)
  assert.equal(completed[0].reason.kind, 'error')
  assert.equal(completed[0].reason.error.message, 'adapter exploded')
})

test('aborted, blocked, error, and interrupted reasons pass through unchanged', async (t) => {
  const { host, gateway } = harness(t)
  const seen = []
  gateway.onTurnEnd = (sessionId, payload) => seen.push(payload.reason)
  host.ensureSession('fix-1')

  for (const [round, stage, reason] of [
    [1, 'plan', { kind: 'aborted', reason: { kind: 'user' } }],
    [1, 'fix', { kind: 'blocked' }],
    [2, 'plan', { kind: 'error', error: { message: 'boom' } }],
    [2, 'review', { kind: 'interrupted' }],
  ]) {
    const requestId = `run-1:${stage}:${round}`
    await gateway.prompt({ sessionId: 'fix-1', requestId, content: [{ type: 'text', text: stage }] })
    host.completeTurn('fix-1', requestId, { reason })
  }
  await gateway.whenIdle()
  assert.deepEqual(seen, [
    { kind: 'aborted', reason: { kind: 'user' } },
    { kind: 'blocked' },
    { kind: 'error', error: { message: 'boom' } },
    { kind: 'interrupted' },
  ])
})

test('Stop cancels the session through sessionController and keeps no delete API', async (t) => {
  const { host, gateway } = harness(t)
  await gateway.cancel({ sessionId: 'fix-1' })
  assert.deepEqual(host.calls.cancel, [{ sessionId: 'fix-1' }])
  assert.equal(typeof gateway.deleteSession, 'undefined')
  assert.equal(typeof gateway.removeSession, 'undefined')
})

test('listMessages maps the log to redacted user/assistant/tool/plan/review entries', async (t) => {
  const { host, gateway, root } = harness(t)
  host.ensureSession('fix-1', root)
  host.emit('fix-1', 'turn/start', { turn: 1 })
  host.emit('fix-1', 'user/message', {
    message: { role: 'user', content: [{ type: 'text', text: '日志里 password=Hunter2' }] },
    source: { kind: 'user', rpcId: 'run-1:plan:1:1' },
  })
  host.emit('fix-1', 'assistant/message', {
    turn: 1,
    step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: '看到连接池耗尽' }], source: { kind: 'model' } },
    stream: [],
  })
  host.emit('fix-1', 'tool/call', {
    turn: 1,
    step: 1,
    callId: 'c1',
    name: 'bash',
    arguments: JSON.stringify({ command: 'ssh root@10.0.0.1 docker logs app | grep ERROR' }),
  })
  host.emit('fix-1', 'tool/result', {
    turn: 1,
    step: 1,
    message: {
      role: 'tool',
      toolCallId: 'c1',
      content: [{ type: 'text', text: 'ERROR boom password=Hunter2' }],
      source: { kind: 'tool' },
    },
  })
  host.emit('fix-1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })

  host.ensureSession('review-1', root)
  host.emit('review-1', 'turn/start', { turn: 2 })
  host.emit('review-1', 'user/message', {
    message: { role: 'user', content: [{ type: 'text', text: '请审核' }] },
    source: { kind: 'user', rpcId: 'run-1:review:1' },
  })
  host.emit('review-1', 'assistant/message', {
    turn: 2,
    step: 1,
    message: { role: 'assistant', content: [{ type: 'text', text: '```json\n{"verdict":"approve"}\n```' }], source: { kind: 'model' } },
    stream: [],
  })
  host.emit('review-1', 'turn/end', { turn: 2, reason: { kind: 'completed' } })

  const fix = await gateway.listMessages({ sessionId: 'fix-1' })
  assert.equal(fix.length, 4)
  assert.deepEqual(fix.map((message) => message.role), ['user', 'assistant', 'tool', 'tool'])
  assert.ok(fix[0].text.includes('***') && !fix[0].text.includes('Hunter2'))
  assert.equal(fix[1].kind, 'plan', 'assistant text in a plan turn is labeled plan')
  assert.equal(fix[2].kind, 'tool')
  assert.equal(fix[2].toolName, 'ssh', 'ssh inside a bash command is classified as ssh')
  assert.match(fix[2].text, /docker logs app/)
  assert.equal(fix[3].toolName, 'ssh')
  assert.ok(!fix[3].text.includes('Hunter2'))
  assert.deepEqual(
    fix.map((message) => message.seq),
    [...fix.map((message) => message.seq)].sort((a, b) => a - b),
    'messages keep log order',
  )

  const review = await gateway.listMessages({ sessionId: 'review-1' })
  assert.equal(review[0].kind, 'text')
  assert.equal(review[1].role, 'assistant')
  assert.equal(review[1].kind, 'review', 'assistant text in a review turn is labeled review')
  assert.match(await gateway.readLastMessage('review-1'), /approve/)
  assert.ok(!(await gateway.readLastMessage('review-1')).includes('Hunter2'))
})

test('dirty detection reports git status while .bug-solver artifacts are ignored', async (t) => {
  const { root } = harness(t)
  const host = createFakeHost()

  const dirtyGateway = createHostGateway(host, {
    config: { allowedRoots: [root], dirtyCheck: true },
    runGit: async () => ' M src/app.js\n?? .bug-solver/runs/x/round-1/plan.md\n',
  })
  t.after(() => dirtyGateway.dispose())
  assert.deepEqual(await dirtyGateway.inspectWorkspace(root), { isGit: true, dirty: true })

  const artifactsOnly = createHostGateway(host, {
    config: { allowedRoots: [root], dirtyCheck: true },
    runGit: async () => '?? .bug-solver/runs/x/round-1/plan.md\n',
  })
  t.after(() => artifactsOnly.dispose())
  assert.deepEqual(await artifactsOnly.inspectWorkspace(root), { isGit: true, dirty: false })
})

test('watchSession reports the next unsolicited turn/end as the user answer', async (t) => {
  const { host, gateway } = harness(t)
  const seen = []
  gateway.onTurnEnd = (sessionId, payload) => seen.push({ sessionId, ...payload })
  host.ensureSession('fix-1')
  await gateway.prompt({ sessionId: 'fix-1', requestId: 'run-1:plan:1:1', content: [{ type: 'text', text: 'plan' }] })

  host.completeTurn('fix-1', 'run-1:plan:1:1', { reason: { kind: 'blocked' } })
  await gateway.whenIdle()
  assert.equal(seen.length, 1)
  assert.equal(seen[0].reason.kind, 'blocked')

  gateway.watchSession({ sessionId: 'fix-1', requestId: 'run-1:plan:1:1' })
  host.completeTurn('fix-1', 'user-reply-rpc', { finalText: '用户回答' })
  await gateway.whenIdle()

  assert.equal(seen.length, 2)
  assert.equal(seen[1].sessionId, 'fix-1')
  assert.equal(seen[1].requestId, 'run-1:plan:1:1')
  assert.equal(seen[1].unsolicited, true)
  assert.equal(seen[1].reason.kind, 'completed')
})

test('unwatchSession cancels the pending watch', async (t) => {
  const { host, gateway } = harness(t)
  const seen = []
  gateway.onTurnEnd = (sessionId, payload) => seen.push(payload)
  host.ensureSession('fix-1')
  gateway.watchSession({ sessionId: 'fix-1', requestId: 'run-1:plan:1:1' })
  gateway.unwatchSession({ sessionId: 'fix-1' })
  host.completeTurn('fix-1', 'user-reply-rpc', {})
  await gateway.whenIdle()
  assert.equal(seen.length, 0)
})
