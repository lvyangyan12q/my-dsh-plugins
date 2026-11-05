/**
 * Direction classification shared by paper and blog adapters.
 *
 * The reader groups items by one of five directions. The rules are ordered from
 * most to least specific and the first hit wins, so a paper about agentic
 * reasoning is reported as `agent` rather than `reasoning`.
 */

/** Direction rules, most specific first; the first hit wins. */
export const DIRECTION_RULES = [
  {
    direction: 'agent',
    words: ['agent', 'agentic', 'tool use', 'tool-use', 'multi-agent', 'multiagent', 'autonomous agent'],
  },
  {
    direction: 'reasoning',
    words: ['reasoning', 'chain-of-thought', 'chain of thought', 'theorem', 'logic', 'test-time', 'inference-time'],
  },
  {
    direction: 'training',
    words: ['pretrain', 'pre-train', 'training', 'fine-tun', 'fine tun', 'rlhf', 'distillation', 'distill', 'scaling law', 'data mixture'],
  },
  {
    direction: 'alignment',
    words: ['alignment', 'safety', 'preference optimization', 'jailbreak', 'reward model', 'rlaif', 'red team'],
  },
  {
    direction: 'architecture',
    words: ['architecture', 'mixture-of-experts', 'mixture of experts', 'moe', 'attention', 'transformer', 'kernel', 'quantization', 'efficient inference'],
  },
]

/** Classify one item into a reader direction. */
export function classifyDirection({ title = '', summary = '' } = {}) {
  const haystack = `${title}\n${summary}`.toLowerCase()
  for (const rule of DIRECTION_RULES) {
    if (rule.words.some(word => haystack.includes(word))) return rule.direction
  }
  return 'architecture'
}

/** Trigger words that actually matched, used as searchable tags. */
export function matchedWords(entry) {
  const haystack = `${entry.title ?? ''}\n${entry.summary ?? ''}`.toLowerCase()
  const words = []
  for (const rule of DIRECTION_RULES) {
    for (const word of rule.words) {
      if (haystack.includes(word) && !words.includes(word)) words.push(word)
    }
  }
  return words.slice(0, 4)
}
