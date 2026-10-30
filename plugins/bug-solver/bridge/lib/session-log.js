/**
 * 会话日志的纯函数层：只读对话镜像与「完成信号」都从 DSH `session/event`
 * 持久化事件（`{ seq, time, type, data }`）推导，不依赖 DOM、不信任内存事件。
 *
 * - requestId 是桥的确定性 id：`<runId>:plan:<round>:<attempt>` / `<runId>:fix:<round>` /
 *   `<runId>:review:<round>`；解析后用于给镜像消息归类。
 * - 一条 user/message 的 `data.source.rpcId` 命中 requestId，才算「本请求被准入」；
 *   之后同一 turn 的 turn/end 才是它的完成信号。
 * - 文本统一交给调用方的 redactor 脱敏，并在长度上限处截断。
 */

const MAX_TEXT_CHARS = 4000
const MAX_TOOL_CHARS = 600
const REQUEST_ID_PATTERN = /^([^:]+):(plan|fix|review):(\d+)(?::(\d+))?$/
const STAGES = new Set(['plan', 'fix', 'review'])

const asString = (value) => (typeof value === 'string' ? value : '')

/**
 * 拼确定性 requestId（与 parseRequestId 同一契约）：
 * - plan 总是带 attempt：`<runId>:plan:<round>:<attempt>`
 * - fix/review 首次为 `<runId>:fix|review:<round>`，重发才追加 attempt。
 * @param {{ runId: string, stage: 'plan'|'fix'|'review', round: number, attempt?: number }} parts
 * @returns {string}
 */
export function buildRequestId({ runId, stage, round, attempt = 1 } = {}) {
  if (typeof runId !== 'string' || runId === '') throw new Error('buildRequestId 需要 runId')
  if (!STAGES.has(stage)) throw new Error(`buildRequestId 不支持的阶段：${String(stage)}`)
  if (!Number.isInteger(round) || round < 1) throw new Error('buildRequestId 需要 round >= 1')
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error('buildRequestId 需要 attempt >= 1')
  const base = `${runId}:${stage}:${round}`
  return stage === 'plan' || attempt > 1 ? `${base}:${attempt}` : base
}

function limit(text, max) {
  const value = asString(text)
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/**
 * 解析确定性 requestId。
 * @param {unknown} requestId
 * @returns {{ runId: string | null, stage: 'plan' | 'fix' | 'review' | null, round: number | null, attempt: number | null }}
 */
export function parseRequestId(requestId) {
  const match = REQUEST_ID_PATTERN.exec(asString(requestId))
  if (!match) return { runId: null, stage: null, round: null, attempt: null }
  return {
    runId: match[1],
    stage: match[2],
    round: Number(match[3]),
    attempt: match[4] === undefined ? null : Number(match[4]),
  }
}

/**
 * 工具名分类（窗口3 ChatMessage.toolName 的取值：ssh|bash|read|edit|null）。
 * 同时看工具名和参数文本：`bash` 工具里跑 `ssh root@host ...` 仍归为 ssh。
 * @param {unknown} name
 * @param {unknown} [detail]
 * @returns {'ssh' | 'bash' | 'read' | 'edit' | null}
 */
export function classifyToolName(name, detail = '') {
  const haystack = `${asString(name)} ${asString(detail)}`.toLowerCase()
  if (!haystack.trim()) return null
  if (/\bssh\b|ssh\s/.test(haystack)) return 'ssh'
  if (/bash|pwsh|powershell|shell|terminal|exec|command/.test(haystack)) return 'bash'
  if (/edit|write|patch|replace|create|mkdir|delete|remove|rename|move/.test(haystack)) return 'edit'
  if (/read|view|open|cat\b|grep|glob|search|list|ls\b|find|tree|stat\b/.test(haystack)) return 'read'
  return null
}

/**
 * 提取消息的模型可见文本（跳过 reasoning/tool-call 块）。
 * @param {{ content?: unknown } | null | undefined} message
 * @returns {string}
 */
export function extractText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
}

/**
 * 在权威日志里定位一个 requestId 对应的 turn，并给出该 turn 的结束原因与最终 assistant 文本。
 * 返回 null 表示「日志里还看不到本请求的明确结束事实」——调用方应按未知处理，不自动重发。
 * @param {readonly any[]} events
 * @param {string} requestId
 * @returns {{ turn: number, reason: any, finalText: string, endSeq: number | null } | null}
 */
export function locateTurn(events, requestId) {
  if (!Array.isArray(events) || typeof requestId !== 'string' || requestId === '') return null
  let turn = null
  let messageIndex = -1
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]
    if (!event || typeof event !== 'object') continue
    if (event.type === 'turn/start') turn = event.data?.turn ?? turn
    else if (event.type === 'user/message' && event.data?.source?.rpcId === requestId) {
      messageIndex = index
      break
    }
  }
  if (messageIndex < 0 || turn === null) return null

  const end = events
    .slice(messageIndex + 1)
    .find((event) => event?.type === 'turn/end' && event.data?.turn === turn)
  if (!end) return null

  const assistants = events.filter(
    (event) => event?.type === 'assistant/message' && event.data?.turn === turn,
  )
  const finalText = assistants.length > 0 ? extractText(assistants[assistants.length - 1].data?.message) : ''
  return { turn, reason: end.data?.reason ?? { kind: 'unknown' }, finalText, endSeq: Number.isFinite(end.seq) ? end.seq : null }
}

/** 日志里最后一条 assistant 消息的文本（审核结论兜底）。 */
export function lastAssistantText(events) {
  if (!Array.isArray(events)) return ''
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'assistant/message') continue
    const text = extractText(event.data?.message)
    if (text.trim()) return text
  }
  return ''
}

function describeToolCall(name, rawArguments, redact) {
  const label = asString(name) || 'tool'
  let detail = ''
  const raw = asString(rawArguments)
  if (raw.trim()) {
    try {
      const args = JSON.parse(raw)
      if (args && typeof args === 'object' && !Array.isArray(args)) {
        detail =
          ['command', 'cmd', 'path', 'file_path', 'filePath', 'pattern', 'query', 'url']
            .map((key) => (typeof args[key] === 'string' ? args[key] : null))
            .filter(Boolean)
            .join(' ') || JSON.stringify(args)
      } else {
        detail = String(args)
      }
    } catch {
      detail = raw
    }
  }
  return limit(redact([label, detail].filter(Boolean).join(' ')), MAX_TOOL_CHARS)
}

/**
 * 会话日志 → 只读 ChatMessage 列表：user/assistant/tool，plan/review 按发起该 turn 的
 * requestId 归类。只读：本函数只产出值，没有写回会话的路径。
 * @param {readonly any[]} events
 * @param {{ redactor?: { redact: (value: unknown) => string } }} [options]
 * @returns {Array<{ seq: number, at: number, role: string, kind: string, text: string, toolName?: string }>}
 */
export function extractMessages(events, { redactor } = {}) {
  const redact = (value) => (typeof redactor?.redact === 'function' ? redactor.redact(value) : asString(value))
  const items = []
  const toolNames = new Map()
  let turn = null
  let turnKind = null

  ;(Array.isArray(events) ? events : []).forEach((event, index) => {
    if (!event || typeof event !== 'object') return
    const seq = Number.isFinite(Number(event.seq)) ? Number(event.seq) : index + 1
    const at = Number.isFinite(Number(event.time)) ? Number(event.time) : 0

    if (event.type === 'turn/start') {
      turn = event.data?.turn ?? turn
      turnKind = null
      return
    }

    if (event.type === 'user/message') {
      const stage = parseRequestId(event.data?.source?.rpcId).stage
      if (stage === 'plan' || stage === 'review') turnKind = stage
      const text = limit(redact(extractText(event.data?.message)), MAX_TEXT_CHARS)
      if (text.trim()) items.push({ seq, at, role: 'user', kind: 'text', text })
      return
    }

    if (event.type === 'assistant/message') {
      const text = limit(redact(extractText(event.data?.message)), MAX_TEXT_CHARS)
      if (!text.trim()) return
      items.push({ seq, at, role: 'assistant', kind: turnKind ?? 'text', text })
      return
    }

    if (event.type === 'tool/call') {
      const name = asString(event.data?.name) || null
      const callId = event.data?.callId
      const text = describeToolCall(name, event.data?.arguments, redact)
      const toolName = classifyToolName(name, text)
      if (callId !== undefined && name) toolNames.set(callId, { name, toolName })
      items.push({ seq, at, role: 'tool', kind: 'tool', text, ...(toolName ? { toolName } : {}) })
      return
    }

    if (event.type === 'tool/result') {
      const callId = event.data?.message?.toolCallId
      const call = callId === undefined ? undefined : toolNames.get(callId)
      const text = limit(redact(extractText(event.data?.message)), MAX_TOOL_CHARS)
      const toolName = call?.toolName ?? classifyToolName(call?.name, text)
      items.push({
        seq,
        at,
        role: 'tool',
        kind: 'tool',
        text: text || asString(call?.name),
        ...(toolName ? { toolName } : {}),
      })
    }
  })

  return items
}
