/**
 * Pipeline configuration.
 *
 * Defaults live here, so the tool works with no config file at all. A user file
 * at `$DSH_HOME/paper-reader/config.json` is merged over those defaults and is
 * never written back: a scheduled run must not rewrite what the user tuned.
 * Invalid values are explicit errors naming the key, because silently ignoring
 * them would run with a different quota than the user asked for.
 *
 * The per-source defaults and validation live next to each adapter and are
 * collected by the registry, so adding a source does not grow this file.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_QUOTA } from './pipeline/select.js'
import { SOURCES } from './sources/registry.js'
import {
  assertPositive,
  configError,
  isPlainObject,
} from './sources/validation.js'

export const CONFIG_FILE = 'config.json'
export const DEFAULT_RETENTION_DAYS = 30

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

function cloneDefaults(defaults) {
  const copy = { ...defaults }
  for (const [key, value] of Object.entries(copy)) {
    if (Array.isArray(value)) copy[key] = [...value]
  }
  return copy
}

function defaultSources() {
  const sources = {}
  for (const [id, definition] of Object.entries(SOURCES)) {
    sources[id] = cloneDefaults(definition.defaults)
  }
  return sources
}

/** Built-in configuration, deep-cloned so callers cannot mutate the defaults. */
export function defaultConfig() {
  return {
    sources: defaultSources(),
    quota: { ...DEFAULT_QUOTA },
    translation: { ...DEFAULT_TRANSLATION_CONFIG, glossary: [] },
    retentionDays: DEFAULT_RETENTION_DAYS,
  }
}

/** Merge a user object over the defaults, rejecting non-object sections. */
export function mergeConfig(user, path = CONFIG_FILE) {
  if (!isPlainObject(user)) throw configError(`${path} must contain a JSON object`)
  for (const key of ['sources', 'quota', 'translation']) {
    if (key in user && !isPlainObject(user[key])) throw configError(`${path}: ${key} must be an object`)
  }

  const defaults = defaultConfig()
  const sources = {}
  for (const id of Object.keys(SOURCES)) {
    const userSource = user.sources?.[id]
    if (userSource !== undefined && !isPlainObject(userSource)) {
      throw configError(`${path}: sources.${id} must be an object`)
    }
    sources[id] = {
      ...defaults.sources[id],
      ...(isPlainObject(userSource) ? userSource : {}),
    }
  }

  return {
    ...defaults,
    ...user,
    sources,
    quota: { ...defaults.quota, ...(isPlainObject(user.quota) ? user.quota : {}) },
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

function assertCount(value, key, path) {
  if (!Number.isInteger(value) || value < 0) throw configError(`${path}: ${key} must be a non-negative integer`)
}

/** Validate the merged config, naming the offending key. */
export function validateConfig(config, path = CONFIG_FILE) {
  if (!isPlainObject(config.sources)) throw configError(`${path}: sources must be an object`)
  for (const [id, definition] of Object.entries(SOURCES)) {
    const source = config.sources[id]
    if (!isPlainObject(source)) throw configError(`${path}: sources.${id} must be an object`)
    if (typeof source.enabled !== 'boolean') {
      throw configError(`${path}: sources.${id}.enabled must be true or false`)
    }
    definition.validateConfig(source, path)
  }

  for (const key of ['total', 'papers', 'blogs']) assertCount(config.quota?.[key], `quota.${key}`, path)

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
  if (translation.baseUrl) {
    if (!/^https?:\/\//i.test(translation.baseUrl)) {
      throw configError(`${path}: translation.baseUrl must be an http(s) URL`)
    }
  }
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
