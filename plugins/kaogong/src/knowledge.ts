/**
 * Pure knowledge-base retrieval. No runtime dependencies: it filters and
 * ranks structured study notes by subject, knowledge point, kind, and a
 * keyword over title/content/tags (no embeddings, per the design decision).
 * @module kaogong/knowledge
 */

import type { KnowledgeEntry, KnowledgeKind } from './types.ts'

/** Retrieval query. */
export interface KnowledgeQuery {
  /** 科目（精确）. */
  subject?: string
  /** 考点（子串匹配）. */
  knowledgePoint?: string
  /** 类型（精确）. */
  kind?: KnowledgeKind
  /** 关键词，按标题/标签/正文命中加权排序. */
  keyword?: string
}

/**
 * Filter and rank knowledge entries.
 * @param entries - the full knowledge base.
 * @param query - retrieval controls.
 * @returns the matched entries, best first.
 */
export function searchKnowledge(entries: KnowledgeEntry[], query: KnowledgeQuery): KnowledgeEntry[] {
  let pool = entries.filter(entry =>
    (!query.subject || entry.subject === query.subject)
    && (!query.knowledgePoint || entry.knowledgePoint.includes(query.knowledgePoint))
    && (!query.kind || entry.kind === query.kind)
  )

  const keyword = query.keyword?.trim().toLowerCase()
  if (keyword) {
    const scored = pool.map((entry) => {
      let score = 0
      if (entry.title.toLowerCase().includes(keyword)) score += 2
      if (entry.tags.some(tag => tag.toLowerCase().includes(keyword))) score += 2
      if (entry.content.toLowerCase().includes(keyword)) score += 1
      return { entry, score }
    }).filter(item => item.score > 0)
    scored.sort((a, b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt))
    return scored.map(item => item.entry)
  }
  return pool.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}
