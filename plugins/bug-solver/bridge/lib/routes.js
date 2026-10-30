/**
 * HTTP 薄适配层：把 /api/bug-solver/* 的 Request 映射到 DispatchService。
 * 鉴权/Cookie/Origin 由连接层负责；这里只做业务校验、JSON 形状与错误码映射，不发 CORS 头。
 */
import { BadRequestError, BridgeError } from './errors.js'

export const ROUTES = [
  { name: 'start', method: 'POST' },
  { name: 'runs', method: 'GET' },
  { name: 'run', method: 'GET' },
  { name: 'approve-plan', method: 'POST' },
  { name: 'plan-feedback', method: 'POST' },
  { name: 'request-changes', method: 'POST' },
  { name: 'stop', method: 'POST' },
  { name: 'approve', method: 'POST' },
  { name: 'resume', method: 'POST' },
  { name: 'messages', method: 'GET' },
  { name: 'artifact', method: 'GET' },
  { name: 'writeback', method: 'POST' },
]

const POST_ROUTES = new Set([
  'start',
  'approve-plan',
  'plan-feedback',
  'request-changes',
  'stop',
  'approve',
  'resume',
  'writeback',
])

const DEFAULT_UNAVAILABLE = 'bug-solver 桥未配置（缺少 SessionGateway/RunStore）'

const json = (status, body) => Response.json(body, { status })

function isJsonRequest(request) {
  return (request.headers.get('content-type') ?? '').toLowerCase().includes('application/json')
}

async function readJson(request) {
  let body
  try {
    body = await request.json()
  } catch {
    throw new BadRequestError('bad-json', '请求体不是合法 JSON')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestError('bad-request', '请求体必须是 JSON 对象')
  }
  return body
}

function requireRunId(body) {
  if (typeof body.runId !== 'string' || body.runId.trim() === '') {
    throw new BadRequestError('bad-request', '缺少 runId', { details: { field: 'runId' } })
  }
  return body.runId.trim()
}

function redactValue(value, redactor) {
  if (typeof value === 'string') return redactor.redact(value)
  if (Array.isArray(value)) return value.map((item) => redactValue(item, redactor))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redactValue(item, redactor)]))
  }
  return value
}

function toResponse(error, redactor) {
  if (error instanceof BridgeError) {
    const body = { code: error.code, message: redactor.redact(error.message) }
    if (error.details !== undefined) body.details = redactValue(error.details, redactor)
    return json(error.status, body)
  }
  return json(500, {
    code: 'internal-error',
    message: redactor.redact(error?.message ?? String(error)),
  })
}

function queryNumber(params, key, fallback) {
  const raw = params.get(key)
  if (raw === null || raw === '') return fallback
  return Number(raw)
}

function queryOptionalNumber(params, key) {
  const raw = params.get(key)
  if (raw === null || raw === '') return null
  return Number(raw)
}

function downloadResponse(artifact) {
  const base = String(artifact.name).split('/').pop() || 'artifact.txt'
  const safe = base.replace(/["\\\r\n]/g, '_')
  return new Response(artifact.text, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(base)}`,
      'cache-control': 'no-store',
    },
  })
}

export async function handleRoute(name, service, request, unavailableReason) {
  if (!service) {
    const reason =
      typeof unavailableReason === 'string' && unavailableReason.trim() ? unavailableReason.trim() : DEFAULT_UNAVAILABLE
    return json(503, { code: 'bridge-unavailable', message: reason })
  }
  const redactor = service.redactor
  try {
    if (POST_ROUTES.has(name)) {
      if (!isJsonRequest(request)) {
        return json(415, { code: 'unsupported-media-type', message: '只接受 application/json' })
      }
      const body = await readJson(request)
      switch (name) {
        case 'start': {
          const draft = body.draft && typeof body.draft === 'object' ? body.draft : body
          const requestId = typeof body.requestId === 'string' ? body.requestId : undefined
          const result = await service.start(draft, { requestId })
          return json(200, { run: result.run, idempotent: result.idempotent })
        }
        case 'approve-plan': {
          const result = await service.approvePlan(requireRunId(body), { note: body.note })
          return json(200, { run: result.run })
        }
        case 'plan-feedback': {
          const result = await service.planFeedback(requireRunId(body), { feedback: body.feedback })
          return json(200, { run: result.run })
        }
        case 'request-changes': {
          const result = await service.requestChanges(requireRunId(body), { note: body.note })
          return json(200, { run: result.run })
        }
        case 'stop': {
          const result = await service.stop(requireRunId(body))
          return json(200, { run: result.run, idempotent: result.idempotent })
        }
        case 'approve': {
          const result = await service.approve(requireRunId(body))
          return json(200, { run: result.run, idempotent: result.idempotent })
        }
        case 'resume': {
          const result = await service.resume(requireRunId(body), { note: body.note })
          return json(200, { run: result.run })
        }
        case 'writeback': {
          const result = await service.writeBack({
            projectId: body.projectId,
            localPath: body.localPath,
            serviceMap: body.serviceMap,
          })
          return json(200, result)
        }
        default:
          return json(404, { code: 'unknown-route' })
      }
    }

    const params = new URL(request.url).searchParams
    switch (name) {
      case 'runs':
        return json(200, { runs: await service.listRuns() })
      case 'run': {
        // 兼容窗口3 页面使用的 ?id= 与内部/测试使用的 ?runId=
        const runId = params.get('runId') ?? params.get('id')
        if (!runId) throw new BadRequestError('bad-request', '缺少 runId', { details: { field: 'runId' } })
        return json(200, { run: await service.getRun(runId) })
      }
      case 'messages': {
        const runId = params.get('runId') ?? params.get('id')
        if (!runId) throw new BadRequestError('bad-request', '缺少 runId', { details: { field: 'runId' } })
        const page = await service.messages(runId, {
          role: params.get('role') ?? undefined,
          before: queryOptionalNumber(params, 'before'),
          limit: queryNumber(params, 'limit', 50),
        })
        return json(200, page)
      }
      case 'artifact': {
        const runId = params.get('runId') ?? params.get('id')
        if (!runId) throw new BadRequestError('bad-request', '缺少 runId', { details: { field: 'runId' } })
        const artifact = await service.artifact(runId, params.get('name') ?? '')
        const download = params.get('download')
        if (download === '1' || download === 'true') return downloadResponse(artifact)
        return json(200, artifact)
      }
      default:
        return json(404, { code: 'unknown-route' })
    }
  } catch (error) {
    return toResponse(error, redactor)
  }
}

/**
 * 注册全部路由，返回 disposer。
 * `service` 可以是服务实例，也可以是无参解析函数：真实 Host 适配在插件加载后才就绪，
 * 未就绪时解析为 null → 503（路由始终存在，不会变成 404）；`unavailableReason` 让真实原因到达用户。
 * @param {{ register: (spec: object) => (() => void) | void }} registry ctx.connection.fetch
 * @param {import('./dispatch-service.js').DispatchService | null | (() => import('./dispatch-service.js').DispatchService | null)} service
 * @param {string | null | (() => string | null)} [unavailableReason]
 */
export function registerRoutes(registry, service, unavailableReason) {
  const resolve = typeof service === 'function' ? service : () => service
  const reason = typeof unavailableReason === 'function' ? unavailableReason : () => unavailableReason
  const disposers = ROUTES.map(({ name, method }) => {
    const spec = {
      path: `/api/bug-solver/${name}`,
      methods: [method],
      fetch: (request) => handleRoute(name, resolve(), request, reason()),
    }
    if (method === 'POST') spec.requestBody = 'buffered'
    const dispose = registry.register(spec)
    return typeof dispose === 'function' ? dispose : null
  })
  return () => {
    for (const dispose of disposers) if (dispose) dispose()
  }
}
