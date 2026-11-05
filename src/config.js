/**
 * Pipeline configuration.
 *
 * Defaults live here, so the tool works with no config file at all. A user file
 * at `$DSH_HOME/paper-reader/config.json` is merged over those defaults and is
 * never written back: a scheduled run must not rewrite what the user tuned.
 * Invalid values are explicit errors naming the key, because silently ignoring
 * them would run with a different quota than the user asked for.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_PROXY_HEALTH_URL, DEFAULT_PROXY_TIMEOUT_MS } from './proxy.js'
import { DEFAULT_QUOTA } from './pipeline/select.js'
import { DEFAULT_ARXIV_CONFIG } from './sources/arxiv.js'
import { DEFAULT_OPENAI_CONFIG } from './sources/openai.js'
import { DEFAULT_DEEPSEEK_CONFIG } from './sources/deepseek.js'

export const CONFIG_FILE = 'config.json'
export const DEFAULT_RETENTION_DAYS = 30

/**
 * Proxy defaults: no address (a machine without one simply has no proxy), a
 * probe target, and a timeout. The switch that matters per source is
 * `sources.<id>.useProxy`, so the policy is configuration rather than code.
 */
export const DEFAULT_PROXY_CONFIG = {
  url: null,
  healthCheckUrl: DEFAULT_PROXY_HEALTH_URL,
  timeoutMs: DEFAULT_PROXY_TIMEOUT_MS,
}

/**
 * Translation defaults. The endpoint/key/model are environment variables by
 * contract, so they stay `null` here; a config file may pin them for a
 * scheduled run.
 */
export const DEFAULT_TRANSLATION_CONFIG = {
  enabled: true,
  targetLanguage: 'zh',
  batchSize: 8,
  retries: 2,
  dailyTokenBudget: 300_000,
  timeoutMs: 60_000,
  glossary: [],
  glossaryVersion: null,
  baseUrl: null,
  apiKey: null,
  model: null,
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function configError(message) {
  return Object.assign(new Error(message), { code: 'config_invalid', exitCode: 2, status: 400 })
}

/** Built-in configuration, deep-cloned so callers cannot mutate the defaults. */
export function defaultConfig() {
  return {
    sources: {
      arxiv: {
        ...DEFAULT_ARXIV_CONFIG,
        useProxy: false,
        categories: [...DEFAULT_ARXIV_CONFIG.categories],
        keywords: [...DEFAULT_ARXIV_CONFIG.keywords],
        excludeKeywords: [...DEFAULT_ARXIV_CONFIG.excludeKeywords],
      },
      deepseek: { ...DEFAULT_DEEPSEEK_CONFIG, useProxy: false },
      // The adapters arrive in later tickets; declaring the switch here keeps
      // "which source needs the proxy" out of the pipeline code.
      hf: { useProxy: true },
      // OpenAI ships opt-in: the RSS list is direct, but the article page is
      // only reachable through the user's proxy, and the site terms for the
      // article-page fetch are still being reviewed. Set
      // `sources.openai.enabled` to true to include it in the daily run.
      openai: { ...DEFAULT_OPENAI_CONFIG },
    },
    quota: { ...DEFAULT_QUOTA },
    proxy: { ...DEFAULT_PROXY_CONFIG },
    translation: { ...DEFAULT_TRANSLATION_CONFIG, glossary: [] },
    retentionDays: DEFAULT_RETENTION_DAYS,
  }
}

/** Merge user source settings over the per-source defaults, key by key. */
function mergeSources(defaults, user) {
  const merged = {}
  for (const [id, value] of Object.entries(defaults)) {
    merged[id] = isPlainObject(value) ? { ...value } : value
  }
  if (!isPlainObject(user)) return merged
  for (const [id, value] of Object.entries(user)) {
    if (!isPlainObject(value)) continue
    merged[id] = { ...(isPlainObject(merged[id]) ? merged[id] : {}), ...value }
  }
  return merged
}

/** Merge a user object over the defaults, rejecting non-object sections. */
export function mergeConfig(user, path = CONFIG_FILE) {
  if (!isPlainObject(user)) throw configError(`${path} must contain a JSON object`)
  for (const key of ['sources', 'quota', 'proxy', 'translation']) {
    if (key in user && !isPlainObject(user[key])) throw configError(`${path}: ${key} must be an object`)
  }
  if (isPlainObject(user.sources)) {
    for (const [id, value] of Object.entries(user.sources)) {
      if (!isPlainObject(value)) throw configError(`${path}: sources.${id} must be an object`)
    }
  }

  const defaults = defaultConfig()
  return {
    ...defaults,
    ...user,
    sources: mergeSources(defaults.sources, user.sources),
    quota: { ...defaults.quota, ...(isPlainObject(user.quota) ? user.quota : {}) },
    proxy: { ...defaults.proxy, ...(isPlainObject(user.proxy) ? user.proxy : {}) },
    translation: {
      ...defaults.translation,
      ...(isPlainObject(user.translation) ? user.translation : {}),
      glossary: Array.isArray(user.translation?.glossary)
        ? user.translation.glossary
        : defaults.translation.glossary,
    },
    retentionDays: user.retentionDays ?? defaults.retentionDays,
  }
}

function assertStringList(value, key, path, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw configError(`${path}: ${key} must be an array of strings`)
  if (value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
    throw configError(`${path}: ${key} must only contain non-empty strings`)
  }
  if (!allowEmpty && value.length === 0) throw configError(`${path}: ${key} must not be empty`)
}

function assertCount(value, key, path) {
  if (!Number.isInteger(value) || value < 0) throw configError(`${path}: ${key} must be a non-negative integer`)
}

function assertPositive(value, key, path) {
  if (!Number.isFinite(value) || value <= 0) throw configError(`${path}: ${key} must be a positive number`)
}

function assertUrl(value, key, path) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    throw configError(`${path}: ${key} must be an http(s) URL`)
  }
}

/** Validate the DeepSeek section; the defaults let it run with no user config. */
function validateDeepSeek(deepseek, path) {
  if (!isPlainObject(deepseek)) throw configError(`${path}: sources.deepseek must be an object`)
  if (typeof deepseek.enabled !== 'boolean') {
    throw configError(`${path}: sources.deepseek.enabled must be true or false`)
  }
  assertUrl(deepseek.sitemapUrl, 'sources.deepseek.sitemapUrl', path)
  assertUrl(deepseek.baseUrl, 'sources.deepseek.baseUrl', path)
  assertPositive(deepseek.timeoutMs, 'sources.deepseek.timeoutMs', path)
  if (!Number.isInteger(deepseek.lookbackDays) || deepseek.lookbackDays < 0) {
    throw configError(`${path}: sources.deepseek.lookbackDays must be a non-negative integer`)
  }
  if (!Number.isInteger(deepseek.maxItems) || deepseek.maxItems <= 0) {
    throw configError(`${path}: sources.deepseek.maxItems must be a positive integer`)
  }
  if (!Number.isInteger(deepseek.maxBlocks) || deepseek.maxBlocks <= 0) {
    throw configError(`${path}: sources.deepseek.maxBlocks must be a positive integer`)
  }
  if (!Number.isInteger(deepseek.legacyYear) || deepseek.legacyYear < 1990 || deepseek.legacyYear > 2100) {
    throw configError(`${path}: sources.deepseek.legacyYear must be a four-digit year`)
  }
}

/** Validate the merged config, naming the offending key. */
export function validateConfig(config, path = CONFIG_FILE) {
  const arxiv = config.sources?.arxiv
  if (!isPlainObject(arxiv)) throw configError(`${path}: sources.arxiv must be an object`)
  if (typeof arxiv.enabled !== 'boolean') throw configError(`${path}: sources.arxiv.enabled must be true or false`)
  assertStringList(arxiv.categories, 'sources.arxiv.categories', path)
  assertStringList(arxiv.keywords, 'sources.arxiv.keywords', path)
  assertStringList(arxiv.excludeKeywords, 'sources.arxiv.excludeKeywords', path)
  if (!Number.isInteger(arxiv.maxResults) || arxiv.maxResults <= 0) {
    throw configError(`${path}: sources.arxiv.maxResults must be a positive integer`)
  }
  if (typeof arxiv.extractFullText !== 'boolean') {
    throw configError(`${path}: sources.arxiv.extractFullText must be true or false`)
  }
  assertPositive(arxiv.timeoutMs, 'sources.arxiv.timeoutMs', path)
  if (!Number.isInteger(arxiv.maxBlocks) || arxiv.maxBlocks <= 0) {
    throw configError(`${path}: sources.arxiv.maxBlocks must be a positive integer`)
  }
  assertUrl(arxiv.baseUrl, 'sources.arxiv.baseUrl', path)
  assertUrl(arxiv.htmlBaseUrl, 'sources.arxiv.htmlBaseUrl', path)

  const openai = config.sources?.openai
  if (!isPlainObject(openai)) throw configError(`${path}: sources.openai must be an object`)
  if (typeof openai.enabled !== 'boolean') throw configError(`${path}: sources.openai.enabled must be true or false`)
  if (typeof openai.extractViaProxy !== 'boolean') {
    throw configError(`${path}: sources.openai.extractViaProxy must be true or false`)
  }
  if (typeof openai.extractFullText !== 'boolean') {
    throw configError(`${path}: sources.openai.extractFullText must be true or false`)
  }
  assertUrl(openai.rssUrl, 'sources.openai.rssUrl', path)
  assertPositive(openai.timeoutMs, 'sources.openai.timeoutMs', path)
  if (!Number.isInteger(openai.maxItems) || openai.maxItems <= 0) {
    throw configError(`${path}: sources.openai.maxItems must be a positive integer`)
  }
  if (!Number.isInteger(openai.maxBlocks) || openai.maxBlocks <= 0) {
    throw configError(`${path}: sources.openai.maxBlocks must be a positive integer`)
  }

  validateDeepSeek(config.sources?.deepseek, path)

  for (const key of ['total', 'papers', 'blogs']) assertCount(config.quota?.[key], `quota.${key}`, path)

  const proxy = config.proxy
  if (!isPlainObject(proxy)) throw configError(`${path}: proxy must be an object`)
  if (proxy.url !== null && proxy.url !== undefined) assertUrl(proxy.url, 'proxy.url', path)
  assertUrl(proxy.healthCheckUrl, 'proxy.healthCheckUrl', path)
  assertPositive(proxy.timeoutMs, 'proxy.timeoutMs', path)

  // Source settings are validated generically: `enabled` and `useProxy` are the
  // two switches every adapter shares, and this keeps future sources data-only.
  for (const [id, settings] of Object.entries(config.sources ?? {})) {
    if (!isPlainObject(settings)) throw configError(`${path}: sources.${id} must be an object`)
    if ('enabled' in settings && typeof settings.enabled !== 'boolean') {
      throw configError(`${path}: sources.${id}.enabled must be true or false`)
    }
    if ('useProxy' in settings && typeof settings.useProxy !== 'boolean') {
      throw configError(`${path}: sources.${id}.useProxy must be true or false`)
    }
  }

  const translation = config.translation
  if (!isPlainObject(translation)) throw configError(`${path}: translation must be an object`)
  if (typeof translation.enabled !== 'boolean') {
    throw configError(`${path}: translation.enabled must be true or false`)
  }
  if (translation.targetLanguage !== 'zh' && translation.targetLanguage !== 'en') {
    throw configError(`${path}: translation.targetLanguage must be "zh" or "en"`)
  }
  if (!Number.isInteger(translation.batchSize) || translation.batchSize < 6 || translation.batchSize > 12) {
    throw configError(`${path}: translation.batchSize must be an integer between 6 and 12`)
  }
  if (!Number.isInteger(translation.retries) || translation.retries < 0 || translation.retries > 5) {
    throw configError(`${path}: translation.retries must be an integer between 0 and 5`)
  }
  if (!Number.isInteger(translation.dailyTokenBudget) || translation.dailyTokenBudget <= 0) {
    throw configError(`${path}: translation.dailyTokenBudget must be a positive integer`)
  }
  assertPositive(translation.timeoutMs, 'translation.timeoutMs', path)
  if (!Array.isArray(translation.glossary)) {
    throw configError(`${path}: translation.glossary must be an array of { source, target }`)
  }
  translation.glossary.forEach((term, index) => {
    if (!isPlainObject(term) || typeof term.source !== 'string' || term.source.trim().length === 0
      || typeof term.target !== 'string' || term.target.trim().length === 0) {
      throw configError(`${path}: translation.glossary[${index}] must have non-empty source and target strings`)
    }
  })
  for (const key of ['baseUrl', 'apiKey', 'model']) {
    const value = translation[key]
    if (value !== null && value !== undefined && typeof value !== 'string') {
      throw configError(`${path}: translation.${key} must be a string or null`)
    }
  }
  if (translation.baseUrl) assertUrl(translation.baseUrl, 'translation.baseUrl', path)
  if (translation.glossaryVersion !== null && translation.glossaryVersion !== undefined
    && typeof translation.glossaryVersion !== 'string' && typeof translation.glossaryVersion !== 'number') {
    throw configError(`${path}: translation.glossaryVersion must be a string, a number or null`)
  }

  if (!Number.isInteger(config.retentionDays) || config.retentionDays <= 0) {
    throw configError(`${path}: retentionDays must be a positive integer`)
  }
  return config
}

/**
 * Load `$DSH_HOME/paper-reader/config.json`.
 *
 * A missing file is not an error and is not created; a present file must parse
 * and validate, so a typo is seen on the next run instead of producing an
 * unexpectedly quiet day.
 */
export async function loadConfig({ root }) {
  const path = join(root, CONFIG_FILE)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { config: defaultConfig(), path, exists: false }
    throw configError(`could not read ${path}: ${error?.message ?? error}`)
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    throw configError(`${path} is not valid JSON`)
  }

  const config = mergeConfig(parsed, path)
  validateConfig(config, path)
  return { config, path, exists: true }
}
