/**
 * The source registry.
 *
 * One entry per source, describing everything the pipeline needs without
 * branching on source ids: the display metadata, the config defaults and
 * validation, how to list candidates, how to extract one item, and the two
 * policies that differ between papers and blogs:
 *
 * - `tracksSeen`: the adapter compares its discovery index against URLs seen on
 *   earlier days (Anthropic's sitemap archive);
 * - `onExtractFailure`: `excerpt` keeps a paper with an abstract fallback,
 *   `skip` drops a blog post whose page could not be read.
 *
 * Adding a source means adding a module and one entry here.
 */
import { ARXIV_SOURCE } from './arxiv.js'
import { ANTHROPIC_SOURCE } from './anthropic.js'
import { KIMI_SOURCE } from './kimi.js'

export const SOURCES = {
  arxiv: ARXIV_SOURCE,
  anthropic: ANTHROPIC_SOURCE,
  kimi: KIMI_SOURCE,
}

export const SOURCE_IDS = Object.keys(SOURCES)

/** Reader metadata written into every digest. */
export const SOURCE_META = SOURCE_IDS.map(id => ({
  id,
  label: SOURCES[id].label,
  short: SOURCES[id].short,
}))

/** One registry entry, or null for an unknown id. */
export function sourceDefinition(id) {
  return Object.prototype.hasOwnProperty.call(SOURCES, id) ? SOURCES[id] : null
}
