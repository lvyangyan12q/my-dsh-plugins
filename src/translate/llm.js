/**
 * OpenAI-compatible Chat Completions transport for translation.
 *
 * Endpoint, key and model come from the environment by contract:
 * `PAPER_READER_LLM_BASE_URL`, `PAPER_READER_LLM_API_KEY`,
 * `PAPER_READER_LLM_MODEL`. A config-file value is a fallback (so a scheduled
 * run can pin a model), and an incomplete configuration is reported by name
 * rather than guessed at.
 *
 * This module also owns the two pure parts of the protocol: the prompt and the
 * strict reply parser. A reply is accepted only when it carries exactly the
 * ids that were sent, in the same order, one non-empty translation each: a
 * merged, reordered or truncated reply is a failed request, never silently
 * applied.
 */
export const LLM_ENV = {
  baseUrl: 'PAPER_READER_LLM_BASE_URL',
  apiKey: 'PAPER_READER_LLM_API_KEY',
  model: 'PAPER_READER_LLM_MODEL',
}

export const DEFAULT_TARGET_LANGUAGE = 'zh'
export const DEFAULT_TIMEOUT_MS = 60_000
export const DEFAULT_BATCH_SIZE = 8

const LANGUAGE_NAMES = { en: 'English', zh: 'Simplified Chinese' }

function clean(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Resolve the endpoint settings. Explicit environment values win over the
 * config file; `missing` names every variable the user still has to set.
 */
export function resolveLlmSettings(env = {}, config = {}) {
  const translation = config.translation ?? {}
  const baseUrl = clean(env[LLM_ENV.baseUrl]) ?? clean(translation.baseUrl)
  const apiKey = clean(env[LLM_ENV.apiKey]) ?? clean(translation.apiKey)
  const model = clean(env[LLM_ENV.model]) ?? clean(translation.model)
  const missing = []
  if (!baseUrl) missing.push(LLM_ENV.baseUrl)
  if (!apiKey) missing.push(LLM_ENV.apiKey)
  if (!model) missing.push(LLM_ENV.model)

  return {
    configured: missing.length === 0,
    missing,
    baseUrl,
    apiKey,
    model,
    targetLanguage: translation.targetLanguage === 'en' ? 'en' : DEFAULT_TARGET_LANGUAGE,
    timeoutMs: Number(translation.timeoutMs) > 0 ? Number(translation.timeoutMs) : DEFAULT_TIMEOUT_MS,
    batchSize: Number.isInteger(translation.batchSize) ? translation.batchSize : DEFAULT_BATCH_SIZE,
    retries: Number.isInteger(translation.retries) && translation.retries >= 0 ? translation.retries : 2,
    dailyTokenBudget: Number.isFinite(translation.dailyTokenBudget) && translation.dailyTokenBudget > 0
      ? Math.floor(translation.dailyTokenBudget)
      : 300_000,
  }
}

/** `/v1` → `/v1/chat/completions`; an explicit endpoint is kept as is. */
export function chatCompletionsUrl(baseUrl) {
  const trimmed = String(baseUrl ?? '').replace(/\/+$/, '')
  return /\/chat\/completions$/.test(trimmed) ? trimmed : `${trimmed}/chat/completions`
}

/** Host only: safe for logs and run records, never carries a key or query. */
export function endpointHost(baseUrl) {
  try {
    return new URL(baseUrl).host
  } catch {
    return null
  }
}

/** Rough input+output cost, used to stop before spending the whole budget. */
export function estimateTokens(units) {
  const chars = units.reduce((total, unit) => total + unit.text.length, 0)
  return Math.max(1, Math.ceil(chars / 4) * 2)
}

export function languageName(language) {
  return LANGUAGE_NAMES[language === 'zh' ? 'zh' : 'en']
}

function glossaryLines(glossary) {
  return glossary.terms
    .map(term => `- ${term.source} → ${term.target}`)
    .join('\n')
}

/**
 * System + user messages for one batch.
 *
 * The user message is a JSON array of `{ id, text }`, and the model is asked
 * to answer in the same shape: ids are positional, so the parser can reject a
 * reply that drops, adds or reorders a block instead of aligning by guesswork.
 */
export function buildTranslationMessages({ units, glossary, sourceLanguage, targetLanguage }) {
  const system = [
    'You are a precise translator for a daily paper-reading tool.',
    `Translate each item from ${languageName(sourceLanguage)} to ${languageName(targetLanguage)}.`,
    'Return ONLY a JSON array with one object per input item, in the same order:',
    '[{"id":"<the id you received>","translation":"<translated text>"}]',
    'Rules:',
    '- Use exactly the ids you received; never merge, split, drop, reorder or add items.',
    '- Translate the complete text; do not summarize or explain.',
    '- Keep formulas, code, URLs, citation keys and inline LaTeX unchanged.',
    '- When a glossary term appears, translate it exactly as the glossary says.',
    'Glossary:',
    glossaryLines(glossary) || '- (none)',
  ].join('\n')

  const user = JSON.stringify(units.map((unit, index) => ({ id: `u${index}`, text: unit.text })))
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

function replyError(message, extra = {}) {
  return Object.assign(new Error(message), { code: 'translation_alignment' }, extra)
}

function stripFences(content) {
  const text = String(content ?? '').trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text)
  if (fenced) return fenced[1].trim()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

/**
 * Parse one reply against the ids that were sent.
 *
 * Throws `translation_alignment` for anything that is not exactly one
 * non-empty translation per id, in order.
 */
export function parseTranslations(content, expectedIds) {
  let parsed
  try {
    parsed = JSON.parse(stripFences(content))
  } catch {
    throw replyError('the model did not return JSON')
  }
  if (!Array.isArray(parsed)) throw replyError('the model did not return a JSON array')
  if (parsed.length !== expectedIds.length) {
    throw replyError(`the model returned ${parsed.length} blocks for ${expectedIds.length}`)
  }
  const translations = []
  for (let index = 0; index < expectedIds.length; index += 1) {
    const entry = parsed[index]
    if (!entry || typeof entry.id !== 'string' || entry.id !== expectedIds[index]) {
      throw replyError(`block ${index} does not match the sent id (expected ${expectedIds[index]})`)
    }
    const translation = typeof entry.translation === 'string' ? entry.translation.trim() : ''
    if (!translation) throw replyError(`block ${index} has no translation`)
    translations.push(translation)
  }
  return translations
}
