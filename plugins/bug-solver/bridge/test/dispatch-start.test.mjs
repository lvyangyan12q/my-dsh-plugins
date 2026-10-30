/**
 * 接缝：DispatchService.start —— 主接缝。只通过 start/stop/getRun 观察，
 * 用 fake SessionGateway/RunStore/Clock/Redactor，验证草稿校验、会话创建、
 * 幂等与同仓库占用。
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DispatchService } from '../lib/dispatch-service.js'
import { createRedactor } from '../lib/redact.js'
import { createFakeClock, createFakeGateway, createMemoryStore, makeDraft, promptText } from './helpers.mjs'

function harness(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bs-svc-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const gateway = createFakeGateway()
  const store = createMemoryStore()
  const clock = createFakeClock()
  const redactor = createRedactor()
  const service = new DispatchService({
    gateway,
    store,
    clock,
    redactor,
    allowedRoots: options.allowedRoots ?? [root],
  })
  const draft = (overrides = {}) => {
    const base = makeDraft()
    return {
      ...base,
      ...overrides,
      bug: { ...base.bug, ...(overrides.bug ?? {}) },
      connection: { ...base.connection, ...(overrides.connection ?? {}) },
      project: { ...base.project, localPath: root, ...(overrides.project ?? {}) },
      specRef: overrides.specRef === undefined ? base.specRef : overrides.specRef,
    }
  }
  return { root, gateway, store, clock, redactor, service, draft }
}

const expectInvalid = async (promise, code) => {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, 'invalid-draft')
    assert.equal(error.status, 422)
    assert.ok(
      error.details.some((detail) => detail.code === code),
      `expected ${code}, got ${JSON.stringify(error.details)}`,
    )
    return true
  })
}

test('start creates one fix session, renames it, and sends the round-1 plan prompt', async (t) => {
  const h = harness(t)
  const { run, idempotent } = await h.service.start(h.draft())

  assert.equal(idempotent, false)
  assert.equal(run.state, 'fix_planning')
  assert.equal(run.currentRound, 1)
  assert.equal(run.bugId, 'BUG-1')
  assert.equal(run.bugUid, 3083)
  assert.equal(run.baseBranch, 'master')
  assert.match(run.branch, /^bugfix\/3083-/)
  assert.deepEqual(run.rounds.map((round) => round.round), [1])
  assert.equal(run.rounds[0].planRequestId, `${run.id}:plan:1:1`)
  assert.equal(run.reviewSessionId, null)
  assert.equal(run.retro.state, 'pending')
  assert.equal(run.draft, undefined, 'internal draft must not leak through the public run')

  assert.equal(h.gateway.calls.create.length, 1)
  const create = h.gateway.calls.create[0]
  assert.equal(create.sessionId, run.fixSessionId)
  assert.equal(create.cwd, realpathSync(h.root))
  assert.equal(h.gateway.calls.rename.length, 1)
  assert.equal(h.gateway.calls.rename[0].sessionId, run.fixSessionId)
  assert.equal(h.gateway.calls.rename[0].title, 'BUG-3083 分析修复')

  assert.equal(h.gateway.calls.prompt.length, 1)
  const planPrompt = h.gateway.calls.prompt[0]
  assert.equal(planPrompt.sessionId, run.fixSessionId)
  assert.equal(planPrompt.requestId, `${run.id}:plan:1:1`)
  assert.equal(planPrompt.mode, 'queue')
  assert.match(promptText(planPrompt), /round-1\/plan\.md/)
  assert.match(promptText(planPrompt), /specs\/login\/spec\.md/)
  assert.match(promptText(planPrompt), /不要修改代码/)

  assert.ok(h.store.ensured.includes(run.id))
  const stored = h.store.map.get(run.id)
  assert.equal(stored.state, 'fix_planning')
  assert.ok(!JSON.stringify(stored).includes('Hunter2'), 'stored draft must be redacted')
})

test('start rejects a draft without a local repository path and creates no session', async (t) => {
  const h = harness(t)
  await expectInvalid(h.service.start(h.draft({ project: { localPath: '' } })), 'local-path-missing')
  assert.equal(h.gateway.calls.create.length, 0)
})

test('start rejects relative paths and paths outside allowedRoots', async (t) => {
  const h = harness(t)
  await expectInvalid(h.service.start(h.draft({ project: { localPath: 'repo/api' } })), 'local-path-not-absolute')

  const allowed = join(h.root, 'allowed')
  const outside = join(h.root, 'outside')
  mkdirSync(allowed)
  mkdirSync(outside)
  const restricted = new DispatchService({
    gateway: h.gateway,
    store: h.store,
    clock: h.clock,
    redactor: h.redactor,
    allowedRoots: [allowed],
  })
  await expectInvalid(restricted.start(h.draft({ project: { localPath: outside } })), 'local-path-outside-allowed-roots')
  assert.equal(h.gateway.calls.create.length, 0)
})

test('start rejects non-git and dirty workspaces', async (t) => {
  const h = harness(t)
  h.gateway.workspace.isGit = false
  await expectInvalid(h.service.start(h.draft()), 'not-a-git-repo')

  h.gateway.workspace.isGit = true
  h.gateway.workspace.dirty = true
  await expectInvalid(h.service.start(h.draft()), 'worktree-dirty')
  assert.equal(h.gateway.calls.create.length, 0)
})

test('start rejects incomplete SSH connection and missing bug id', async (t) => {
  const h = harness(t)
  await expectInvalid(h.service.start(h.draft({ connection: { user: '' } })), 'connection-incomplete')
  await expectInvalid(h.service.start(h.draft({ bug: { id: '' } })), 'bug-missing')
  assert.equal(h.gateway.calls.create.length, 0)
})

test('start rejects an unknown specRef kind', async (t) => {
  const h = harness(t)
  await expectInvalid(h.service.start(h.draft({ specRef: { kind: 'weird' } })), 'bad-spec-ref')
})

test('repeated dispatch with the same client requestId is idempotent', async (t) => {
  const h = harness(t)
  const first = await h.service.start(h.draft(), { requestId: 'click-1' })
  const second = await h.service.start(h.draft(), { requestId: 'click-1' })

  assert.equal(second.idempotent, true)
  assert.equal(second.run.id, first.run.id)
  assert.equal(h.gateway.calls.create.length, 1)
  assert.equal(h.gateway.calls.prompt.length, 1)
})

test('repeated dispatch of the same active bug returns the existing run', async (t) => {
  const h = harness(t)
  const first = await h.service.start(h.draft(), { requestId: 'click-1' })
  const second = await h.service.start(h.draft(), { requestId: 'click-2' })

  assert.equal(second.idempotent, true)
  assert.equal(second.run.id, first.run.id)
  assert.equal(h.gateway.calls.create.length, 1)
})

test('a second bug in the same repository is rejected while the first run is active', async (t) => {
  const h = harness(t)
  const first = await h.service.start(h.draft())
  await assert.rejects(h.service.start(h.draft({ bug: { id: 'BUG-2', uid: 2 } })), (error) => {
    assert.equal(error.code, 'repo-busy')
    assert.equal(error.status, 409)
    assert.equal(error.details.runId, first.run.id)
    return true
  })
})

test('a second bug in another repository starts in parallel', async (t) => {
  const h = harness(t)
  await h.service.start(h.draft())
  const other = join(h.root, 'other-repo')
  mkdirSync(other)
  const second = await h.service.start(h.draft({ bug: { id: 'BUG-2', uid: 2 }, project: { localPath: other } }))

  assert.equal(second.idempotent, false)
  assert.equal(h.gateway.calls.create.length, 2)
  assert.notEqual(h.gateway.calls.create[0].sessionId, h.gateway.calls.create[1].sessionId)
})

test('a new bug after the previous run stopped gets a new run and a new session', async (t) => {
  const h = harness(t)
  const first = await h.service.start(h.draft())
  await h.service.stop(first.run.id)
  const second = await h.service.start(h.draft({ bug: { id: 'BUG-9', uid: 9 } }))

  assert.notEqual(second.run.id, first.run.id)
  assert.notEqual(second.run.fixSessionId, first.run.fixSessionId)
  assert.equal(h.gateway.calls.create.length, 2)
})

test('session creation failure leaves a run marked unknown and never prompts', async (t) => {
  const h = harness(t)
  h.gateway.behavior.createThrows = new Error('spawn failed')
  await assert.rejects(h.service.start(h.draft()), (error) => {
    assert.equal(error.code, 'session-create-failed')
    assert.equal(error.status, 502)
    return true
  })

  const [run] = await h.store.list()
  assert.equal(run.state, 'unknown')
  assert.equal(run.error.code, 'session-create-failed')
  assert.equal(h.gateway.calls.prompt.length, 0)
})

test('a session id mismatch from the gateway is fatal and never prompts', async (t) => {
  const h = harness(t)
  h.gateway.behavior.createReturns = 'some-other-session'
  await assert.rejects(h.service.start(h.draft()), (error) => {
    assert.equal(error.code, 'session-identity-mismatch')
    assert.equal(error.status, 502)
    return true
  })

  const [run] = await h.store.list()
  assert.equal(run.state, 'unknown')
  assert.equal(h.gateway.calls.prompt.length, 0)
})

test('prompt failure is delivered-unknown: run unknown, no automatic retry', async (t) => {
  const h = harness(t)
  h.gateway.behavior.promptThrows = new Error('connection reset')
  await assert.rejects(h.service.start(h.draft()), (error) => {
    assert.equal(error.code, 'delivered-unknown')
    assert.equal(error.status, 502)
    return true
  })

  const [run] = await h.store.list()
  assert.equal(run.state, 'unknown')
  assert.equal(run.error.code, 'delivered-unknown')
  assert.equal(h.gateway.calls.prompt.length, 1)
})

test('rename failure does not abort the run', async (t) => {
  const h = harness(t)
  h.gateway.behavior.renameThrows = new Error('title service down')
  const { run } = await h.service.start(h.draft())
  assert.equal(run.state, 'fix_planning')
  assert.equal(run.warnings[0].code, 'rename-failed')
})
