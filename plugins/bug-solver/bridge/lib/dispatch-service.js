/**
 * DispatchService：窗口3 的确定性编排状态机。
 *
 * draft -> confirmed -> fix_planning -> awaiting_plan_approval
 *   approve-plan -> fix_implementing -> fix_done -> review_starting -> review_running
 *   plan-feedback -> fix_planning（同一轮、同一修复会话）
 * review_running -> review_done
 *   approve -> awaiting_user_approval -> approved
 *   request_changes -> fix_planning（下一轮、复用同一对会话）
 *   needs_info / 解析失败 / blocked -> needs_attention
 * needs_attention ->（用户回答后的 turn/end 或 POST /resume）-> 暂停前阶段，重发该阶段 prompt
 * 无进展 / Stop / unknown 均暂停，不自动重发。
 *
 * 依赖全部注入：SessionGateway、RunStore、Clock、Redactor、allowedRoots/sshConfigPath。本文件不 import DSH。
 */
import { randomUUID } from 'node:crypto'
import { BridgeError, ConflictError, NotFoundError, ValidationError, BadRequestError } from './errors.js'
import { resolveAllowedPath } from './paths.js'
import { buildImplementPrompt, buildPlanPrompt, buildReviewPrompt } from './prompts.js'
import { parseVerdict } from './verdict.js'
import { buildRequestId } from './session-log.js'
import {
  artifactExists,
  listArtifacts,
  readArtifact,
  validateResultManifest,
  writeArtifact,
} from './artifacts.js'
import { applyWriteback, readSshConfig, writeSshConfig } from './ssh-config.js'

export const TERMINAL_STATES = new Set(['approved', 'stopped', 'unknown', 'fix_failed', 'review_failed'])
const SPEC_KINDS = new Set(['file', 'url', 'none'])
const MESSAGE_ROLES = new Set(['user', 'assistant', 'tool', 'system'])
const MESSAGE_KINDS = new Set(['text', 'tool', 'plan', 'review', 'notice'])
const MIRROR_ROLES = new Set(['fix', 'review'])
const MAX_PLAN_TEXT_CHARS = 20_000

const nonEmpty = (value) => typeof value === 'string' && value.trim() !== ''

/** 暂停原因 → 暂停前阶段（决定 resume 时重发哪个 prompt）。 */
export function pausedStage(from) {
  if (from === 'fix_planning') return 'plan'
  if (from === 'fix_implementing') return 'fix'
  if (from === 'fix_done' || from === 'review_starting' || from === 'review_running' || from === 'review_done') {
    return 'review'
  }
  return null
}

function sessionForStage(run, stage) {
  if (stage === 'review') return run.reviewSessionId ?? null
  if (stage === 'plan' || stage === 'fix') return run.fixSessionId ?? null
  return null
}

function redactDraft(redactor, draft) {
  const copy = structuredClone(draft)
  if (copy?.bug) {
    if (typeof copy.bug.title === 'string') copy.bug.title = redactor.redact(copy.bug.title)
    if (typeof copy.bug.description === 'string') copy.bug.description = redactor.redact(copy.bug.description)
    if (Array.isArray(copy.bug.fields)) {
      copy.bug.fields = copy.bug.fields.map((field) => {
        if (typeof field === 'string') return redactor.redact(field)
        if (field && typeof field === 'object' && typeof field.value === 'string') {
          return { ...field, value: redactor.redact(field.value) }
        }
        return field
      })
    }
  }
  if (typeof copy?.notes === 'string') copy.notes = redactor.redact(copy.notes)
  return copy
}

function normalizeSpecRef(specRef, errors) {
  if (specRef === undefined || specRef === null) return { kind: 'none', path: null, feature: null }
  if (typeof specRef !== 'object' || !SPEC_KINDS.has(specRef.kind)) {
    errors.push({ field: 'specRef.kind', code: 'bad-spec-ref', message: 'specRef.kind 必须是 file|url|none' })
    return { kind: 'none', path: null, feature: null }
  }
  return {
    kind: specRef.kind,
    path: typeof specRef.path === 'string' && specRef.path.trim() ? specRef.path.trim() : null,
    feature: typeof specRef.feature === 'string' && specRef.feature.trim() ? specRef.feature.trim() : null,
  }
}

function roundEntry(round) {
  return {
    round,
    planRequestId: null,
    planAttempt: 0,
    planFeedback: '',
    planText: null,
    planApprovedAt: null,
    planApprovedNote: null,
    fixRequestId: null,
    fixAttempt: 0,
    reviewRequestId: null,
    reviewAttempt: 0,
    planPath: `round-${round}/plan.md`,
    completedAt: null,
    commit: null,
    diffPath: `round-${round}/diff.patch`,
    verdict: null,
    reviewPath: `round-${round}/review.md`,
    reviewBlocking: [],
    reviewSummary: null,
    reviewTests: [],
    reviewRaw: null,
    manifest: null,
    manifestErrors: [],
  }
}

/**
 * 对外 run（页面契约，唯一字段名）：
 * - `bug` / `connection` / `project` 从已脱敏草稿带出，不再让页面显示空标题/「—」；
 * - `needsAttention` 是 needs_attention 的唯一对外字段（内部仍叫 attention）；
 * - 每轮带 `review {verdict, blocking, summary, tests}` 与 `planText`，顶层 `plan`/`review` 指向当前轮；
 * - 不暴露草稿原文、requestId 台账、pending 与内部绝对路径。
 */
export function publicRun(run) {
  if (!run) return null
  const { draft, requestIds, pending, startRequestId, localPath, attention, ...rest } = run
  const copy = structuredClone(rest)
  const source = draft ?? {}

  copy.bug = source.bug ? structuredClone(source.bug) : null
  if (copy.bug) {
    if (!nonEmpty(copy.bug.title)) copy.bug.title = `BUG-${run.bugUid ?? run.bugId}`
  }
  copy.connection = source.connection ? structuredClone(source.connection) : null
  if (copy.connection && !nonEmpty(copy.connection.name)) {
    copy.connection.name = copy.connection.host || copy.connection.id || 'SSH 连接'
  }
  copy.project = source.project ? structuredClone(source.project) : null
  if (copy.project && !nonEmpty(copy.project.name)) {
    copy.project.name = copy.project.id || copy.project.localPath || '代码项目'
  }
  const services = copy.bug && Array.isArray(copy.bug.services) ? copy.bug.services : []
  copy.service = services.length > 0 && nonEmpty(services[0]) ? services[0].trim() : null

  copy.needsAttention = attention ? { ...structuredClone(attention), reason: attention.message } : null
  copy.rounds = (run.rounds ?? []).map((entry) => {
    // 只暴露 review 对象这一种审核字段：内部 reviewRaw / manifest / 旧 review* 不出现。
    const {
      reviewRaw,
      manifest,
      reviewBlocking,
      reviewSummary,
      reviewTests,
      reviewPath,
      verdict,
      ...roundRest
    } = entry
    const review =
      verdict || reviewSummary || (reviewBlocking ?? []).length > 0
        ? {
            verdict: verdict ?? null,
            summary: reviewSummary ?? null,
            blocking: Array.isArray(reviewBlocking) ? [...reviewBlocking] : [],
            tests: Array.isArray(reviewTests) ? [...reviewTests] : [],
            path: reviewPath ?? null,
          }
        : null
    return { ...structuredClone(roundRest), review }
  })
  const current =
    copy.rounds.find((round) => round.round === copy.currentRound) ??
    copy.rounds[copy.rounds.length - 1] ??
    null
  copy.plan = current?.planText ?? null
  copy.review = current?.review ?? null
  return copy
}

export class DispatchService {
  constructor({
    gateway,
    store,
    clock,
    redactor,
    allowedRoots = [],
    allowedRootsProvider = null,
    sshConfigPath = null,
  } = {}) {
    if (!gateway) throw new BridgeError('bridge/no-gateway', 'DispatchService 需要 SessionGateway', { status: 500 })
    if (!store) throw new BridgeError('bridge/no-store', 'DispatchService 需要 RunStore', { status: 500 })
    if (!clock) throw new BridgeError('bridge/no-clock', 'DispatchService 需要 Clock', { status: 500 })
    if (!redactor) throw new BridgeError('bridge/no-redactor', 'DispatchService 需要 Redactor', { status: 500 })
    this.gateway = gateway
    this.store = store
    this.clock = clock
    this.redactor = redactor
    this.allowedRoots = Array.isArray(allowedRoots) ? allowedRoots : []
    this.allowedRootsProvider = typeof allowedRootsProvider === 'function' ? allowedRootsProvider : null
    this.sshConfigPath = nonEmpty(sshConfigPath) ? sshConfigPath : null
  }

  // ---------------------------------------------------------------- 查询

  async listRuns() {
    const runs = (await this.store.list()).map(publicRun)
    return runs.sort((a, b) => b.createdAt - a.createdAt || String(a.id).localeCompare(String(b.id)))
  }

  async getRun(runId) {
    return publicRun(await this.#requireRun(runId))
  }

  async #requireRun(runId) {
    if (!nonEmpty(runId)) throw new BadRequestError('bad-request', '缺少 runId')
    const run = await this.store.get(runId)
    if (!run) throw new NotFoundError('run-not-found', `未知 run：${runId}`, { details: { runId } })
    return run
  }

  // ---------------------------------------------------------------- 只读对话镜像

  /**
   * 只读消息：按 role(fix|review) + before(seq 水位，向后取更早) + limit 分页，文本统一脱敏。
   * 不传 before 时返回最新一页；响应里的 `before` 是下一页「加载更早」的游标。
   * 没有发送/编辑/审批入口；镜像不能改变会话或 run 状态。
   */
  async messages(runId, { role, before = null, limit = 50 } = {}) {
    const run = await this.#requireRun(runId)
    if (!MIRROR_ROLES.has(role)) {
      throw new BadRequestError('bad-role', 'role 必须是 fix 或 review', { details: { field: 'role' } })
    }
    if (before !== null && (!Number.isInteger(before) || before < 0)) {
      throw new BadRequestError('bad-before', 'before 必须是 >= 0 的整数或省略', { details: { field: 'before' } })
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw new BadRequestError('bad-limit', 'limit 必须是 1..200 的整数', { details: { field: 'limit' } })
    }
    const sessionId = role === 'fix' ? run.fixSessionId : run.reviewSessionId
    if (!sessionId) {
      throw new NotFoundError('session-not-available', `run 还没有 ${role} 会话`, { details: { runId: run.id, role } })
    }

    let raw
    try {
      raw = await this.gateway.listMessages({ sessionId })
    } catch (cause) {
      throw new BridgeError('messages-read-failed', this.redactor.redact(cause?.message ?? cause), {
        status: 502,
        details: { runId: run.id, role },
      })
    }

    const items = (Array.isArray(raw) ? raw : [])
      .filter((item) => item && Number.isFinite(Number(item.seq)))
      .map((item) => {
        const text = this.redactor.redact(item.text)
        const message = {
          seq: Number(item.seq),
          at: Number.isFinite(Number(item.at)) ? Number(item.at) : 0,
          role: MESSAGE_ROLES.has(item.role) ? item.role : 'system',
          kind: MESSAGE_KINDS.has(item.kind) ? item.kind : item.toolName ? 'tool' : 'text',
          text,
        }
        if (item.toolName) message.toolName = String(item.toolName)
        return message
      })
      .sort((a, b) => a.seq - b.seq)

    const messages =
      before === null ? items.slice(-limit) : items.filter((message) => message.seq < before).slice(-limit)
    const oldest = messages.length > 0 ? messages[0].seq : null
    const hasMore = oldest !== null && items.some((message) => message.seq < oldest)
    return { runId: run.id, role, messages, before: oldest, hasMore }
  }

  // ---------------------------------------------------------------- 产物

  /** 只读产物：名字限制在 run 目录内，大小受限，文本脱敏。 */
  async artifact(runId, name) {
    const run = await this.#requireRun(runId)
    return readArtifact(run.localPath, run.id, name, { redactor: this.redactor })
  }

  #readArtifactText(run, name) {    try {
      return readArtifact(run.localPath, run.id, name, { redactor: this.redactor }).text
    } catch {
      return null
    }
  }

  async #writeRoundArtifact(run, name, text) {
    try {
      await writeArtifact(run.localPath, run.id, name, text)
    } catch (cause) {
      this.#warn(run, 'artifact-write-failed', cause)
    }
  }

  #refreshArtifacts(run) {
    try {
      run.artifacts = listArtifacts(run.localPath, run.id)
    } catch (cause) {
      this.#warn(run, 'artifacts-list-failed', cause)
    }
  }

  // ---------------------------------------------------------------- 写回窗口2

  /**
   * 确认页补的 localPath / serviceMap 校验后写回 `data/ssh-config.json`。
   * 未配置 sshConfigPath/projectDir 时明确 503，不静默假装成功。
   */
  async writeBack({ projectId, localPath, serviceMap } = {}) {
    if (!this.sshConfigPath) {
      throw new BridgeError('writeback-not-configured', '桥未配置 sshConfigPath/projectDir，无法写回窗口2', {
        status: 503,
      })
    }
    const config = await readSshConfig(this.sshConfigPath)
    if (!config) {
      throw new NotFoundError('ssh-config-not-found', `没有找到窗口2 配置：${this.sshConfigPath}`, {
        details: { path: this.sshConfigPath },
      })
    }
    if (localPath === undefined && serviceMap === undefined) {
      throw new BadRequestError('writeback-empty', 'writeback 至少需要 localPath 或 serviceMap')
    }
    const result = applyWriteback(config, { projectId, localPath, serviceMap })
    await writeSshConfig(this.sshConfigPath, result.config)
    return {
      ok: true,
      path: this.sshConfigPath,
      version: result.config.version,
      updated: result.updated,
      sha256: result.sha256,
    }
  }

  // ---------------------------------------------------------------- 启动

  async start(draft, { requestId } = {}) {
    const startRequestId =
      nonEmpty(requestId) ? requestId.trim() : nonEmpty(draft?.requestId) ? draft.requestId.trim() : null
    if (startRequestId) {
      const existing = (await this.store.list()).find((run) => run.startRequestId === startRequestId)
      if (existing) return { run: publicRun(existing), idempotent: true }
    }

    const { canonicalPath, specRef } = await this.#validateDraft(draft)
    const runs = await this.store.list()
    const bugId = draft.bug.id.trim()
    const sameBug = runs.find((run) => run.bugId === bugId && !TERMINAL_STATES.has(run.state))
    if (sameBug) return { run: publicRun(sameBug), idempotent: true }

    const busy = runs.find((run) => run.localPath === canonicalPath && !TERMINAL_STATES.has(run.state))
    if (busy) {
      throw new ConflictError('repo-busy', `同一本地仓库已有活跃 run：${busy.id}`, {
        details: { runId: busy.id, state: busy.state },
      })
    }

    const now = this.clock.now()
    const id = randomUUID()
    const bugUid = Number.isInteger(draft.bug.uid) ? draft.bug.uid : null
    const storedDraft = structuredClone(draft)
    storedDraft.project = { ...storedDraft.project, localPath: canonicalPath }
    const run = {
      version: 1,
      id,
      bugId,
      bugUid,
      state: 'draft',
      specRef,
      fixSessionId: randomUUID(),
      reviewSessionId: null,
      currentRound: 1,
      rounds: [],
      commits: [],
      branch: `bugfix/${bugUid ?? bugId}-${id}`,
      baseBranch: nonEmpty(draft.project?.baseBranch)
        ? draft.project.baseBranch.trim()
        : nonEmpty(draft.project?.defaultBranch)
          ? draft.project.defaultBranch.trim()
          : 'master',
      artifacts: [],
      retro: { state: 'pending', sessionId: null, reportPath: null },
      error: null,
      createdAt: now,
      updatedAt: now,
      approvedAt: null,
      localPath: canonicalPath,
      draft: redactDraft(this.redactor, storedDraft),
      pending: null,
      attention: null,
      resumeNote: null,
      requestIds: [],
      startRequestId,
      warnings: [],
    }

    await this.store.put(run)
    if (typeof this.store.ensureRunDir === 'function') await this.store.ensureRunDir(run.id)

    run.state = 'confirmed'
    await this.save(run)

    const title = `BUG-${bugUid ?? bugId} 分析修复`
    let created
    try {
      created = await this.gateway.createSession({ cwd: canonicalPath, sessionId: run.fixSessionId, title })
    } catch (cause) {
      await this.#markUnknown(run, 'session-create-failed', cause)
      throw new BridgeError('session-create-failed', '创建修复会话失败，结果未知（不自动重试）', {
        status: 502,
        details: { runId: run.id, cause: this.redactor.redact(cause?.message ?? cause) },
      })
    }
    if (created?.sessionId !== run.fixSessionId) {
      await this.#markUnknown(run, 'session-identity-mismatch', new Error(`created=${created?.sessionId}`))
      throw new BridgeError('session-identity-mismatch', '修复会话 id 与预生成 id 不一致（不自动重试）', {
        status: 502,
        details: { runId: run.id, expected: run.fixSessionId, actual: created?.sessionId ?? null },
      })
    }

    try {
      await this.gateway.rename({ sessionId: run.fixSessionId, title })
    } catch (cause) {
      this.#warn(run, 'rename-failed', cause)
    }

    const delivered = await this.#beginPlan(run, { round: 1, attempt: 1 }).catch((cause) => {
      if (cause?.code !== 'delivered-unknown') throw cause
      return { error: cause }
    })
    if (delivered?.error) {
      throw new BridgeError('delivered-unknown', '方案 prompt 发送失败，结果未知（不自动重发）', {
        status: 502,
        details: { runId: run.id, sessionId: run.fixSessionId, cause: this.redactor.redact(delivered.error.message) },
      })
    }

    return { run: publicRun(run), idempotent: false }
  }

  async #allowedRootsForStart() {
    const roots = [...this.allowedRoots]
    if (this.allowedRootsProvider) {
      try {
        const extra = await this.allowedRootsProvider()
        if (Array.isArray(extra)) roots.push(...extra.filter((root) => nonEmpty(root)))
      } catch {
        // 窗口2 配置不可读时只用插件静态 allowedRoots；start 的路径校验仍会给出具体错误。
      }
    }
    return roots
  }

  async #validateDraft(draft) {
    if (!draft || typeof draft !== 'object') {
      throw new ValidationError([{ field: 'draft', code: 'bad-draft', message: '缺少 DispatchDraft' }])
    }
    const errors = []
    const bug = draft.bug ?? {}
    if (!nonEmpty(bug.id)) errors.push({ field: 'bug.id', code: 'bug-missing', message: '缺少缺陷编号' })
    const connection = draft.connection ?? {}
    if (!nonEmpty(connection.host)) {
      errors.push({ field: 'connection.host', code: 'connection-incomplete', message: '缺少 SSH host' })
    }
    if (!nonEmpty(connection.user)) {
      errors.push({ field: 'connection.user', code: 'connection-incomplete', message: '缺少 SSH user' })
    }

    let canonicalPath = null
    try {
      canonicalPath = resolveAllowedPath(draft.project?.localPath, await this.#allowedRootsForStart())
    } catch (error) {
      if (Array.isArray(error?.details)) errors.push(...error.details)
      else errors.push({ field: 'project.localPath', code: error?.code ?? 'local-path-invalid', message: String(error?.message ?? error) })
    }

    const specRef = normalizeSpecRef(draft.specRef, errors)

    if (canonicalPath && typeof this.gateway.inspectWorkspace === 'function') {
      try {
        const info = await this.gateway.inspectWorkspace(canonicalPath)
        if (info?.isGit === false) {
          errors.push({ field: 'project.localPath', code: 'not-a-git-repo', message: '本地仓库路径不是 git 仓库' })
        }
        if (info?.dirty === true) {
          errors.push({ field: 'project.localPath', code: 'worktree-dirty', message: '仓库有未提交改动，请先提交或 stash' })
        }
      } catch (error) {
        errors.push({
          field: 'project.localPath',
          code: 'workspace-inspect-failed',
          message: this.redactor.redact(error?.message ?? error),
        })
      }
    }

    if (errors.length > 0) throw new ValidationError(errors)
    return { canonicalPath, specRef }
  }

  // ---------------------------------------------------------------- 内部工具

  async save(run) {
    run.updatedAt = this.clock.now()
    await this.store.put(run)
    return run
  }

  /** warnings 统一入口（只写内存；由调用方 save）。 */
  #warn(run, code, cause) {
    const message = this.redactor.redact(cause?.message ?? String(cause ?? ''))
    run.warnings.push({ code, message, at: this.clock.now() })
    return run.warnings[run.warnings.length - 1]
  }

  async #markUnknown(run, code, cause) {
    run.state = 'unknown'
    run.pending = null
    run.attention = null
    run.error = {
      code,
      message: this.redactor.redact(cause?.message ?? String(cause ?? '')),
      at: this.clock.now(),
    }
    await this.save(run)
  }

  async #sendPrompt(run, { sessionId, requestId, text }) {
    if (run.requestIds.includes(requestId)) return { accepted: true, duplicate: true }
    run.requestIds.push(requestId)
    try {
      await this.gateway.prompt({
        sessionId,
        requestId,
        mode: 'queue',
        content: [{ type: 'text', text }],
      })
    } catch (cause) {
      throw new BridgeError('prompt-failed', this.redactor.redact(cause?.message ?? cause), {
        status: 502,
        details: { runId: run.id, sessionId, requestId },
      })
    }
    return { accepted: true, duplicate: false }
  }

  /** prompt-failed → markUnknown + delivered-unknown 的唯一实现。 */
  async #deliver(run, { sessionId, requestId, text, failureMessage }) {
    try {
      await this.#sendPrompt(run, { sessionId, requestId, text })
      return { ok: true }
    } catch (cause) {
      if (cause?.code !== 'prompt-failed') throw cause
      await this.#markUnknown(run, 'delivered-unknown', cause)
      return {
        ok: false,
        error: new BridgeError('delivered-unknown', failureMessage, {
          status: 502,
          details: { runId: run.id, sessionId, requestId, cause: this.redactor.redact(cause.message) },
        }),
      }
    }
  }

  async #beginPlan(run, { round, attempt, feedback = null }) {
    let entry = run.rounds.find((item) => item.round === round)
    if (!entry) {
      entry = roundEntry(round)
      run.rounds.push(entry)
    }
    entry.planAttempt = attempt
    if (feedback !== null) entry.planFeedback = this.redactor.redact(feedback)
    entry.planRequestId = buildRequestId({ runId: run.id, stage: 'plan', round, attempt })
    run.state = 'fix_planning'
    run.pending = { kind: 'plan', requestId: entry.planRequestId, round, attempt }
    await this.save(run)
    const delivered = await this.#deliver(run, {
      sessionId: run.fixSessionId,
      requestId: entry.planRequestId,
      text: buildPlanPrompt({ run, round, feedback: entry.planFeedback || feedback, redactor: this.redactor }),
      failureMessage: '方案 prompt 发送失败，结果未知（不自动重发）',
    })
    if (!delivered.ok) throw delivered.error
    return entry
  }

  async #beginFix(run, { round, attempt = 1 }) {
    const entry = this.#entry(run, round)
    entry.fixAttempt = attempt
    entry.fixRequestId = buildRequestId({ runId: run.id, stage: 'fix', round, attempt })
    run.state = 'fix_implementing'
    run.pending = { kind: 'fix', requestId: entry.fixRequestId, round, attempt }
    await this.save(run)
    const delivered = await this.#deliver(run, {
      sessionId: run.fixSessionId,
      requestId: entry.fixRequestId,
      text: buildImplementPrompt({ run, round, redactor: this.redactor }),
      failureMessage: '实现 prompt 发送失败，结果未知（不自动重发）',
    })
    if (!delivered.ok) throw delivered.error
    return entry
  }

  async #beginReview(run, { round, attempt = 1 }) {
    const entry = this.#entry(run, round)
    entry.reviewAttempt = attempt
    entry.reviewRequestId = buildRequestId({ runId: run.id, stage: 'review', round, attempt })
    run.state = 'review_running'
    run.pending = { kind: 'review', requestId: entry.reviewRequestId, round, attempt }
    await this.save(run)
    const delivered = await this.#deliver(run, {
      sessionId: run.reviewSessionId,
      requestId: entry.reviewRequestId,
      text: buildReviewPrompt({ run, round, redactor: this.redactor }),
      failureMessage: '审核 prompt 发送失败，结果未知（不自动重发）',
    })
    if (!delivered.ok) throw delivered.error
    return entry
  }

  // ---------------------------------------------------------------- 人工闸门

  async approvePlan(runId, { note } = {}) {
    const run = await this.#requireRun(runId)
    if (run.state !== 'awaiting_plan_approval') {
      throw new ConflictError('illegal-transition', `当前状态不能批准方案：${run.state}`, { details: { state: run.state } })
    }
    const entry = this.#entry(run, run.currentRound)
    entry.planApprovedAt = this.clock.now()
    if (nonEmpty(note)) entry.planApprovalNote = this.redactor.redact(note)
    await this.#beginFix(run, { round: run.currentRound, attempt: 1 })
    return { run: publicRun(run) }
  }

  async planFeedback(runId, { feedback } = {}) {
    const run = await this.#requireRun(runId)
    if (run.state !== 'awaiting_plan_approval') {
      throw new ConflictError('illegal-transition', `当前状态不能退回方案：${run.state}`, { details: { state: run.state } })
    }
    if (!nonEmpty(feedback)) {
      throw new BadRequestError('feedback-required', '退回修改必须填写意见', { details: { field: 'feedback' } })
    }
    const entry = this.#entry(run, run.currentRound)
    const attempt = (entry.planAttempt ?? 1) + 1
    await this.#beginPlan(run, { round: run.currentRound, attempt, feedback: feedback.trim() })
    return { run: publicRun(run) }
  }

  /**
   * 审核通过后用户「要求再改」：只允许 awaiting_user_approval，直接进入下一轮方案（带意见）。
   * 与 plan-feedback（只用于 awaiting_plan_approval）分开，避免 409。
   */
  async requestChanges(runId, { note } = {}) {
    const run = await this.#requireRun(runId)
    if (run.state !== 'awaiting_user_approval') {
      throw new ConflictError('illegal-transition', `当前状态不能要求再改：${run.state}`, { details: { state: run.state } })
    }
    if (!nonEmpty(note)) {
      throw new BadRequestError('note-required', '要求再改必须填写意见', { details: { field: 'note' } })
    }
    const entry = this.#entry(run, run.currentRound)
    entry.reviewRequestedChangesAt = this.clock.now()
    run.currentRound = entry.round + 1
    await this.#beginPlan(run, { round: run.currentRound, attempt: 1, feedback: note.trim() })
    return { run: publicRun(run) }
  }

  async approve(runId) {
    const run = await this.#requireRun(runId)
    if (run.state === 'approved') return { run: publicRun(run), idempotent: true }
    if (run.state !== 'awaiting_user_approval') {
      throw new ConflictError('illegal-transition', `当前状态不能通过：${run.state}`, { details: { state: run.state } })
    }
    run.state = 'approved'
    run.approvedAt = this.clock.now()
    run.retro = { state: 'pending', sessionId: null, reportPath: null }
    run.pending = null
    run.attention = null
    await this.save(run)
    return { run: publicRun(run), idempotent: false }
  }

  // ---------------------------------------------------------------- 会话事件

  /**
   * Host `turn/end` 的桥内入口。requestId/session 不匹配、重复事件都安全忽略。
   * needs_attention 期间同一会话的后续 turn/end（completed/error）视为「用户已回答」，
   * 自动从暂停前的阶段继续（重发该阶段 prompt），不需要用户在窗口3 手动重开。
   * @param {string} sessionId
   * @param {{ requestId?: string, reason?: { kind?: string, error?: unknown }, finalText?: string, commit?: string, unsolicited?: boolean }} event
   */
  async onTurnEnd(sessionId, { requestId, reason, finalText, commit, unsolicited } = {}) {
    const run = (await this.store.list()).find(
      (item) => item.fixSessionId === sessionId || (item.reviewSessionId && item.reviewSessionId === sessionId),
    )
    if (!run) return { ignored: true, reason: 'unknown-session' }

    const kind = reason?.kind ?? 'unknown'

    // 暂停中的「用户已回答」：同一会话的后续 turn/end 自动续跑。
    if (run.state === 'needs_attention' && run.attention?.from) {
      const from = run.attention.from
      const stage = pausedStage(from)
      const expected = sessionForStage(run, stage)
      if (expected && sessionId !== expected) return { ignored: true, reason: 'session-mismatch' }
      if (!unsolicited && run.attention.blockedRequestId && requestId === run.attention.blockedRequestId) {
        return { ignored: true, reason: 'duplicate-blocked-turn' }
      }

      if (kind === 'aborted') {
        run.pending = null
        run.attention = null
        run.state = 'stopped'
        run.stoppedAt = this.clock.now()
        await this.save(run)
        return { run: publicRun(run), resumed: false }
      }

      if (kind === 'interrupted' || kind === 'unknown' || kind === 'forked') {
        run.pending = null
        run.attention = null
        run.state = 'unknown'
        run.error = {
          code: 'turn-unknown',
          message: 'turn 结果未知/中断；不自动重发，请人工确认后开新 run',
          at: this.clock.now(),
        }
        await this.save(run)
        return { run: publicRun(run), resumed: false }
      }

      if (kind === 'blocked') {
        await this.#pauseForUser(run, from, 'blocked', '会话再次被阻塞，需要你到 DSH 处理', {
          round: run.currentRound,
        })
        return { run: publicRun(run), resumed: false }
      }

      // completed / error：用户已经回答，从暂停前阶段继续。
      run.attention = null
      run.pending = null
      try {
        await this.#resumeFrom(run, from, { note: null })
      } catch (cause) {
        if (cause?.code !== 'delivered-unknown') throw cause
      }
      return { run: publicRun(run), resumed: true }
    }

    const pending = run.pending
    if (!pending) return { ignored: true, reason: 'no-pending-turn' }
    if (requestId !== pending.requestId) return { ignored: true, reason: 'request-mismatch' }
    const expectedSession = pending.kind === 'review' ? run.reviewSessionId : run.fixSessionId
    if (sessionId !== expectedSession) return { ignored: true, reason: 'session-mismatch' }

    if (kind === 'aborted') {
      run.pending = null
      run.state = 'stopped'
      run.stoppedAt = this.clock.now()
      run.attention = null
      await this.save(run)
      return { run: publicRun(run) }
    }

    if (kind === 'blocked') {
      const from =
        pending.kind === 'review' ? 'review_running' : pending.kind === 'plan' ? 'fix_planning' : 'fix_implementing'
      await this.#pauseForUser(run, from, 'blocked', '会话被阻塞，需要你到 DSH 处理', { round: pending.round })
      return { run: publicRun(run) }
    }

    if (kind === 'interrupted' || kind === 'unknown' || kind === 'forked') {
      // forked 按规格归入 unknown（不自动重发）；verdict 里的 blocked 才走 needs_attention。
      run.pending = null
      run.state = 'unknown'
      run.attention = null
      run.error = {
        code: 'turn-unknown',
        message: 'turn 结果未知/中断；不自动重发，请人工确认后开新 run',
        at: this.clock.now(),
      }
      await this.save(run)
      return { run: publicRun(run) }
    }

    if (kind !== 'completed') {
      const failed = pending.kind === 'review' ? 'review_failed' : 'fix_failed'
      run.pending = null
      run.state = failed
      run.attention = null
      run.error = {
        code: kind === 'error' ? 'turn-error' : `turn-${kind}`,
        message: this.redactor.redact(reason?.error?.message ?? reason?.message ?? `turn ${kind}`),
        at: this.clock.now(),
      }
      await this.save(run)
      return { run: publicRun(run) }
    }

    await this.#onCompleted(run, { finalText, commit })
    return { run: publicRun(run) }
  }

  async #onCompleted(run, { finalText, commit }) {
    const pending = run.pending
    const entry = this.#entry(run, pending.round)

    if (pending.kind === 'plan') {
      run.pending = null
      entry.planCompletedAt = this.clock.now()
      const name = `round-${pending.round}/plan.md`
      let planText = this.#readArtifactText(run, name)
      if (!planText && !artifactExists(run.localPath, run.id, name) && nonEmpty(finalText)) {
        planText = this.redactor.redact(finalText)
        await this.#writeRoundArtifact(run, name, planText)
      }
      entry.planText = planText ? String(planText).slice(0, MAX_PLAN_TEXT_CHARS) : null
      run.state = 'awaiting_plan_approval'
      this.#refreshArtifacts(run)
      await this.save(run)
      return
    }

    if (pending.kind === 'fix') {
      run.pending = null
      entry.completedAt = this.clock.now()
      const manifestText = this.#readArtifactText(run, `round-${pending.round}/result.json`)
      const manifest = validateResultManifest({
        text: manifestText,
        run,
        round: pending.round,
        localPath: run.localPath,
        eventCommit: commit ?? null,
      })
      entry.manifest = manifest.manifest
      entry.manifestErrors = manifest.errors
      for (const error of manifest.errors) this.#warn(run, `manifest-${error.code}`, error.message)
      const chosen = nonEmpty(commit) ? commit.trim() : manifest.commit
      if (chosen) {
        entry.commit = chosen
        if (!run.commits.includes(chosen)) run.commits.push(chosen)
      }
      run.state = 'fix_done'
      this.#refreshArtifacts(run)
      await this.save(run)
      await this.#startReview(run, pending.round, { attempt: 1 })
      return
    }

    // review
    entry.completedAt = this.clock.now()
    const raw = typeof finalText === 'string' && finalText.trim() ? finalText : await this.#readReviewText(run)
    entry.reviewRaw = this.redactor.redact(raw)
    const parsed = parseVerdict(raw)
    entry.verdict = parsed?.verdict ?? null
    entry.reviewBlocking = (parsed?.blocking ?? []).map((item) => this.redactor.redact(item))
    entry.reviewSummary = parsed?.summary ? this.redactor.redact(parsed.summary) : null
    entry.reviewTests = (parsed?.tests ?? []).map((item) => this.redactor.redact(item))
    run.state = 'review_done'

    if (entry.reviewRaw.trim()) {
      const name = `round-${pending.round}/review.md`
      if (!artifactExists(run.localPath, run.id, name)) await this.#writeRoundArtifact(run, name, entry.reviewRaw)
    }
    this.#refreshArtifacts(run)
    await this.save(run)

    if (!parsed) {
      await this.#pauseForUser(run, 'review_done', 'verdict-parse-failed', '审核结论 JSON 解析失败，请到 DSH 会话查看原文', {
        raw: entry.reviewRaw,
        round: entry.round,
      })
      return
    }

    if (parsed.verdict === 'approve') {
      run.pending = null
      run.state = 'awaiting_user_approval'
      await this.save(run)
      return
    }

    if (parsed.verdict === 'request_changes') {
      run.pending = null
      if (this.#isNoProgress(run, entry)) {
        await this.#pauseForUser(run, 'review_done', 'no-progress', '审核重复提出同一问题且没有新提交，已暂停以免无限循环', {
          blocking: entry.reviewBlocking,
          round: entry.round,
        })
        return
      }
      run.currentRound = entry.round + 1
      try {
        await this.#beginPlan(run, { round: run.currentRound, attempt: 1 })
      } catch (cause) {
        if (cause?.code !== 'delivered-unknown') throw cause
      }
      return
    }

    // blocked / needs_info → needs_attention（不自动推进；resume 重发本轮审核）。
    // blocked 是审核主动要求停下，不是解析失败；forked 属于 turn reason，已在 onTurnEnd 归 unknown。
    const message = parsed.verdict === 'blocked' ? '审核结论 blocked，需要你到 DSH 处理' : '审核需要你补充信息'
    await this.#pauseForUser(run, 'review_done', parsed.verdict === 'blocked' ? 'blocked' : 'needs-info', message, {
      blocking: entry.reviewBlocking,
      raw: entry.reviewRaw,
      round: entry.round,
    })
  }

  async #startReview(run, round, { attempt = 1 } = {}) {
    run.state = 'review_starting'
    const title = `BUG-${run.bugUid ?? run.bugId} 审核`

    if (!run.reviewSessionId) {
      run.reviewSessionId = randomUUID()
      let created
      try {
        created = await this.gateway.createSession({ cwd: run.localPath, sessionId: run.reviewSessionId, title })
      } catch (cause) {
        await this.#failReview(run, 'review-session-create-failed', cause)
        return
      }
      if (created?.sessionId !== run.reviewSessionId) {
        await this.#failReview(run, 'review-session-identity-mismatch', new Error(`created=${created?.sessionId}`))
        return
      }
      try {
        await this.gateway.rename({ sessionId: run.reviewSessionId, title })
      } catch (cause) {
        this.#warn(run, 'rename-failed', cause)
      }
    }

    try {
      await this.gateway.setSandboxMode({ sessionId: run.reviewSessionId, mode: 'read-only' })
    } catch (cause) {
      await this.#failReview(run, 'sandbox-read-only-failed', cause)
      return
    }

    try {
      await this.#beginReview(run, { round, attempt })
    } catch (cause) {
      if (cause?.code !== 'delivered-unknown') throw cause
    }
  }

  async #failReview(run, code, cause) {
    run.pending = null
    run.state = 'review_failed'
    run.attention = null
    run.error = { code, message: this.redactor.redact(cause?.message ?? String(cause ?? '')), at: this.clock.now() }
    await this.save(run)
  }

  async #readReviewText(run) {
    try {
      return await this.gateway.readLastMessage(run.reviewSessionId)
    } catch (cause) {
      this.#warn(run, 'read-review-failed', cause)
      return ''
    }
  }

  /**
   * 进入 needs_attention：保留 pending（标记 awaitingUser），让同一会话的下一个 turn/end
   * 能被识别成「用户已回答」；同时让 Host 网关 watch 该会话（有该能力时）。
   */
  async #pauseForUser(run, from, code, message, extra = {}) {
    const stage = pausedStage(from)
    if (!run.pending && stage) {
      const entry = run.rounds.find((item) => item.round === run.currentRound)
      run.pending = {
        kind: stage,
        round: run.currentRound,
        requestId:
          stage === 'review'
            ? entry?.reviewRequestId ?? null
            : stage === 'plan'
              ? entry?.planRequestId ?? null
              : entry?.fixRequestId ?? null,
        awaitingUser: true,
      }
    }
    if (run.pending) run.pending = { ...run.pending, awaitingUser: true }
    run.state = 'needs_attention'
    run.attention = {
      from,
      code,
      message: this.redactor.redact(message),
      at: this.clock.now(),
      ...extra,
      blockedRequestId: run.pending?.requestId ?? null,
    }
    await this.save(run)

    const sessionId = sessionForStage(run, stage)
    if (sessionId && typeof this.gateway.watchSession === 'function') {
      try {
        await this.gateway.watchSession({ sessionId, requestId: run.pending?.requestId ?? null })
      } catch (cause) {
        this.#warn(run, 'watch-failed', cause)
        await this.save(run)
      }
    }
  }

  #isNoProgress(run, entry) {
    const previous = run.rounds.find((item) => item.round === entry.round - 1)
    if (!previous || previous.verdict !== 'request_changes') return false
    const signature = (list) =>
      [...new Set((list ?? []).map((item) => String(item).trim()).filter(Boolean))].sort().join('\u0000')
    const previousSignature = signature(previous.reviewBlocking)
    if (!previousSignature || previousSignature !== signature(entry.reviewBlocking)) return false
    return (previous.commit ?? null) === (entry.commit ?? null)
  }

  #entry(run, round) {
    const entry = run.rounds.find((item) => item.round === round)
    if (!entry) throw new BridgeError('bridge/no-round', `run ${run.id} 缺少第 ${round} 轮记录`, { status: 500 })
    return entry
  }

  /**
   * 用户回答/确认后从 needs_attention 回到暂停前的阶段，并重发该阶段 prompt（不跳轮、不重开 run）。
   * - plan 阶段：新 attempt 继续出方案（note 作为退回意见）；
   * - fix 阶段：重发实现 prompt；
   * - review 阶段：重发本轮审核 prompt。
   */
  async resume(runId, { note } = {}) {
    const run = await this.#requireRun(runId)
    if (run.state !== 'needs_attention' || !run.attention?.from) {
      throw new ConflictError('illegal-transition', `当前状态不需要 resume：${run.state}`, { details: { state: run.state } })
    }
    const from = run.attention.from
    const text = nonEmpty(note) ? note.trim() : null
    run.resumeNote = text ? this.redactor.redact(text) : null
    run.attention = null
    run.pending = null
    const sessionId = sessionForStage(run, pausedStage(from))
    if (sessionId && typeof this.gateway.unwatchSession === 'function') {
      try {
        await this.gateway.unwatchSession({ sessionId })
      } catch {
        // 取消失败不影响 resume；watch 只会被下一次 turn 消费。
      }
    }
    await this.#resumeFrom(run, from, { note: text })
    return { run: publicRun(run) }
  }

  async #resumeFrom(run, from, { note = null } = {}) {
    const stage = pausedStage(from)
    if (stage === 'plan') {
      const entry = this.#entry(run, run.currentRound)
      const attempt = (entry.planAttempt ?? 1) + 1
      await this.#beginPlan(run, {
        round: run.currentRound,
        attempt,
        feedback: note ?? (nonEmpty(entry.planFeedback) ? entry.planFeedback : null),
      })
      return
    }
    if (stage === 'fix') {
      const entry = this.#entry(run, run.currentRound)
      const attempt = (entry.fixAttempt ?? 1) + 1
      await this.#beginFix(run, { round: run.currentRound, attempt })
      return
    }
    if (stage === 'review') {
      const entry = this.#entry(run, run.currentRound)
      await this.#startReview(run, run.currentRound, { attempt: (entry.reviewAttempt ?? 1) + 1 })
      return
    }
    run.state = from
    run.pending = null
    await this.save(run)
  }

  // ---------------------------------------------------------------- Stop

  async stop(runId) {
    const run = await this.#requireRun(runId)
    if (run.state === 'stopped') return { run: publicRun(run), idempotent: true }
    if (run.state === 'approved') {
      throw new ConflictError('illegal-transition', `已通过的 run 不能 Stop：${run.state}`, { details: { state: run.state } })
    }
    const sessions = [run.fixSessionId, run.reviewSessionId].filter(Boolean)
    if (typeof this.gateway.unwatchSession === 'function') {
      for (const sessionId of sessions) {
        try {
          await this.gateway.unwatchSession({ sessionId })
        } catch {
          // ignore
        }
      }
    }
    for (const sessionId of sessions) {
      try {
        await this.gateway.cancel({ sessionId })
      } catch (cause) {
        this.#warn(run, 'cancel-failed', cause)
      }
    }
    run.state = 'stopped'
    run.pending = null
    run.attention = null
    run.stoppedAt = this.clock.now()
    await this.save(run)
    return { run: publicRun(run), idempotent: false }
  }
}
