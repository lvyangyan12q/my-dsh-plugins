/**
 * 真实 DSH Host 适配：把 IM01 的注入式 `SessionGateway` 契约接到 Host 服务。
 *
 * 只依赖 ctx 上的服务（按当前 DSH 源码签名，见 docs/wayfinding 调研 01/05）：
 * - `workspaceRegistry.create(path)`：canonical realpath、同一路径幂等复用。
 * - `sessionController.create({ workspaceId, sessionId?, agentPreset? })`：预生成 id；
 *   返回 id 不一致视为异常，不重试。
 * - `sessionController.rename/prompt/cancel`；prompt 必须带 AbortSignal。
 * - `sessionPersistence.stat/flush/open(id,'read')`：幂等预检 + 事件后落盘 + 权威重读。
 * - `sessionQuery.observeSession`（可选）：persistence 不可用时的日志读取兜底。
 * - `sandboxPolicy`（可选）：审核会话 read-only 校验。
 * - `sessions`（可选）：直接拿已 attach 的 Session 追加 `sandbox/mode`。
 * - `agentPresets`（可选）：配置了预设时先校验。
 *
 * 安全边界：
 * - createSession 只接受绝对路径，并在配置了 allowedRoots 时再次做前缀校验（纵深防御）。
 * - 审核会话必须在发 prompt 之前确认 read-only 生效；否则抛错 → 状态机 review_failed。
 * - 没有删除会话的 API：Stop 只 cancel；失败/未知不自动重发。
 */
import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { promisify } from 'node:util'
import { extractMessages, lastAssistantText, locateTurn, parseRequestId } from './session-log.js'
import { isPathInside } from './paths.js'
import { readAllowedRootsFromConfig } from './ssh-config.js'

const execFileAsync = promisify(execFile)

/** 没有这些服务就无法驱动原生会话。 */
export const REQUIRED_HOST_SERVICES = ['sessionController', 'workspaceRegistry', 'sessionPersistence']

/** 可能用到、但缺失时仍可降级（只读镜像/沙箱校验）的服务。 */
export const OPTIONAL_HOST_SERVICES = ['sessionQuery', 'sandboxPolicy', 'agentPresets', 'sessions', 'profileContext']

/**
 * 当前 ctx 上还缺哪些必需 Host 服务；没有 get 的假 ctx 视为全缺。
 * @param {any} ctx
 * @returns {string[]}
 */
export function missingHostServices(ctx) {
  if (!ctx || typeof ctx.get !== 'function') return [...REQUIRED_HOST_SERVICES]
  return REQUIRED_HOST_SERVICES.filter((name) => ctx.get(name) === undefined)
}

function defaultRunGit(cwd, args) {
  return execFileAsync('git', ['-C', cwd, ...args], {
    timeout: 15_000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  }).then(({ stdout }) => stdout)
}

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * @typedef {object} HostGatewayOptions
 * @property {any} ctx - Host/插件上下文（需要 get/on）。
 * @property {object} [config] - 插件配置（allowedRoots/allowedRootsProvider/agentPreset/defaultSandboxMode/promptTimeoutMs/dirtyCheck）。
 * @property {{ redact: (value: unknown) => string }} [redactor]
 * @property {(sessionId: string, payload: object) => Promise<any> | any} [onTurnEnd]
 * @property {() => Promise<string[]>} [allowedRootsProvider] - 每次建会话前合并窗口2 localPath。
 * @property {(cwd: string, args: string[]) => Promise<string>} [runGit] - 测试注入的 git 执行器。
 */

export class HostSessionGateway {
  constructor({ ctx, config = {}, redactor, onTurnEnd, allowedRootsProvider, runGit } = {}) {
    if (!ctx || typeof ctx.get !== 'function') {
      throw new Error('createHostGateway 需要 Host 上下文（ctx.get）')
    }
    const missing = missingHostServices(ctx)
    if (missing.length > 0) throw new Error(`缺少 Host 服务：${missing.join(', ')}`)

    this.ctx = ctx
    this.config = config
    this.redactor = redactor ?? { redact: (value) => (value === null || value === undefined ? '' : String(value)) }
    this.onTurnEnd = typeof onTurnEnd === 'function' ? onTurnEnd : null
    this.runGit = typeof runGit === 'function' ? runGit : defaultRunGit
    this.allowedRootsProvider =
      typeof allowedRootsProvider === 'function'
        ? allowedRootsProvider
        : typeof config.allowedRootsProvider === 'function'
          ? config.allowedRootsProvider
          : null

    this.sessionController = ctx.get('sessionController')
    this.workspaceRegistry = ctx.get('workspaceRegistry')
    this.sessionPersistence = ctx.get('sessionPersistence')
    this.sessionQuery = ctx.get('sessionQuery')
    this.sandboxPolicy = ctx.get('sandboxPolicy')
    this.agentPresets = ctx.get('agentPresets')
    this.sessions = ctx.get('sessions')

    this.configuredRoots = (Array.isArray(config.allowedRoots) ? config.allowedRoots : [])
      .filter((root) => typeof root === 'string' && root.trim() !== '')
      .map((root) => {
        try {
          return realpathSync(root)
        } catch {
          return root
        }
      })
    this.allowedRoots = [...this.configuredRoots]
    this.defaultSandboxMode =
      typeof config.defaultSandboxMode === 'string' && config.defaultSandboxMode.trim()
        ? config.defaultSandboxMode.trim()
        : 'workspace-write'
    // 没有固定默认超时：只有显式配置 promptTimeoutMs > 0 才启用；0/缺省表示一直等。
    this.promptTimeoutMs =
      config.promptTimeoutMs === null || config.promptTimeoutMs === 0
        ? 0
        : positiveNumber(config.promptTimeoutMs, 0)
    this.dirtyCheck = config.dirtyCheck !== false

    /** @type {Map<string, { requestId: string, turn: number | null, runId: string | null, stage: string | null, round: number | null }>} */
    this.pending = new Map()
    /** @type {Map<string, { requestId: string | null, afterTurn: number | null }>} */
    this.watching = new Map()
    /** @type {Map<string, number>} */
    this.currentTurn = new Map()
    /** 同一 (sessionId, requestId) 只投递一次：Host 会折叠重复 requestId，桥内也先行去重。 */
    this.sent = new Set()
    this.inflight = new Set()
    this.disposers = []
    this.disposed = false
    this.#subscribe()
  }

  // ------------------------------------------------------------ 工作区检查

  /**
   * 派发前检查：是不是 git 仓库、工作区是否脏。
   * `.bug-solver/` 是桥自己的产物目录，不计入脏检查。
   * @param {string} cwd
   */
  async inspectWorkspace(cwd) {
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new Error(`工作区必须是绝对路径：${String(cwd)}`)
    const isGit = existsSync(join(cwd, '.git'))
    if (!isGit || !this.dirtyCheck) return { isGit, dirty: false }
    let output
    try {
      output = await this.runGit(cwd, ['status', '--porcelain'])
    } catch (error) {
      throw new Error(`无法检查工作区是否干净（git status 失败）：${error?.message ?? error}`)
    }
    const dirty = String(output ?? '')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
      .some((line) => {
        const raw = line.slice(3).trim().replace(/^"|"$/g, '')
        if (!raw) return false
        const target = raw.includes(' -> ') ? raw.split(' -> ').pop().trim() : raw
        const normalized = target.replace(/\\/g, '/')
        return !(normalized === '.bug-solver' || normalized.startsWith('.bug-solver/'))
      })
    return { isGit, dirty }
  }

  // ------------------------------------------------------------ 会话生命周期

  /**
   * 创建会话：workspaceRegistry.create(realpath(cwd)) → sessionController.create({ workspaceId, sessionId })
   * → 核对返回 id → flush → 把修复会话设为 workspace-write。
   * 标题由状态机随后调用 rename() 设置（DSH create 不接受 title）。
   * @param {{ cwd: string, sessionId: string, title?: string, agentPreset?: string, sandboxMode?: string }} request
   */
  async createSession({ cwd, sessionId, title, agentPreset, sandboxMode } = {}) {
    this.#assertAlive()
    if (typeof cwd !== 'string' || !isAbsolute(cwd)) throw new Error(`创建会话需要绝对路径 cwd：${String(cwd)}`)
    if (typeof sessionId !== 'string' || sessionId.trim() === '') throw new Error('创建会话需要预生成 sessionId')

    let canonical
    try {
      canonical = realpathSync(cwd)
    } catch {
      throw new Error(`会话工作目录不存在：${cwd}`)
    }
    await this.#refreshAllowedRoots()
    this.#assertAllowed(canonical)

    const workspace = await this.workspaceRegistry.create(canonical)
    if (!workspace?.id) throw new Error(`workspaceRegistry.create 没有返回 workspace id：${canonical}`)

    // 幂等：预生成 id 一旦已存在，拒绝复用（不静默换 id）。
    const stored = await this.sessionPersistence.stat(sessionId)
    if (stored) throw new Error(`会话 id 已存在，拒绝创建：${sessionId}`)

    const preset = await this.#resolvePreset(agentPreset)
    const created = await this.sessionController.create({
      workspaceId: workspace.id,
      sessionId,
      ...(preset === null ? {} : { agentPreset: preset }),
    })
    if (created?.sessionId !== sessionId) {
      throw new Error(`会话 id 与预生成 id 不一致（不重试）：expected=${sessionId} actual=${String(created?.sessionId)}`)
    }
    await this.sessionPersistence.flush()

    const mode = typeof sandboxMode === 'string' && sandboxMode.trim() ? sandboxMode.trim() : this.defaultSandboxMode
    await this.setSandboxMode({ sessionId, mode })
    return { sessionId, workspaceId: workspace.id }
  }

  /**
   * 重命名（DSH create 无 title 字段，只能 rename）。
   * @param {{ sessionId: string, title: string }} request
   */
  async rename({ sessionId, title } = {}) {
    this.#assertAlive()
    if (typeof sessionId !== 'string' || sessionId === '') throw new Error('rename 需要 sessionId')
    if (typeof title !== 'string' || title.trim() === '') throw new Error('rename 需要 title')
    return await this.sessionController.rename({ sessionId, title: title.trim() })
  }

  /**
   * 切换会话 sandbox 模式：追加一条 `sandbox/mode` 事件（Host 的唯一写路径），
   * 并在事件落盘前校验生效，避免审核会话在 workspace-write 下开跑。
   * @param {{ sessionId: string, mode: 'read-only' | 'workspace-write' | 'danger-full-access' }} request
   */
  async setSandboxMode({ sessionId, mode } = {}) {
    this.#assertAlive()
    if (typeof sessionId !== 'string' || sessionId === '') throw new Error('setSandboxMode 需要 sessionId')
    if (typeof mode !== 'string' || mode.trim() === '') throw new Error('setSandboxMode 需要 mode')
    const wanted = mode.trim()

    let session = this.#attachedSession(sessionId)
    if (!session) {
      const found = await this.sessionController.resolveAgent(sessionId)
      if (found?.error) throw new Error(`无法解析会话 ${sessionId}：${found.error.code ?? 'unknown'}`)
      session = found?.agent?.session
    }
    if (!session || typeof session.append !== 'function') {
      throw new Error(`无法设置 sandbox 模式：会话 ${sessionId} 没有可写的 Session 对象`)
    }

    if (typeof this.sandboxPolicy?.setSandboxMode === 'function') {
      // 兼容注入式假实现；真实 sandboxPolicy 没有这个方法时走下面的 Session.append。
      await this.sandboxPolicy.setSandboxMode(session, wanted)
    } else {
      session.append('sandbox/mode', { mode: wanted })
    }
    this.#verifySandboxMode(session, wanted)
    return { ok: true, mode: wanted }
  }

  /**
   * 投递一轮 prompt：requestId 确定性去重 + mode=queue + 准入超时。
   * 超时/失败一律抛出，由状态机映射为 delivered-unknown（不自动重发）。
   * @param {{ sessionId: string, requestId: string, mode?: 'queue' | 'steer', content: any[] }} request
   */
  async prompt({ sessionId, requestId, mode = 'queue', content } = {}) {
    this.#assertAlive()
    if (typeof sessionId !== 'string' || sessionId === '') throw new Error('prompt 需要 sessionId')
    if (typeof requestId !== 'string' || requestId.trim() === '') throw new Error('prompt 需要确定性 requestId')
    if (!Array.isArray(content) || content.length === 0) throw new Error('prompt 需要 content')

    const key = `${sessionId}\u0000${requestId}`
    if (this.sent.has(key)) return { accepted: true, duplicate: true }
    this.sent.add(key)
    // 新 prompt 之后，旧的「等待用户回答」watch 不再有效。
    this.watching.delete(sessionId)

    const meta = parseRequestId(requestId)
    const pending = {
      requestId,
      turn: null,
      confirmed: false,
      runId: meta.runId,
      stage: meta.stage,
      round: meta.round,
    }
    this.pending.set(sessionId, pending)

    const signal =
      this.promptTimeoutMs > 0 ? AbortSignal.timeout(this.promptTimeoutMs) : new AbortController().signal
    try {
      const value = await this.sessionController.prompt({ sessionId, requestId, mode, content }, signal)
      return value ?? { accepted: true }
    } catch (error) {
      if (this.pending.get(sessionId) === pending) this.pending.delete(sessionId)
      throw error
    }
  }

  /**
   * 等待同一个会话里「用户回答」的 turn/end。needs_attention 时由状态机调用；
   * 后续任何非本请求的 turn/end 都会被当作回答上报（`unsolicited: true`）。
   */
  watchSession({ sessionId, requestId = null } = {}) {
    this.#assertAlive()
    if (typeof sessionId !== 'string' || sessionId === '') throw new Error('watchSession 需要 sessionId')
    this.watching.set(sessionId, {
      requestId: typeof requestId === 'string' ? requestId : null,
      afterTurn: this.currentTurn.get(sessionId) ?? null,
    })
    return { ok: true }
  }

  unwatchSession({ sessionId } = {}) {
    this.#assertAlive()
    if (typeof sessionId !== 'string' || sessionId === '') return { ok: false }
    this.watching.delete(sessionId)
    return { ok: true }
  }

  /** 取消当前 turn（Stop）。不删除会话，也不清空 Host 队列。 */
  async cancel({ sessionId } = {}) {
    this.#assertAlive()
    if (typeof sessionId !== 'string' || sessionId === '') throw new Error('cancel 需要 sessionId')
    try {
      const value = this.sessionController.cancel({ sessionId })
      await Promise.resolve(value)
      return { ok: true }
    } finally {
      this.pending.delete(sessionId)
    }
  }

  // ------------------------------------------------------------ 只读对话镜像

  /**
   * 只读消息流：按 seq 升序返回 user/assistant/tool，plan/review 归类，文本已脱敏。
   * 没有发送/编辑/审批入口。
   * @param {{ sessionId: string }} request
   */
  async listMessages({ sessionId } = {}) {
    this.#assertAlive()
    const events = await this.#readEvents(sessionId)
    return extractMessages(events, { redactor: this.redactor })
  }

  /** 最后一条 assistant 文本（审核结论从最终消息提取）。 */
  async readLastMessage(sessionId) {
    this.#assertAlive()
    const events = await this.#readEvents(sessionId)
    return this.redactor.redact(lastAssistantText(events))
  }

  // ------------------------------------------------------------ 完成信号

  /** 等待所有在途事件处理完成（测试用；正常路径不依赖轮询）。 */
  async whenIdle() {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight])
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    for (const dispose of this.disposers.splice(0)) {
      try {
        dispose()
      } catch {
        // 卸载时的清理失败不影响插件退出
      }
    }
    this.pending.clear()
    this.watching.clear()
    this.currentTurn.clear()
    this.sent.clear()
  }

  // ------------------------------------------------------------ 内部

  #assertAlive() {
    if (this.disposed) throw new Error('bug-solver Host 网关已释放')
  }

  #assertAllowed(canonical) {
    if (this.allowedRoots.length === 0) return
    if (!this.allowedRoots.some((root) => isPathInside(canonical, root))) {
      throw new Error(`会话目录不在 allowedRoots 内：${canonical}`)
    }
  }

  /** 合并插件配置与窗口2 `ssh-config.json` 的 localPath（每次建会话前刷新）。 */
  async #refreshAllowedRoots() {
    if (!this.allowedRootsProvider) return
    let extra = []
    try {
      extra = await this.allowedRootsProvider()
    } catch {
      extra = []
    }
    const roots = [...this.configuredRoots]
    for (const root of Array.isArray(extra) ? extra : []) {
      if (typeof root !== 'string' || root.trim() === '') continue
      try {
        roots.push(realpathSync(root))
      } catch {
        roots.push(root)
      }
    }
    this.allowedRoots = [...new Set(roots)]
  }

  async #resolvePreset(agentPreset) {
    const wanted = typeof agentPreset === 'string' && agentPreset.trim() ? agentPreset.trim() : this.config.agentPreset
    if (typeof wanted !== 'string' || wanted.trim() === '') return null
    if (!this.agentPresets || typeof this.agentPresets.resolve !== 'function') return wanted.trim()
    const preset = await this.agentPresets.resolve(wanted.trim())
    if (preset?.broken) throw new Error(`agent preset 不可用：${wanted}（${preset.broken}）`)
    return preset?.id ?? wanted.trim()
  }

  #attachedSession(sessionId) {
    const store = this.sessions
    if (store && typeof store.get === 'function') {
      const session = store.get(sessionId)
      if (session) return session
    }
    return null
  }

  #verifySandboxMode(session, wanted) {
    if (typeof session.snapshotEvents === 'function') {
      const events = session.snapshotEvents()
      const last = [...events].reverse().find((event) => event?.type === 'sandbox/mode')
      if (last?.data?.mode !== wanted) {
        throw new Error(`sandbox 模式未生效：expected=${wanted} actual=${String(last?.data?.mode)}`)
      }
      return
    }
    if (typeof this.sandboxPolicy?.resolve === 'function') {
      const resolved = this.sandboxPolicy.resolve({ session })
      if (resolved?.mode !== wanted) {
        throw new Error(`sandbox 模式未生效：expected=${wanted} actual=${String(resolved?.mode)}`)
      }
    }
  }

  async #readEvents(sessionId) {
    if (typeof sessionId !== 'string' || sessionId === '') throw new Error('读取会话日志需要 sessionId')
    if (this.sessionPersistence && typeof this.sessionPersistence.open === 'function') {
      const handle = await this.sessionPersistence.open(sessionId, 'read')
      try {
        const result = await handle.read()
        return Array.isArray(result?.events) ? result.events : []
      } finally {
        await handle.close?.()
      }
    }
    if (this.sessionQuery && typeof this.sessionQuery.observeSession === 'function') {
      const observation = await this.sessionQuery.observeSession(sessionId)
      try {
        return Array.isArray(observation?.events) ? [...observation.events] : []
      } finally {
        await observation?.dispose?.()
      }
    }
    throw new Error('没有可用的会话日志读取通道（sessionPersistence/sessionQuery）')
  }

  #subscribe() {
    if (typeof this.ctx.on !== 'function') return
    const off = this.ctx.on('session/event', (session, event) => {
      this.#track(session, event)
    })
    if (typeof off === 'function') this.disposers.push(off)
  }

  #track(session, event) {
    if (this.disposed || !event || typeof event !== 'object') return
    const sessionId = session?.id
    if (typeof sessionId !== 'string' || sessionId === '') return

    if (event.type === 'turn/start') {
      this.currentTurn.set(sessionId, event.data?.turn ?? null)
      return
    }

    const pending = this.pending.get(sessionId)
    if (pending) {
      if (event.type === 'user/message') {
        // 只有 rpcId 命中本请求，才承认「请求被准入」，之后才接受该 turn 的结束事实。
        if (event.data?.source?.rpcId !== pending.requestId) return
        pending.confirmed = true
        pending.turn = this.currentTurn.get(sessionId) ?? pending.turn
        return
      }
      if (event.type === 'turn/end') {
        if (!pending.confirmed || pending.turn === null || event.data?.turn !== pending.turn) return
        this.pending.delete(sessionId)
        const task = this.#finish(sessionId, pending, event.data)
        this.inflight.add(task)
        void task.then(
          () => this.inflight.delete(task),
          () => this.inflight.delete(task),
        )
      }
      return
    }

    // needs_attention 的 watch：同一会话里用户回答后的 turn/end 视为「已回答」，
    // 上报给状态机从暂停阶段续跑（不依赖该 turn 的 rpcId 属于桥）。
    const watch = this.watching.get(sessionId)
    if (watch && event.type === 'turn/end') {
      const turn = event.data?.turn ?? null
      if (watch.afterTurn !== null && turn === watch.afterTurn) return
      this.watching.delete(sessionId)
      const task = this.#emit(
        sessionId,
        { requestId: watch.requestId },
        event.data?.reason ?? { kind: 'unknown' },
        '',
        { unsolicited: true },
      )
      this.inflight.add(task)
      void task.then(
        () => this.inflight.delete(task),
        () => this.inflight.delete(task),
      )
    }
  }

  async #finish(sessionId, pending, liveTurnEnd) {
    try {
      // 事件只是触发：先落盘，再按持久化日志重放同一定位逻辑（权威真相）。
      await this.sessionPersistence.flush()
      const events = await this.#readEvents(sessionId)
      const located = locateTurn(events, pending.requestId)
      if (!located) {
        // 日志里看不到本请求的明确结束事实：按未知处理，不自动重发。
        await this.#emit(sessionId, pending, { kind: 'unknown' }, '')
        return
      }
      const reason = located.reason ?? liveTurnEnd?.reason ?? { kind: 'unknown' }
      await this.#emit(sessionId, pending, reason, located.finalText)
    } catch (error) {
      await this.#emit(sessionId, pending, { kind: 'interrupted', error: { message: String(error?.message ?? error) } }, '')
    }
  }

  async #emit(sessionId, pending, reason, finalText, { commit = null, unsolicited = false } = {}) {
    if (!this.onTurnEnd) return
    const payload = {
      requestId: pending.requestId,
      reason,
      finalText: typeof finalText === 'string' ? finalText : '',
      ...(commit ? { commit } : {}),
      ...(unsolicited ? { unsolicited: true } : {}),
    }
    try {
      await this.onTurnEnd(sessionId, payload)
    } catch {
      // 状态机自己会把失败写进 run.error；这里不让事件链崩掉插件。
    }
  }
}

/**
 * 创建真实 Host 网关（调用方负责 dispose）。
 * @param {any} ctx
 * @param {HostGatewayOptions} [options]
 * @returns {HostSessionGateway}
 */
export function createHostGateway(ctx, options = {}) {
  return new HostSessionGateway({ ctx, ...options })
}
