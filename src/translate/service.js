/**
 * Translation service: turn a pending digest item into paired text.
 *
 * The unit of work is one reader block (a heading, a paragraph, a figure
 * caption or an equation note), never the whole paper. Blocks travel in
 * batches of 6–12; title/summary, captions and equation notes go in their own
 * requests because they read differently. Equations and code carry no
 * translation at all.
 *
 * Failure policy, from the ticket:
 * - a reply that drops, adds or reorders a block is a failed request and is
 *   retried (never merged or realigned by guesswork);
 * - after the configured retries the batch falls back to per-block requests, so
 *   one bad block leaves only itself `translation: null` / pending;
 * - a block that still fails stays pending, the rest of the item is kept;
 * - exhausting the daily token budget stops further requests and leaves the
 *   remaining items pending, with `budgetExceeded` in the run record.
 *
 * `fetch` is injected, so tests use a fake Chat Completions endpoint and never
 * touch the network. The API key is only ever placed in an Authorization
 * header; it is not part of prompts, stats, cache entries or error messages.
 */
import { createTranslationCache, translationCacheKey } from './cache.js'
import { resolveGlossary } from './glossary.js'
import { isEquationBlock, isFigureBlock, isTextBlock } from '../shared/blocks.js'
import {
  buildTranslationMessages,
  chatCompletionsUrl,
  endpointHost,
  estimateTokens,
  parseTranslations,
  resolveLlmSettings,
} from './llm.js'

export const MIN_BATCH_SIZE = 6
export const MAX_BATCH_SIZE = 12
const GROUP_ORDER = ['meta', 'body', 'caption', 'note']

/** Split body blocks into balanced batches of 6–12 when the input allows it. */
export function batchesOf(units, preferred = 8) {
  if (units.length === 0) return []
  if (units.length <= MAX_BATCH_SIZE) return [units]
  const target = Math.min(Math.max(preferred, MIN_BATCH_SIZE), MAX_BATCH_SIZE)
  let count = Math.max(1, Math.ceil(units.length / target))
  while (count > 1 && units.length / count < MIN_BATCH_SIZE) count -= 1
  while (count * MAX_BATCH_SIZE < units.length) count += 1

  const base = Math.floor(units.length / count)
  const remainder = units.length % count
  const batches = []
  let offset = 0
  for (let index = 0; index < count; index += 1) {
    const size = base + (index < remainder ? 1 : 0)
    batches.push(units.slice(offset, offset + size))
    offset += size
  }
  return batches
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0
}

/** The language this item is read in as a translation. */
export function targetLanguageFor(item, settings) {
  if (item.sourceLanguage === 'zh') return 'en'
  return settings.targetLanguage === 'en' ? 'en' : 'zh'
}

/**
 * Every translatable pair of one item, tagged with the group that decides
 * batching. Code and equation bodies deliberately produce no unit.
 */
export function collectUnits(item) {
  const units = []
  const push = (kind, text, apply) => {
    if (!hasText(text)) return
    units.push({ kind, text, apply })
  }

  if (item.title && hasText(item.title.original) && !hasText(item.title.translation)) {
    push('meta', item.title.original, value => { item.title.translation = value })
  }
  if (item.summary && hasText(item.summary.original) && !hasText(item.summary.translation)) {
    push('meta', item.summary.original, value => { item.summary.translation = value })
  }

  for (const block of item.blocks ?? []) {
    if (isTextBlock(block) && !hasText(block.translation)) {
      push('body', block.original, value => { block.translation = value })
    } else if (isFigureBlock(block) && block.caption && !hasText(block.caption.translation)) {
      push('caption', block.caption.original, value => { block.caption.translation = value })
    } else if (isEquationBlock(block) && block.note && !hasText(block.note.translation)) {
      push('note', block.note.original, value => { block.note.translation = value })
    }
  }
  return units
}

/** Recompute and store the item's `translationState` from its pairs. */
export function translationProgress(item) {
  const pairs = []
  if (item.title && hasText(item.title.original)) pairs.push(item.title)
  if (item.summary && hasText(item.summary.original)) pairs.push(item.summary)
  for (const block of item.blocks ?? []) {
    if (isTextBlock(block) && hasText(block.original)) pairs.push(block)
    else if (isFigureBlock(block) && block.caption && hasText(block.caption.original)) pairs.push(block.caption)
    else if (isEquationBlock(block) && block.note && hasText(block.note.original)) pairs.push(block.note)
  }
  const total = pairs.length
  const done = pairs.filter(pair => hasText(pair.translation)).length
  item.translationState = total === 0 || done === total ? 'complete' : done === 0 ? 'pending' : 'partial'
  return { total, done, pending: total - done }
}

function groupUnits(units) {
  const groups = new Map()
  for (const unit of units) {
    if (!groups.has(unit.kind)) groups.set(unit.kind, [])
    groups.get(unit.kind).push(unit)
  }
  return GROUP_ORDER
    .filter(kind => groups.has(kind))
    .map(kind => ({ kind, units: groups.get(kind) }))
}

function baseStats(settings, glossary) {
  return {
    status: null,
    reason: null,
    model: settings.model ?? null,
    endpoint: settings.configured ? endpointHost(settings.baseUrl) : null,
    targetLanguage: settings.targetLanguage,
    glossaryVersion: glossary.version,
    tokenBudget: settings.dailyTokenBudget,
    tokensUsed: 0,
    budgetExceeded: false,
    requests: 0,
    retries: 0,
    cacheHits: 0,
    cacheErrors: 0,
    failedUnits: 0,
    pendingUnits: 0,
    pendingItems: 0,
    items: { total: 0, complete: 0, partial: 0, pending: 0 },
    missing: [...settings.missing],
  }
}

/** Fill in counts and the final status from the items themselves. */
function finishStats(stats, items, { anyTranslated, budgetUsed, budgetExceeded, authFailed = false }) {
  const counts = { total: items.length, complete: 0, partial: 0, pending: 0 }
  let pendingUnits = 0
  for (const item of items) {
    const progress = translationProgress(item)
    counts[item.translationState] += 1
    pendingUnits += progress.pending
  }
  stats.items = counts
  stats.pendingItems = counts.total - counts.complete
  stats.pendingUnits = pendingUnits
  stats.tokensUsed = budgetUsed
  stats.budgetExceeded = budgetExceeded

  if (stats.status === null) {
    stats.status = counts.complete === counts.total ? 'complete' : anyTranslated ? 'partial' : 'pending'
    if (budgetExceeded) stats.reason = 'token_budget_exceeded'
    else if (authFailed) stats.reason = 'auth_failed'
    else if (stats.failedUnits > 0) stats.reason = 'block_failed'
    else if (counts.pending > 0 || counts.partial > 0) stats.reason = 'translation_incomplete'
  }
  return stats
}

/**
 * Translate every paired text in `items` in place.
 *
 * Returns `{ items, stats }`; `items` are the same objects. A missing endpoint
 * configuration is a `skipped` result naming what to set, not a silent no-op.
 *
 * `skipIds` names items whose text is already final (DeepSeek's official
 * bilingual pairs). They stay in `stats` — a complete official item is still a
 * complete item — but no block of theirs is ever sent to the model, so a
 * missing official side stays `pending` instead of being machine-translated.
 */
export async function translateItems({
  items = [],
  root,
  config = {},
  env = {},
  fetch: fetchImpl = globalThis.fetch,
  dryRun = false,
  budgetUsed = 0,
  skipIds = null,
} = {}) {
  if (typeof root !== 'string' || root.length === 0) throw new TypeError('translateItems needs a data root')
  const settings = resolveLlmSettings(env, config)
  const glossary = resolveGlossary(config.translation ?? {})
  const stats = baseStats(settings, glossary)

  if (config.translation?.enabled === false) {
    stats.status = 'skipped'
    stats.reason = 'disabled'
    return { items, stats: finishStats(stats, items, { anyTranslated: false, budgetUsed: 0, budgetExceeded: false }) }
  }
  if (dryRun) {
    stats.status = 'skipped'
    stats.reason = 'dry_run'
    return { items, stats: finishStats(stats, items, { anyTranslated: false, budgetUsed: 0, budgetExceeded: false }) }
  }
  if (!settings.configured) {
    stats.status = 'skipped'
    stats.reason = 'missing_llm_config'
    return { items, stats: finishStats(stats, items, { anyTranslated: false, budgetUsed: 0, budgetExceeded: false }) }
  }
  if (typeof fetchImpl !== 'function') {
    stats.status = 'skipped'
    stats.reason = 'missing_fetch'
    return { items, stats: finishStats(stats, items, { anyTranslated: false, budgetUsed: 0, budgetExceeded: false }) }
  }

  const cache = createTranslationCache({ root })
  const budget = {
    limit: settings.dailyTokenBudget,
    used: Number.isFinite(budgetUsed) && budgetUsed > 0 ? budgetUsed : 0,
  }
  let budgetExceeded = false
  let stopped = null
  let anyTranslated = false

  const applyTranslation = (unit, translation) => {
    unit.apply(translation)
    anyTranslated = true
  }

  const applyAndCache = async (unit, translation) => {
    applyTranslation(unit, translation)
    await cache.put(unit.cacheKey, translation, {
      model: settings.model,
      targetLanguage: unit.targetLanguage,
      glossaryVersion: glossary.version,
    })
  }

  /** One HTTP request; returns translations or null when the budget is spent. */
  const requestOnce = async (item, batch) => {
    if (budget.used + estimateTokens(batch) > budget.limit) {
      budgetExceeded = true
      return null
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()
    try {
      stats.requests += 1
      const response = await fetchImpl(chatCompletionsUrl(settings.baseUrl), {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          temperature: 0,
          stream: false,
          messages: buildTranslationMessages({
            units: batch,
            glossary,
            sourceLanguage: item.sourceLanguage === 'zh' ? 'zh' : 'en',
            targetLanguage: targetLanguageFor(item, settings),
          }),
        }),
      })

      let payload = null
      try {
        payload = typeof response.json === 'function' ? await response.json() : null
      } catch {
        payload = null
      }
      const usage = Number(payload?.usage?.total_tokens)
      budget.used += Number.isFinite(usage) && usage >= 0 ? usage : estimateTokens(batch)

      if (!response.ok) {
        const error = new Error(`translation endpoint answered HTTP ${response.status}`)
        error.code = 'translation_http'
        error.status = response.status
        error.stop = response.status === 401 || response.status === 403
        throw error
      }

      const expected = batch.map((_, index) => `u${index}`)
      return parseTranslations(payload?.choices?.[0]?.message?.content, expected)
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw Object.assign(new Error('translation request timed out'), { code: 'translation_timeout' })
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * One batch with the configured retries.
   *
   * Returns the translations, `null` for "stop now" (budget spent or the
   * endpoint rejected the credentials) and `undefined` when the retries are
   * exhausted. The caller decides whether to isolate blocks after that.
   */
  const requestWithRetries = async (item, batch) => {
    for (let attempt = 0; attempt <= settings.retries; attempt += 1) {
      if (attempt > 0) stats.retries += 1
      try {
        return await requestOnce(item, batch)
      } catch (error) {
        if (error?.stop) {
          stopped = error
          return null
        }
        if (budgetExceeded) return null
      }
    }
    return undefined
  }

  /** Try the batch, then isolate failures block by block. */
  const translateBatch = async (item, batch) => {
    const translations = await requestWithRetries(item, batch)
    if (translations === null) return
    if (translations !== undefined) {
      for (let index = 0; index < batch.length; index += 1) {
        await applyAndCache(batch[index], translations[index])
      }
      return
    }

    // A single-block batch has already used its retries.
    if (batch.length === 1) {
      stats.failedUnits += 1
      return
    }

    for (const unit of batch) {
      if (budgetExceeded || stopped) return
      const single = await requestWithRetries(item, [unit])
      if (single === null) return
      if (single !== undefined) {
        await applyAndCache(unit, single[0])
        continue
      }
      stats.failedUnits += 1
    }
  }

  for (const item of items) {
    if (budgetExceeded || stopped) break
    if (skipIds?.has(item.id)) continue
    const targetLanguage = targetLanguageFor(item, settings)
    const units = collectUnits(item)
    if (units.length === 0) continue

    const misses = []
    for (const unit of units) {
      unit.targetLanguage = targetLanguage
      unit.cacheKey = translationCacheKey({
        text: unit.text,
        targetLanguage,
        model: settings.model,
        glossaryVersion: glossary.version,
      })
      const cached = await cache.get(unit.cacheKey)
      if (cached) {
        stats.cacheHits += 1
        applyTranslation(unit, cached)
      } else {
        misses.push(unit)
      }
    }

    for (const group of groupUnits(misses)) {
      if (budgetExceeded || stopped) break
      const batches = group.kind === 'body' ? batchesOf(group.units, settings.batchSize) : [group.units]
      for (const batch of batches) {
        if (budgetExceeded || stopped) break
        await translateBatch(item, batch)
      }
    }
  }

  stats.cacheErrors = cache.errors()
  return {
    items,
    stats: finishStats(stats, items, {
      anyTranslated,
      budgetUsed: budget.used,
      budgetExceeded,
      authFailed: Boolean(stopped),
    }),
  }
}
