/**
 * Translation glossary.
 *
 * The built-in list covers the vocabulary this reader meets every day (model
 * names, method names, common abbreviations); a user can extend or override it
 * from `config.json::translation.glossary`. The effective list is normalized
 * and hashed into a version, which is part of the translation cache key, so
 * editing the glossary invalidates only the entries it could change.
 *
 * `translation.glossaryVersion` can pin a version manually when the user knows
 * the meaning changed without a textual edit (for example a new prompt).
 */
import { createHash } from 'node:crypto'

export const BUILTIN_GLOSSARY = [
  { source: 'agent', target: '智能体' },
  { source: 'agents', target: '智能体' },
  { source: 'agentic', target: '智能体式的' },
  { source: 'alignment', target: '对齐' },
  { source: 'benchmark', target: '基准测试' },
  { source: 'chain-of-thought', target: '思维链' },
  { source: 'context window', target: '上下文窗口' },
  { source: 'dataset', target: '数据集' },
  { source: 'embedding', target: '嵌入' },
  { source: 'fine-tuning', target: '微调' },
  { source: 'inference', target: '推理' },
  { source: 'large language model', target: '大语言模型' },
  { source: 'language model', target: '语言模型' },
  { source: 'mixture of experts', target: '专家混合' },
  { source: 'multimodal', target: '多模态' },
  { source: 'prompt', target: '提示词' },
  { source: 'reasoning', target: '推理' },
  { source: 'reinforcement learning', target: '强化学习' },
  { source: 'retrieval-augmented generation', target: '检索增强生成' },
  { source: 'token', target: 'token' },
  { source: 'transformer', target: 'Transformer' },
]

/** Merge built-ins with user terms; user entries win on the same source. */
export function resolveGlossary(translation = {}) {
  const merged = new Map()
  const remember = (term) => {
    if (!term || typeof term.source !== 'string' || typeof term.target !== 'string') return
    const source = term.source.trim()
    const target = term.target.trim()
    if (!source || !target) return
    merged.set(source.toLowerCase(), { source, target })
  }
  for (const term of BUILTIN_GLOSSARY) remember(term)
  for (const term of Array.isArray(translation.glossary) ? translation.glossary : []) remember(term)

  const terms = [...merged.values()].sort((left, right) => left.source.localeCompare(right.source))
  const digest = createHash('sha256').update(JSON.stringify(terms)).digest('hex').slice(0, 12)

  const explicit = translation.glossaryVersion
  const pinned = explicit === null || explicit === undefined ? '' : String(explicit).trim()
  return { version: pinned || `g-${digest}`, terms }
}
