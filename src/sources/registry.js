/**
 * The source registry: the single place that describes a built-in source.
 *
 * One entry carries everything the pipeline and the configuration layer need:
 *
 * - identity the reader shows (`label`, `short`, `kind`);
 * - `defaults` plus the `validateConfig` that owns those keys;
 * - the two adapter functions (`list`, optional `extract`);
 * - the two per-source policies: `tracksSeen` (discovery memory) and
 *   `onExtractFailure` (`excerpt` keeps a paper with its abstract, `skip`
 *   drops a blog post whose page could not be read).
 *
 * Adding a source is therefore: add the module, add one entry here. The run's
 * adapter table, the digest's source metadata and the config defaults/validation
 * are derived from this registry, so no third copy exists to forget.
 */
import {
  DEFAULT_ARXIV_CONFIG,
  extractArxivPaper,
  listArxiv,
  validateArxivConfig,
} from './arxiv.js'
import {
  DEFAULT_DEEPSEEK_CONFIG,
  extractDeepSeekArticle,
  listDeepSeek,
  validateDeepSeekConfig,
} from './deepseek.js'
import { DEFAULT_HF_CONFIG, listHf, validateHfConfig } from './hf.js'
import {
  DEFAULT_ANTHROPIC_CONFIG,
  extractAnthropicArticle,
  listAnthropic,
  validateAnthropicConfig,
} from './anthropic.js'
import {
  DEFAULT_KIMI_CONFIG,
  extractKimiArticle,
  listKimi,
  validateKimiConfig,
} from './kimi.js'
import {
  DEFAULT_OPENAI_CONFIG,
  extractOpenAiArticle,
  listOpenAi,
  validateOpenAiConfig,
} from './openai.js'

/**
 * HF is a heat-only source: its candidates point at the arXiv body
 * (`extractVia: 'arxiv'`), so the registry describes its listing policy but has
 * no extractor of its own.
 */
export const SOURCES = {
  arxiv: {
    id: 'arxiv',
    kind: 'paper',
    label: 'arXiv',
    short: 'A',
    defaults: DEFAULT_ARXIV_CONFIG,
    tracksSeen: false,
    onExtractFailure: 'excerpt',
    list: listArxiv,
    extract: extractArxivPaper,
    validateConfig: validateArxivConfig,
  },
  deepseek: {
    id: 'deepseek',
    kind: 'blog',
    label: 'DeepSeek',
    short: 'D',
    defaults: DEFAULT_DEEPSEEK_CONFIG,
    tracksSeen: false,
    onExtractFailure: 'skip',
    list: listDeepSeek,
    extract: extractDeepSeekArticle,
    validateConfig: validateDeepSeekConfig,
  },
  hf: {
    id: 'hf',
    kind: 'paper',
    label: 'Hugging Face',
    short: 'H',
    defaults: DEFAULT_HF_CONFIG,
    tracksSeen: false,
    onExtractFailure: 'excerpt',
    list: listHf,
    validateConfig: validateHfConfig,
  },
  anthropic: {
    id: 'anthropic',
    kind: 'blog',
    label: 'Anthropic',
    short: 'C',
    defaults: DEFAULT_ANTHROPIC_CONFIG,
    tracksSeen: true,
    onExtractFailure: 'skip',
    list: listAnthropic,
    extract: extractAnthropicArticle,
    validateConfig: validateAnthropicConfig,
  },
  kimi: {
    id: 'kimi',
    kind: 'blog',
    label: 'Kimi',
    short: 'K',
    defaults: DEFAULT_KIMI_CONFIG,
    tracksSeen: false,
    onExtractFailure: 'skip',
    list: listKimi,
    extract: extractKimiArticle,
    validateConfig: validateKimiConfig,
  },
  openai: {
    id: 'openai',
    kind: 'blog',
    label: 'OpenAI',
    short: 'O',
    defaults: DEFAULT_OPENAI_CONFIG,
    tracksSeen: false,
    onExtractFailure: 'excerpt',
    list: listOpenAi,
    extract: extractOpenAiArticle,
    validateConfig: validateOpenAiConfig,
  },
}

export const SOURCE_IDS = Object.keys(SOURCES)

/** One registry entry, or null for a source supplied through `adapters`. */
export function sourceDefinition(id) {
  return Object.prototype.hasOwnProperty.call(SOURCES, id) ? SOURCES[id] : null
}

/** The reader-facing metadata list the digest embeds (`sources`). */
export function sourceMetadata() {
  return SOURCE_IDS.map(id => ({
    id,
    label: SOURCES[id].label,
    short: SOURCES[id].short,
  }))
}

/** The label for a source id, used by the run record's error entries. */
export function sourceLabel(id) {
  return SOURCES[id]?.label ?? id
}
