/**
 * bug-solver-dispatch：窗口3 调度桥（DSH Host 插件，ESM 无构建）。
 *
 * apply 时通过 ctx.connection.fetch 挂载 /api/bug-solver/*；鉴权走连接层。
 * 依赖优先级：
 * 1. `config.service`（测试/宿主显式注入的整服务）；
 * 2. `config.deps`（fake/自定义 gateway/store/clock/redactor）；
 * 3. 真实 DSH Host 服务（IM04）：sessionController + workspaceRegistry + sessionPersistence
 *    → 组成 HostSessionGateway，再挂上 RunStore。
 * 缺少 Host 服务或数据目录时插件仍加载，路由明确返回 503。
 */
import { join } from 'node:path'
import { DispatchService } from './dispatch-service.js'
import { createRunStore } from './run-store.js'
import { createRedactor } from './redact.js'
import { systemClock } from './clock.js'
import { registerRoutes } from './routes.js'
import { registerNodeRoutes } from './node-http.js'
import { createHostGateway, missingHostServices, REQUIRED_HOST_SERVICES } from './host.js'
import { readAllowedRootsFromConfig, resolveSshConfigPath } from './ssh-config.js'

export const name = 'bug-solver-dispatch'
export const inject = ['connection']

const DEFAULT_UNAVAILABLE = 'bug-solver 桥未配置（缺少 SessionGateway/RunStore）'

const nonEmptyString = (value) => typeof value === 'string' && value.trim() !== ''

/**
 * 从插件配置解析依赖；缺少 gateway/store 时返回 null（路由返回 503）。
 * allowedRoots = 插件静态配置 ∪ 窗口2 ssh-config.json 里 projects[].localPath。
 * @returns {DispatchService | null}
 */
export function createService(config = {}) {
  const deps = config.deps ?? {}
  const gateway = deps.gateway ?? config.gateway ?? null
  const store =
    deps.store ??
    config.store ??
    (nonEmptyString(config.dataDir) ? createRunStore({ dir: config.dataDir }) : null)
  const clock = deps.clock ?? config.clock ?? systemClock
  const redactor = deps.redactor ?? config.redactor ?? createRedactor()
  if (!gateway || !store) return null
  const sshConfigPath = config.sshConfigPath ?? deps.sshConfigPath ?? resolveSshConfigPath(config)
  const allowedRootsProvider =
    config.allowedRootsProvider ??
    deps.allowedRootsProvider ??
    (sshConfigPath ? () => readAllowedRootsFromConfig(sshConfigPath) : null)
  return new DispatchService({
    gateway,
    store,
    clock,
    redactor,
    allowedRoots: config.allowedRoots ?? deps.allowedRoots ?? [],
    allowedRootsProvider,
    sshConfigPath,
  })
}

/**
 * run 表数据目录：显式配置 > profile 数据目录（与工作台同一约定）> null（不猜）。
 * 不写项目主目录的 data/config。
 * @param {any} host
 * @param {object} config
 * @returns {string | null}
 */
export function resolveHostDataDir(host, config = {}) {
  if (nonEmptyString(config.dataDir)) return config.dataDir.trim()
  const profileDir = host?.get?.('profileContext')?.dir
  if (nonEmptyString(profileDir)) return join(profileDir, 'bug-solver-dispatch')
  return null
}

/**
 * 用真实 Host 服务组装 { gateway, service }；缺服务/数据目录时抛错由调用方降级为 503。
 * @param {any} host - 已注入 Host 服务的上下文
 * @param {object} [config]
 * @returns {{ gateway: import('./host.js').HostSessionGateway, service: DispatchService }}
 */
export function createHostService(host, config = {}) {
  const redactor = config.redactor ?? createRedactor()
  const dataDir = resolveHostDataDir(host, config)
  if (!dataDir && !(config.deps?.store ?? config.store)) {
    throw new Error('缺少 run 表数据目录（config.dataDir 或 profileContext）')
  }
  const sshConfigPath = config.sshConfigPath ?? resolveSshConfigPath(config)
  const allowedRootsProvider =
    config.allowedRootsProvider ?? (sshConfigPath ? () => readAllowedRootsFromConfig(sshConfigPath) : null)
  let service = null
  const gateway = createHostGateway(host, {
    config,
    redactor,
    allowedRootsProvider,
    onTurnEnd: (sessionId, payload) => service?.onTurnEnd(sessionId, payload),
  })
  try {
    const built = createService({
      ...config,
      redactor,
      ...(nonEmptyString(config.dataDir) ? {} : dataDir ? { dataDir } : {}),
      sshConfigPath,
      allowedRootsProvider,
      deps: { ...(config.deps ?? {}), gateway },
    })
    if (!built) throw new Error('缺少 SessionGateway/RunStore')
    service = built
    return { gateway, service }
  } catch (error) {
    gateway.dispose()
    throw error
  }
}

export function apply(ctx, config = {}) {
  ctx.inject(['connection'], (child) => {
    /** 路由永远先注册：服务未就绪时返回 503，而不是 404。 */
    const holder = { service: null, gateway: null, unavailableReason: DEFAULT_UNAVAILABLE }

    if (config.service) {
      holder.service = config.service
      holder.unavailableReason = null
    } else if (config.deps?.gateway || config.gateway) {
      holder.service = createService(config)
      if (holder.service) holder.unavailableReason = null
    }

    // 普通 iframe fetch 必须走 webServer 的 exact 路由 + connection.admit；
    // connection.fetch 是客户端 RPC 通道，没有 owner Peer，普通 fetch 会 400。
    let webServer = null
    try { webServer = child.get?.('webServer') ?? child.webServer ?? null } catch { webServer = null }
    if (webServer && typeof webServer.register === 'function' && typeof child.connection?.admit === 'function') {
      try {
        child.effect(
          () => registerNodeRoutes(webServer, child.connection, () => holder.service, () => holder.unavailableReason),
          'bug-solver dispatch http routes',
        )
      } catch (error) {
        holder.unavailableReason = `HTTP 路由注册失败：${String(error?.message ?? error)}`
        child.logger?.warn?.(`bug-solver: ${holder.unavailableReason}`)
      }
    } else if (child.connection?.fetch?.register) {
      // 兼容仅有 connection.fetch 的测试/宿主（非真实窗口请求）。
      child.effect(
        () => registerRoutes(child.connection.fetch, () => holder.service, () => holder.unavailableReason),
        'bug-solver dispatch fetch routes',
      )
    } else {
      holder.unavailableReason = '缺少 webServer/connection.fetch，无法注册桥路由'
    }

    if (holder.service) return

    const build = (host) => {
      try {
        const built = createHostService(host, config)
        holder.service = built.service
        holder.gateway = built.gateway
        holder.unavailableReason = null
      } catch (error) {
        holder.unavailableReason = `真实 Host 服务不可用：${String(error?.message ?? error)}`
        child.logger?.warn?.(`bug-solver: ${holder.unavailableReason}`)
      }
    }

    const attach = (host) => {
      host.effect(() => {
        build(host)
        return () => {
          holder.gateway?.dispose?.()
          holder.gateway = null
          holder.service = null
          holder.unavailableReason = DEFAULT_UNAVAILABLE
        }
      }, 'bug-solver host session gateway')
    }

    const missing = missingHostServices(child)
    if (missing.length === 0) {
      attach(child)
    } else {
      holder.unavailableReason = `缺少 Host 服务：${missing.join(', ')}`
      // 等待 Host 服务就绪；未就绪期间路由保持 503，插件不崩。
      child.inject(REQUIRED_HOST_SERVICES, (host) => {
        if (missingHostServices(host).length > 0) return
        attach(host)
      })
    }
  })
}
