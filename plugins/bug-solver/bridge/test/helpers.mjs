/** 测试用 fake 适配器：只实现 DispatchService 依赖的公开方法，记录调用供断言。 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DispatchService } from '../lib/dispatch-service.js'
import { createRedactor } from '../lib/redact.js'

export function createFakeClock(start = 1_000_000) {
  let current = start
  return {
    now: () => current,
    tick(ms = 1) {
      current += ms
      return current
    },
    set(value) {
      current = value
    },
  }
}

export function createFakeGateway() {
  const calls = {
    inspect: [],
    create: [],
    rename: [],
    prompt: [],
    cancel: [],
    sandbox: [],
    listMessages: [],
    watch: [],
    unwatch: [],
    timeline: [],
  }
  const workspace = { isGit: true, dirty: false }
  const messages = new Map()
  const finals = new Map()
  const behavior = {
    createReturns: null,
    createThrows: null,
    promptThrows: null,
    renameThrows: null,
    inspectThrows: null,
    sandboxThrows: null,
  }

  return {
    calls,
    workspace,
    behavior,
    async inspectWorkspace(cwd) {
      calls.inspect.push(cwd)
      if (behavior.inspectThrows) throw behavior.inspectThrows
      return { ...workspace }
    },
    async createSession(request) {
      calls.create.push(structuredClone(request))
      calls.timeline.push({ type: 'create', sessionId: request.sessionId, title: request.title })
      if (behavior.createThrows) throw behavior.createThrows
      return { sessionId: behavior.createReturns ?? request.sessionId }
    },
    async rename(request) {
      calls.rename.push(structuredClone(request))
      calls.timeline.push({ type: 'rename', sessionId: request.sessionId, title: request.title })
      if (behavior.renameThrows) throw behavior.renameThrows
      return { ok: true }
    },
    async prompt(request) {
      calls.prompt.push(structuredClone(request))
      calls.timeline.push({ type: 'prompt', sessionId: request.sessionId, requestId: request.requestId })
      if (behavior.promptThrows) throw behavior.promptThrows
      return { accepted: true }
    },
    async cancel(request) {
      calls.cancel.push(structuredClone(request))
      calls.timeline.push({ type: 'cancel', sessionId: request.sessionId })
      return { ok: true }
    },
    async setSandboxMode(request) {
      calls.sandbox.push(structuredClone(request))
      calls.timeline.push({ type: 'sandbox', sessionId: request.sessionId, mode: request.mode })
      if (behavior.sandboxThrows) throw behavior.sandboxThrows
      return { ok: true }
    },
    async listMessages({ sessionId }) {
      calls.listMessages.push(sessionId)
      return structuredClone(messages.get(sessionId) ?? [])
    },
    async readLastMessage(sessionId) {
      return finals.get(sessionId) ?? ''
    },
    async watchSession(request) {
      calls.watch.push(structuredClone(request))
      return { ok: true }
    },
    async unwatchSession(request) {
      calls.unwatch.push(structuredClone(request))
      return { ok: true }
    },
    setMessages(sessionId, items) {
      messages.set(sessionId, structuredClone(items))
    },
    setFinal(sessionId, text) {
      finals.set(sessionId, text)
    },
  }
}

export function createMemoryStore() {
  const map = new Map()
  const ensured = []
  return {
    map,
    ensured,
    async get(id) {
      return map.has(id) ? structuredClone(map.get(id)) : null
    },
    async list() {
      return [...map.values()].map((run) => structuredClone(run))
    },
    async put(run) {
      map.set(run.id, structuredClone(run))
      return structuredClone(run)
    },
    async remove(id) {
      map.delete(id)
    },
    async flush() {},
    async ensureRunDir(id) {
      ensured.push(id)
      return `/memory/runs/${id}`
    },
  }
}

export function makeDraft(overrides = {}) {
  return {
    runId: `draft-${Math.random().toString(16).slice(2)}`,
    bug: {
      id: 'BUG-1',
      uid: 3083,
      title: '登录失败',
      description: '用户登录报 500，password=Hunter2 出现在日志里',
      status: '待处理',
      priority: 0,
      fields: [],
    },
    connection: {
      id: 'conn-test',
      name: 'test',
      host: '10.12.139.111',
      port: '22',
      user: 'root',
      keyPath: 'C:\\keys\\id_rsa',
    },
    project: {
      id: 'proj-api',
      name: 'api',
      localPath: '',
      remotePath: '/srv/app',
      repo: 'git@example.com:team/api.git',
      defaultBranch: 'master',
    },
    specRef: { kind: 'file', path: 'specs/login/spec.md', feature: 'login' },
    container: 'docker-app',
    timeWindow: { from: '2026-10-27T00:00:00+08:00', to: '2026-10-27T12:00:00+08:00' },
    notes: '补充：只有移动端复现',
    source: { window: '窗口1', pane: 'p1' },
    ...overrides,
  }
}

/** 每个测试独立临时仓库根 + 全套 fake 依赖。 */
export function createServiceHarness(t, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bs-svc-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const gateway = options.gateway ?? createFakeGateway()
  const store = options.store ?? createMemoryStore()
  const clock = options.clock ?? createFakeClock()
  const redactor = options.redactor ?? createRedactor()
  const service = new DispatchService({
    gateway,
    store,
    clock,
    redactor,
    allowedRoots: options.allowedRoots ?? [root],
    allowedRootsProvider: options.allowedRootsProvider ?? null,
    sshConfigPath: options.sshConfigPath ?? null,
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

export async function finishPlan(h, run, reason = { kind: 'completed' }) {
  const entry = run.rounds.find((round) => round.round === run.currentRound)
  return h.service.onTurnEnd(run.fixSessionId, { requestId: entry.planRequestId, reason })
}

export async function finishImplementation(h, run, { commit = null, reason = { kind: 'completed' } } = {}) {
  const entry = run.rounds.find((round) => round.round === run.currentRound)
  return h.service.onTurnEnd(run.fixSessionId, { requestId: entry.fixRequestId, reason, commit })
}

export async function finishReview(h, run, { verdict, blocking = [], finalText, reason = { kind: 'completed' } } = {}) {
  const entry = run.rounds.find((round) => round.round === run.currentRound)
  const text = finalText ?? (verdict ? verdictText(verdict, { blocking }) : '')
  if (text) h.gateway.setFinal(run.reviewSessionId, text)
  return h.service.onTurnEnd(run.reviewSessionId, { requestId: entry.reviewRequestId, reason, finalText: text })
}

/** 从 start 一路推进到 review_running，返回刷新后的 run。 */
export async function driveToReview(h, startedRun, { commit = 'abc123' } = {}) {
  await finishPlan(h, startedRun)
  const approved = await h.service.approvePlan(startedRun.id)
  await finishImplementation(h, approved.run, { commit })
  return h.service.getRun(startedRun.id)
}

export function promptText(call) {
  return call?.content?.map((block) => block?.text ?? '').join('\n') ?? ''
}

export function verdictText(verdict, extra = {}) {
  return [
    '审核完成，结论如下：',
    '```json',
    JSON.stringify({
      verdict,
      summary: '修复方向正确',
      blocking: extra.blocking ?? [],
      tests: extra.tests ?? ['node --test'],
      ...extra,
    }),
    '```',
    '以上是说明。',
  ].join('\n')
}
