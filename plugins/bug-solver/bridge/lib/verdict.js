/**
 * 解析审核会话最终消息里的固定 JSON 结论块。
 * 约定：先给 ```json 代码块（verdict/summary/blocking/tests），再给人类可读说明。
 *
 * 映射（与窗口3 规格一致，唯一口径）：
 * - approve / request_changes / needs_info：状态机据此推进或暂停；
 * - blocked：审核主动要求停下，状态机映射为 needs_attention（不自动重发）；
 * - 解析失败：返回 null，状态机同样转 needs_attention 并保留脱敏原文；
 * - forked 不是 verdict，是 Host turn/end 的 reason.kind，状态机映射为 unknown（写进 run.error）。
 */

const VERDICTS = new Set(['approve', 'request_changes', 'needs_info', 'blocked'])

function stringList(value) {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : []
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function normalize(block) {
  return {
    verdict: block.verdict,
    summary: typeof block.summary === 'string' ? block.summary : '',
    blocking: stringList(block.blocking),
    tests: stringList(block.tests),
  }
}

/**
 * @param {unknown} message
 * @returns {{verdict: string, summary: string, blocking: string[], tests: string[]} | null}
 */
export function parseVerdict(message) {
  if (typeof message !== 'string' || message.trim() === '') return null

  const candidates = []
  for (const match of message.matchAll(/```json\s*([\s\S]*?)```/gi)) candidates.push(match[1])
  const first = message.indexOf('{')
  const last = message.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(message.slice(first, last + 1))

  for (const candidate of candidates) {
    try {
      const block = JSON.parse(candidate.trim())
      if (block && typeof block === 'object' && VERDICTS.has(block.verdict)) return normalize(block)
    } catch {
      // 继续尝试下一个候选块
    }
  }
  return null
}
