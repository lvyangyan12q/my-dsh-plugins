/**
 * Pipeline configuration.
 *
 * Defaults live here, so the tool works with no config file at all. A user file
 * at `$DSH_HOME/paper-reader/config.json` is merged over those defaults and is
 * never written back: a scheduled run must not rewrite what the user tuned.
 * Invalid values are explicit errors naming the key, because silently ignoring
 * them would run with a different quota than the user asked for.
 *
 * Per-source defaults and validation belong to the source modules and are
 * reached through `sources/registry.js`: adding a source does not mean editing
 * a second table here. This module only owns the cross-source sections (quota,
 * selection, proxy, translation, retention).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_PROXY_HEALTH_URL, DEFAULT_PROXY_TIMEOUT_MS } from './proxy.js'
import { DEFAULT_QUOTA } from './pipeline/select.js'
import { SOURCES, sourceDefinition } from './sources/registry.js'
import {
  assertCount,
  assertPositive,
  assertStringList,
  assertUrl,
  configError,
  isPlainObject,
} from './sources/validation.js'

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
 * Selection defaults. `sourceWeights` is an additive relevance bonus per
 * source (a tie-breaker after votes and keyword hits), and `institutions` is an
 * allowlist for papers that declare their affiliations: a paper that declares
 * one and matches none is dropped, while a paper that declares none is kept
 * (the same rule the category filter uses).
 */
export const DEFAULT_SELECTION_CONFIG = {
  sourceWeights: {},
  institutions: [],
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

/** Deep-clone a registry default so callers cannot mutate the shared object. */
function cloneDefault(value) {
  if (Array.isArray(value)) return value.map(cloneDefault)
  if (!isPlainObject(value)) return value
  const copy = {}
  for (const [key, entry] of Object.entries(value)) copy[key] = cloneDefault(entry)
  return copy
}

/** Built-in configuration, deep-cloned so callers cannot mutate the defaults. */
export function defaultConfig() {
  const sources = {}
  for (const [id, definition] of Object.entries(SOURCES)) {
    sources[id] = cloneDefault(definition.defaults)
  }
  return {
    sources,
    quota: { ...DEFAULT_QUOTA },
    selection: {
      sourceWeights: { ...DEFAULT_SELECTION_CONFIG.sourceWeights },
      institutions: [...DEFAULT_SELECTION_CONFIG.institutions],
    },
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
  for (const key of ['sources', 'quota', 'selection', 'proxy', 'translation']) {
    if (key in user && !isPlainObject(user[key])) throw configError(`${path}: ${key} must be an object`)
  }
  if (isPlainObject(user.sources)) {
    for (const [id, value] of Object.entries(user.sources)) {
      if (!isPlainObject(value)) throw configError(`${path}: sources.${id} must be an object`)
    }
  }

  const defaults = defaultConfig()
  const userSelection = isPlainObject(user.selection) ? user.selection : {}
  return {
    ...defaults,
    ...user,
    sources: mergeSources(defaults.sources, user.sources),
    quota: { ...defaults.quota, ...(isPlainObject(user.quota) ? user.quota : {}) },
    selection: {
      ...defaults.selection,
      ...userSelection,
      // Invalid shapes are passed through so `validateSelection` can name the
      // exact key instead of the merge silently replacing them with defaults.
      sourceWeights: userSelection.sourceWeights === undefined
        ? { ...defaults.selection.sourceWeights }
        : isPlainObject(userSelection.sourceWeights)
          ? { ...defaults.selection.sourceWeights, ...userSelection.sourceWeights }
          : userSelection.sourceWeights,
      institutions: userSelection.institutions === undefined
        ? defaults.selection.institutions
        : userSelection.institutions,
    },
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

/** Validate the cross-source `selection` section. */
function validateSelection(selection, path) {
  if (!isPlainObject(selection)) throw configError(`${path}: selection must be an object`)
  const weights = selection.sourceWeights
  if (!isPlainObject(weights)) throw configError(`${path}: selection.sourceWeights must be an object`)
  for (const [id, weight] of Object.entries(weights)) {
    if (id.trim().length === 0) throw configError(`${path}: selection.sourceWeights keys must be source ids`)
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      throw configError(`${path}: selection.sourceWeights.${id} must be a finite number`)
    }
  }
  assertStringList(selection.institutions, 'selection.institutions', path)
}

/** Validate the merged config, naming the offending key. */
export function validateConfig(config, path = CONFIG_FILE) {
  for (const key of ['total', 'papers', 'blogs']) assertCount(config.quota?.[key], `quota.${key}`, path)

  validateSelection(config.selection, path)

  const proxy = config.proxy
  if (!isPlainObject(proxy)) throw configError(`${path}: proxy must be an object`)
  if (proxy.url !== null && proxy.url !== undefined) assertUrl(proxy.url, 'proxy.url', path)
  assertUrl(proxy.healthCheckUrl, 'proxy.healthCheckUrl', path)
  assertPositive(proxy.timeoutMs, 'proxy.timeoutMs', path)

  // Every source owns its keys: built-in sources validate through the registry,
  // and an adapter-only source still gets the two shared switches checked.
  for (const [id, settings] of Object.entries(config.sources ?? {})) {
    if (!isPlainObject(settings)) throw configError(`${path}: sources.${id} must be an object`)
    if ('enabled' in settings && typeof settings.enabled !== 'boolean') {
      throw configError(`${path}: sources.${id}.enabled must be true or false`)
    }
    if ('useProxy' in settings && typeof settings.useProxy !== 'boolean') {
      throw configError(`${path}: sources.${id}.useProxy must be true or false`)
    }
    sourceDefinition(id)?.validateConfig(settings, path)
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
