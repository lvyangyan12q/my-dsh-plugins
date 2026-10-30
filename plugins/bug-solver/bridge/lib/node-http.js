/**
 * Node HTTP 适配层：窗口3 是普通 iframe，fetch 走的是宿主 webServer 的 exact 路由，
 * 不是客户端 RPC 的 `connection.fetch`（后者没有 owner Peer，普通 fetch 会 400）。
 * 鉴权与工作台同款：`connection.admit(req)`；这里只把 Node req/res 转成 fetch Request/Response。
 */
import { ROUTES, handleRoute } from './routes.js'

const sendJson = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

const readBody = async (req) => {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return chunks.length ? Buffer.concat(chunks) : null
}

/**
 * @param {{ register: (spec: object) => (() => void) | void }} webServer
 * @param {{ admit?: (req: any) => any }} connection
 * @param {() => any} resolveService
 * @param {() => string | null} resolveReason
 */
export function registerNodeRoutes(webServer, connection, resolveService, resolveReason) {
  const disposers = ROUTES.map(({ name, method }) => {
    const handler = async (req, res) => {
      try {
        const admitted = typeof connection?.admit === 'function' ? connection.admit(req) : null
        if (admitted && typeof admitted === 'object' && 'rejection' in admitted) {
          sendJson(res, Number(admitted.rejection) || 401, { code: 'unauthorized', message: '请登录当前 DSH。' })
          return
        }
        if (req.method !== method) {
          sendJson(res, 405, { code: 'method-not-allowed', message: `只支持 ${method}` })
          return
        }
        const url = new URL(String(req.url || '/'), 'http://dsh.internal')
        const headers = new Headers()
        for (const [key, value] of Object.entries(req.headers || {})) {
          if (typeof value === 'string') headers.set(key, value)
        }
        const body = method === 'GET' || method === 'HEAD' ? null : await readBody(req)
        const request = new Request(url, {
          method,
          headers,
          ...(body ? { body } : {}),
        })
        const response = await handleRoute(name, resolveService(), request, resolveReason())
        const outHeaders = {}
        response.headers.forEach((value, key) => { outHeaders[key] = value })
        res.writeHead(response.status, outHeaders)
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch (error) {
        sendJson(res, 500, { code: 'internal-error', message: String(error?.message ?? error) })
      }
    }
    const dispose = webServer.register({ kind: 'exact', path: `/api/bug-solver/${name}`, handler })
    return typeof dispose === 'function' ? dispose : null
  })
  return () => {
    for (const dispose of disposers) if (dispose) dispose()
  }
}
