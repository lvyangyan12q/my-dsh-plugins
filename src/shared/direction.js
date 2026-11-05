/**
 * Direction classifier shared by the source adapters.
 *
 * The reader groups items into five directions (Agent / 推理 / 训练 / 对齐 /
 * 架构). The rules are keyword based and intentionally simple: a source that
 * describes no category still lands in a readable bucket, and the tags keep the
 * matched words searchable.
 *
 * English rules are used for English text; the Chinese keywords cover the
 * Chinese-origin sources (DeepSeek) so their items are classified by their own
 * title rather than defaulting to one bucket.
 */

/** Direction rules, most specific first; the first hit wins. */
export const DIRECTION_RULES = [
  {
    direction: 'agent',
    words: ['agent', 'agentic', 'tool use', 'tool-use', 'multi-agent', 'multiagent', 'autonomous agent', '智能体', '工具调用'],
  },
  {
    direction: 'reasoning',
    words: ['reasoning', 'chain-of-thought', 'chain of thought', 'theorem', 'logic', 'test-time', 'inference-time', '推理', '思维链'],
  },
  {
    direction: 'training',
    words: ['pretrain', 'pre-train', 'training', 'fine-tun', 'fine tun', 'rlhf', 'distillation', 'distill', 'scaling law', 'data mixture', '训练', '微调', '蒸馏'],
  },
  {
    direction: 'alignment',
    words: ['alignment', 'safety', 'preference optimization', 'jailbreak', 'reward model', 'rlaif', 'red team', '对齐', '安全'],
  },
  {
    direction: 'architecture',
    words: ['architecture', 'mixture-of-experts', 'mixture of experts', 'moe', 'attention', 'transformer', 'kernel', 'quantization', 'efficient inference', '架构', '模型', '参数'],
  },
]

/** Classify a paper or article into one of the reader's directions. */
export function classifyDirection({ title = '', summary = '' } = {}) {
  const haystack = `${title}\n${summary}`.toLowerCase()
  for (const rule of DIRECTION_RULES) {
    if (rule.words.some(word => haystack.includes(word))) return rule.direction
  }
  return 'architecture'
}

/** Trigger words that actually matched, used as searchable tags. */
export function matchedWords({ title = '', summary = '' } = {}) {
  const haystack = `${title}\n${summary}`.toLowerCase()
  const words = []
  for (const rule of DIRECTION_RULES) {
    for (const word of rule.words) {
      if (haystack.includes(word) && !words.includes(word)) words.push(word)
    }
  }
  return words.slice(0, 4)
}
