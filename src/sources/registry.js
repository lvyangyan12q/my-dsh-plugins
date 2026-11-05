/**
 * The source registry.
 *
 * One entry per runnable source, describing the metadata and the two policies
 * that differ between papers and blogs:
 *
 * - `tracksSeen`: the adapter compares its discovery index against URLs seen on
 *   earlier days (Anthropic's sitemap archive);
 * - `onExtractFailure`: `excerpt` keeps a paper with an abstract fallback,
 *   `skip` drops a blog post whose page could not be read.
 *
 * The run pipeline also accepts `adapters` overrides (used by the proxy tests
 * and later source tickets), so this registry is the built-in set, not the
 * only set. Adding a built-in source means adding a module and one entry here.
 */
import { ARXIV_SOURCE } from './arxiv.js'
import { DEFAULT_DEEPSEEK_CONFIG, extractDeepSeekArticle, listDeepSeek } from './deepseek.js'
import { ANTHROPIC_SOURCE } from './anthropic.js'
import { KIMI_SOURCE } from './kimi.js'

const DEEPSEEK_SOURCE = {
  id: 'deepseek',
  kind: 'blog',
  label: 'DeepSeek',
  short: 'D',
  defaults: DEFAULT_DEEPSEEK_CONFIG,
  tracksSeen: false,
  onExtractFailure: 'skip',
  list: listDeepSeek,
  extract: extractDeepSeekArticle,
}

export const SOURCES = {
  arxiv: ARXIV_SOURCE,
  deepseek: DEEPSEEK_SOURCE,
  anthropic: ANTHROPIC_SOURCE,
  kimi: KIMI_SOURCE,
}

export const SOURCE_IDS = Object.keys(SOURCES)

/** One registry entry, or null for a source supplied through `adapters`. */
export function sourceDefinition(id) {
  return Object.prototype.hasOwnProperty.call(SOURCES, id) ? SOURCES[id] : null
}
