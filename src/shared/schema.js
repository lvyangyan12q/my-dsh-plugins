/**
 * Digest contract (v2).
 *
 * Every item declares the language it was written in (`sourceLanguage`) and
 * stores human text as `{ original, translation }` pairs: the original in that
 * language, the translation in the other one. Blocks keep the same pairing, so
 * the reader never has to assume that English comes first.
 *
 * v1 digests (`titleZh` / `titleEn`, `blocks[].en` / `blocks[].zh`) are still
 * readable: they are normalized into the v2 shape, which gives the reader a
 * single code path and lets users keep an old digest file.
 *
 * Both plugin halves import this module: the host validates a user digest with
 * `validateDigest`, the client renders the result of `normalizeDigest`.
 */

export const SCHEMA_VERSION = 2
export const SOURCE_LANGUAGES = ['en', 'zh']

const TEXT_BLOCK_TYPES = new Set(['heading', 'paragraph'])
const NEUTRAL_TYPES = new Set(['equation', 'figure', 'code'])

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

/** A displayable, non-empty string, else null. */
function text(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function isTranslationState(value) {
  return value === 'pending' || value === 'complete' || value === 'partial'
}

function stateFor(explicit, translation) {
  if (isTranslationState(explicit)) return explicit
  return translation ? 'complete' : 'pending'
}

/** Does the value use the v2 `{ original, translation }` shape? */
function isPair(value) {
  return isObject(value) && (has(value, 'original') || has(value, 'translation'))
}

/**
 * Normalize a text pair. `legacy` supplies the v1 fallbacks when the value is
 * not already paired.
 */
function toPair(value, legacy = {}) {
  if (isPair(value)) {
    const translation = text(value.translation)
    return {
      original: text(value.original),
      translation,
      translationState: stateFor(value.translationState, translation),
    }
  }
  const translation = text(legacy.translation)
  return {
    original: text(legacy.original),
    translation,
    translationState: stateFor(legacy.state, translation),
  }
}

/** A pair that may legitimately be absent (equation notes, figure captions). */
function toOptionalPair(value, legacy = {}) {
  if (isPair(value)) return toPair(value)
  if (text(legacy.original) || text(legacy.translation)) return toPair(undefined, legacy)
  return null
}

export function normalizeBlock(raw) {
  if (!isObject(raw)) return null
  switch (raw.type) {
    case 'heading': {
      const pair = toPair(raw, { original: raw.en, translation: raw.zh, state: raw.zhState })
      if (!pair.original && !pair.translation) return null
      return { type: 'heading', level: Number(raw.level) || 1, ...pair }
    }
    case 'paragraph': {
      const pair = toPair(raw, { original: raw.en, translation: raw.zh, state: raw.zhState })
      if (!pair.original && !pair.translation) return null
      return { type: 'paragraph', ...pair }
    }
    case 'equation': {
      return {
        type: 'equation',
        display: typeof raw.display === 'string' ? raw.display : '',
        detail: typeof raw.detail === 'string' ? raw.detail : '',
        label: text(raw.label),
        note: toOptionalPair(raw.note, { original: raw.noteEn, translation: raw.noteZh }),
      }
    }
    case 'figure': {
      const caption = toOptionalPair(raw.caption, { original: raw.captionEn, translation: raw.captionZh })
      const diagram = isObject(raw.diagram)
        ? {
            title: text(raw.diagram.title),
            steps: Array.isArray(raw.diagram.steps) ? raw.diagram.steps.filter(step => typeof step === 'string') : [],
          }
        : null
      if (!caption && !diagram && !text(raw.image)) return null
      return { type: 'figure', diagram, image: text(raw.image), caption }
    }
    case 'code': {
      if (typeof raw.code !== 'string') return null
      return { type: 'code', code: raw.code, language: text(raw.language) }
    }
    default:
      return null
  }
}

function normalizeReadingMinutes(value) {
  if (value === null || value === undefined) return null
  const minutes = Number(value)
  return Number.isFinite(minutes) ? minutes : null
}

/**
 * The reason an item is an excerpt (`proxy_unavailable`, `http_403`, …). The
 * page renders `message`; `code` and `detail` stay available for the console
 * and later UI work.
 */
function normalizeExcerptReason(value) {
  if (!isObject(value)) return null
  const code = text(value.code)
  const message = text(value.message)
  if (!code && !message) return null
  return {
    code: code ?? 'excerpt',
    message: message ?? '仅显示节选',
    detail: text(value.detail),
  }
}

/**
 * Normalize one item into the v2 shape. Returns null when the item cannot be
 * rendered at all (no id, no title in either language).
 */
export function normalizeItem(raw) {
  if (!isObject(raw) || typeof raw.id !== 'string' || raw.id.length === 0) return null
  const sourceLanguage = raw.sourceLanguage === 'zh' ? 'zh' : 'en'
  const title = toPair(raw.title, { original: raw.titleEn, translation: raw.titleZh })
  if (!title.original && !title.translation) return null
  const summary = toPair(raw.summary, { original: raw.summaryEn, translation: raw.summaryZh })
  const blocks = Array.isArray(raw.blocks) ? raw.blocks.map(normalizeBlock).filter(Boolean) : []

  const pairs = blocks.filter(block => TEXT_BLOCK_TYPES.has(block.type))
  const total = pairs.length
  const done = pairs.filter(block => Boolean(block.translation)).length
  const explicit = raw.translationState ?? raw.translation?.status
  const derived = total === 0 || done === total ? 'complete' : done === 0 ? 'pending' : 'partial'
  const translationState = isTranslationState(explicit) ? explicit : derived

  return {
    id: raw.id,
    sourceId: text(raw.sourceId),
    sourceLanguage,
    title,
    summary,
    authors: Array.isArray(raw.authors) ? raw.authors.filter(author => typeof author === 'string') : [],
    org: text(raw.org),
    venue: text(raw.venue),
    published: text(raw.published),
    collectedAt: text(raw.collectedAt),
    direction: text(raw.direction),
    tags: Array.isArray(raw.tags) ? raw.tags.filter(tag => typeof tag === 'string') : [],
    readingMinutes: normalizeReadingMinutes(raw.readingMinutes),
    excerpt: raw.excerpt === true,
    excerptReason: normalizeExcerptReason(raw.excerptReason),
    url: text(raw.url),
    bookmarked: raw.bookmarked === true,
    read: raw.read === true,
    blocks,
    translationState,
    translation: { status: translationState, done, total },
  }
}

/**
 * Normalize a whole digest. A document may be the multi-day reader payload
 * (`days`) or one stored day file (`date` + `items`); both become `days`, so
 * the reading page keeps a single code path whether the host served the legacy
 * digest or one day out of the history. Returns null for a payload that cannot
 * be a digest at all, so the client can show an explicit error instead of an
 * empty page.
 */
export function normalizeDigest(digest) {
  if (!isObject(digest)) return null
  if (Array.isArray(digest.days)) {
    const days = []
    for (const day of digest.days) {
      if (!isObject(day) || typeof day.date !== 'string') continue
      const items = Array.isArray(day.items) ? day.items.map(normalizeItem).filter(Boolean) : []
      days.push({ ...day, items })
    }
    return {
      ...digest,
      schemaVersion: Number(digest.schemaVersion) || 1,
      days,
    }
  }
  if (typeof digest.date === 'string' && Array.isArray(digest.items)) {
    const items = digest.items.map(normalizeItem).filter(Boolean)
    return {
      ...digest,
      schemaVersion: Number(digest.schemaVersion) || 1,
      days: [{ date: digest.date, generatedAt: digest.generatedAt, run: digest.run, items }],
    }
  }
  return null
}

/**
 * Pick the text for a target language.
 *
 * `text` is the requested language when available. `fallback` is true when the
 * requested language is missing and the other one is shown instead, so the page
 * can mark it as untranslated.
 */
export function pickText(pair, sourceLanguage, targetLanguage) {
  if (!isObject(pair)) return { text: null, fallback: false }
  const original = text(pair.original)
  const translation = text(pair.translation)
  const wantsOriginal = (sourceLanguage === 'zh' ? 'zh' : 'en') === targetLanguage
  const preferred = wantsOriginal ? original : translation
  const secondary = wantsOriginal ? translation : original
  if (preferred) return { text: preferred, fallback: false }
  if (secondary) return { text: secondary, fallback: true }
  return { text: null, fallback: false }
}

export function otherLanguage(language) {
  return language === 'zh' ? 'en' : 'zh'
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function pushTextError(object, key, where, errors, { required = true } = {}) {
  if (!has(object, key)) {
    if (required) errors.push(`${where}.${key} must be present (string or null)`)
    return
  }
  const value = object[key]
  if (value !== null && typeof value !== 'string') {
    errors.push(`${where}.${key} must be a string or null`)
  }
}

function validatePair(pair, where, errors) {
  if (!isObject(pair)) {
    errors.push(`${where} must be an object with original/translation`)
    return
  }
  if (text(pair.original) === null) errors.push(`${where}.original must be a non-empty string`)
  pushTextError(pair, 'translation', where, errors)
}

function validateBlock(block, where, errors) {
  if (!isObject(block)) {
    errors.push(`${where} must be an object`)
    return
  }
  if (TEXT_BLOCK_TYPES.has(block.type)) {
    validatePair(block, where, errors)
    return
  }
  if (block.type === 'equation') {
    if (typeof block.display !== 'string') errors.push(`${where}.display must be a string`)
    if (has(block, 'note')) validatePair(block.note, `${where}.note`, errors)
    return
  }
  if (block.type === 'figure') {
    if (has(block, 'caption')) validatePair(block.caption, `${where}.caption`, errors)
    const hasBody = isObject(block.diagram) || text(block.image) !== null
    if (!hasBody && !has(block, 'caption')) {
      errors.push(`${where} needs a diagram, an image or a caption`)
    }
    return
  }
  if (block.type === 'code') {
    if (typeof block.code !== 'string') errors.push(`${where}.code must be a string`)
    return
  }
  if (typeof block.type !== 'string') errors.push(`${where}.type must be a string`)
}

function validateItemV2(item, where, errors) {
  if (!SOURCE_LANGUAGES.includes(item.sourceLanguage)) {
    errors.push(`${where}.sourceLanguage must be "en" or "zh"`)
  }
  if (!isObject(item.title)) {
    errors.push(`${where}.title must be { original, translation }`)
  } else {
    validatePair(item.title, `${where}.title`, errors)
  }
  if (has(item, 'summary')) {
    if (!isObject(item.summary)) errors.push(`${where}.summary must be { original, translation }`)
    else pushTextError(item.summary, 'translation', `${where}.summary`, errors)
  }
  if (!Array.isArray(item.blocks)) return
  item.blocks.forEach((block, index) => validateBlock(block, `${where}.blocks[${index}]`, errors))
}

/** Validate the item array shared by multi-day and single-day digest files. */
function validateItems(items, where, version, errors, seenIds) {
  items.forEach((item, itemIndex) => {
    const at = `${where}.items[${itemIndex}]`
    if (!isObject(item)) {
      errors.push(`${at} must be an object`)
      return
    }
    if (typeof item.id !== 'string') {
      errors.push(`${at}.id must be a string`)
      return
    }
    if (seenIds.has(item.id)) errors.push(`${at}.id is duplicated (${item.id})`)
    seenIds.add(item.id)
    if (!Array.isArray(item.blocks)) errors.push(`${at}.blocks must be an array`)
    const isV2 = version >= SCHEMA_VERSION || has(item, 'sourceLanguage')
    if (isV2) validateItemV2(item, at, errors)
  })
}

/**
 * Validate a digest document. Returns a list of problems; an empty list means
 * the file is acceptable. v1 digests keep the old, lenient requirements; v2
 * items must carry `sourceLanguage` and fully paired text.
 */
export function validateDigest(value) {
  const errors = []
  if (!isObject(value)) return ['digest must be an object']
  if (!Array.isArray(value.days)) return ['digest.days must be an array']
  const version = Number(value.schemaVersion) || 1
  const ids = new Set()

  value.days.forEach((day, dayIndex) => {
    const dayAt = `days[${dayIndex}]`
    if (!isObject(day)) {
      errors.push(`${dayAt} must be an object`)
      return
    }
    if (typeof day.date !== 'string') errors.push(`${dayAt}.date must be a string`)
    if (!Array.isArray(day.items)) {
      errors.push(`${dayAt}.items must be an array`)
      return
    }
    validateItems(day.items, dayAt, version, errors, ids)
  })

  return errors
}

/**
 * Validate one stored day file: the v2 per-day shape the daily writer emits
 * (`{ schemaVersion, date, generatedAt, run, items }`). The date must match the
 * file name, which the storage layer checks before calling this.
 */
export function validateDayDigest(value) {
  const errors = []
  if (!isObject(value)) return ['day digest must be an object']
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) {
    errors.push('day digest.date must be YYYY-MM-DD')
  }
  if (!Array.isArray(value.items)) {
    errors.push('day digest.items must be an array')
    return errors
  }
  const version = Number(value.schemaVersion) || 1
  validateItems(value.items, 'digest', version, errors, new Set())
  return errors
}

/** Types the reader renders itself; exposed for tests and future adapters. */
export const BLOCK_TYPES = {
  text: [...TEXT_BLOCK_TYPES],
  neutral: [...NEUTRAL_TYPES],
}
