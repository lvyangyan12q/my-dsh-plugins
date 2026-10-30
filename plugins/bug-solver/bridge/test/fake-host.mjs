/**
 * 测试用 fake DSH Host：只实现 HostSessionGateway 依赖的公开服务与 `session/event`，
 * 记录调用、可脚本化失败，并提供 `completeTurn()` 模拟「user/message(rpcId) → turn/end」。
 * 不 spawn、不碰真实 profile / 会话存储。
 */
let clockSeq = 0
const nextTime = () => 1_700_000_000_000 + clockSeq++

export function createFakeHost({ profileDir = null } = {}) {
  const workspaces = new Map()
  const sessions = new Map()
  const stored = new Set()
  const listeners = new Map()
  const missing = new Set()
  const calls = {
    workspaceCreate: [],
    create: [],
    rename: [],
    prompt: [],
    cancel: [],
    stat: [],
    open: [],
    flush: 0,
  }
  const behavior = {
    createThrows: null,
    createReturns: null,
    promptThrows: null,
    renameThrows: null,
    resolveAgentError: null,
  }
  let workspaceSeq = 0
  let turnSeq = 0
  let beforeFlush = null

  function ensureSession(sessionId, cwd = process.cwd()) {
    if (sessions.has(sessionId)) return sessions.get(sessionId)
    const events = []
    const session = {
      id: sessionId,
      header: { id: sessionId, cwd },
      events,
      append(type, data) {
        const event = { seq: events.length + 1, time: nextTime(), type, data }
        events.push(event)
        return event
      },
      snapshotEvents() {
        return [...events]
      },
    }
    sessions.set(sessionId, session)
    stored.add(sessionId)
    return session
  }

  const workspaceRegistry = {
    async create(path) {
      calls.workspaceCreate.push(path)
      const key = process.platform === 'win32' ? path.toLowerCase() : path
      if (!workspaces.has(key)) {
        workspaces.set(key, {
          id: `ws-${++workspaceSeq}`,
          path,
          title: 'workspace',
          sessionIds: [],
          async attachSession(sessionId) {
            this.sessionIds.push(sessionId)
          },
        })
      }
      return workspaces.get(key)
    },
  }

  const sessionController = {
    async create(request) {
      calls.create.push(structuredClone(request))
      if (behavior.createThrows) throw behavior.createThrows
      if (behavior.createReturns) return { sessionId: behavior.createReturns }
      if (typeof request.sessionId !== 'string') throw new Error('fake host 需要预生成 sessionId')
      const workspace = [...workspaces.values()].find((row) => row.id === request.workspaceId)
      ensureSession(request.sessionId, workspace?.path ?? process.cwd())
      return { sessionId: request.sessionId }
    },
    async rename(request) {
      calls.rename.push(structuredClone(request))
      if (behavior.renameThrows) throw behavior.renameThrows
      const session = sessions.get(request.sessionId)
      if (session) session.append('session/title', { title: request.title })
      return { title: request.title, seq: session?.events.length ?? 1 }
    },
    async prompt(request, signal) {
      calls.prompt.push({ ...structuredClone(request), signal })
      if (behavior.promptThrows) throw behavior.promptThrows
      return { accepted: true }
    },
    cancel(request) {
      calls.cancel.push(structuredClone(request))
      return { ok: true }
    },
    async resolveAgent(sessionId) {
      const session = sessions.get(sessionId)
      if (!session || behavior.resolveAgentError) return { error: { code: 'session/not-found' } }
      return { agent: { session } }
    },
    async projections() {
      return null
    },
  }

  const sessionPersistence = {
    async stat(sessionId) {
      calls.stat.push(sessionId)
      if (!stored.has(sessionId)) return undefined
      return { header: { id: sessionId }, formatStatus: 'current' }
    },
    async flush() {
      calls.flush += 1
      // 让测试有机会在下一次权威重读前改写日志（验证「不直接信任事件」）。
      await Promise.resolve()
      if (beforeFlush) {
        const hook = beforeFlush
        beforeFlush = null
        await hook()
      }
    },
    async open(sessionId, access) {
      calls.open.push({ sessionId, access })
      const session = sessions.get(sessionId)
      if (!session) throw new Error(`session not found: ${sessionId}`)
      return {
        async read() {
          return { events: session.events.map((event) => structuredClone(event)) }
        },
        async close() {},
      }
    },
  }

  const sandboxPolicy = {
    resolve({ session } = {}) {
      const events = session?.snapshotEvents?.() ?? []
      const last = [...events].reverse().find((event) => event.type === 'sandbox/mode')
      return { mode: last?.data?.mode ?? 'read-only', workspaceRoot: session?.header?.cwd }
    },
  }

  const agentPresets = {
    async resolve(id) {
      return id ? { id } : { id: 'default' }
    },
  }

  const host = {
    calls,
    behavior,
    sessions,
    stored,
    missing,
    on(name, listener) {
      const list = listeners.get(name) ?? []
      list.push(listener)
      listeners.set(name, list)
      return () => {
        const current = listeners.get(name) ?? []
        const index = current.indexOf(listener)
        if (index >= 0) current.splice(index, 1)
      }
    },
    listenerCount(name) {
      return (listeners.get(name) ?? []).length
    },
    get(name) {
      if (missing.has(name)) return undefined
      switch (name) {
        case 'sessionController':
          return sessionController
        case 'workspaceRegistry':
          return workspaceRegistry
        case 'sessionPersistence':
          return sessionPersistence
        case 'sandboxPolicy':
          return sandboxPolicy
        case 'agentPresets':
          return agentPresets
        case 'sessions':
          return { get: (sessionId) => sessions.get(sessionId) }
        case 'profileContext':
          return profileDir ? { dir: profileDir } : undefined
        default:
          return undefined
      }
    },
    ensureSession,
    emit(sessionId, type, data) {
      const session = sessions.get(sessionId)
      if (!session) throw new Error(`fake host 没有会话：${sessionId}`)
      const event = { seq: session.events.length + 1, time: nextTime(), type, data }
      session.events.push(event)
      for (const listener of [...(listeners.get('session/event') ?? [])]) listener(session, event)
      return event
    },
    /** 模拟 Host：本请求进入原生轨迹，随后该 turn 以 reason 结束。 */
    completeTurn(sessionId, requestId, { reason = { kind: 'completed' }, finalText = '', turn = null } = {}) {
      if (!sessions.has(sessionId)) ensureSession(sessionId)
      const turnNumber = turn ?? ++turnSeq
      host.emit(sessionId, 'turn/start', { turn: turnNumber })
      host.emit(sessionId, 'user/message', {
        message: { role: 'user', content: [{ type: 'text', text: `prompt ${requestId}` }] },
        source: { kind: 'user', rpcId: requestId },
      })
      if (finalText) {
        host.emit(sessionId, 'assistant/message', {
          turn: turnNumber,
          step: 1,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: finalText }],
            source: { kind: 'model' },
          },
          stream: [],
        })
      }
      host.emit(sessionId, 'turn/end', { turn: turnNumber, reason })
      return turnNumber
    },
    /** 下一次 sessionPersistence.flush() 时执行 hook（在权威重读之前）。 */
    setBeforeFlush(hook) {
      beforeFlush = hook
    },
    patchLog(sessionId, mutate) {
      const session = sessions.get(sessionId)
      if (!session) throw new Error(`fake host 没有会话：${sessionId}`)
      mutate(session.events)
    },
  }

  return host
}
