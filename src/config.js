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
import { DEFAULT_QUOTA } from './pipeline/select.js'
import { DEFAULT_ARXIV_CONFIG } from './sources/arxiv.js'

export const CONFIG_FILE = 'config.json'
export const DEFAULT_RETENTION_DAYS = 30

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
        categories: [...DEFAULT_ARXIV_CONFIG.categories],
        keywords: [...DEFAULT_ARXIV_CONFIG.keywords],
        excludeKeywords: [...DEFAULT_ARXIV_CONFIG.excludeKeywords],
      },
    },
    quota: { ...DEFAULT_QUOTA },
    retentionDays: DEFAULT_RETENTION_DAYS,
  }
}

/** Merge a user object over the defaults, rejecting non-object sections. */
export function mergeConfig(user, path = CONFIG_FILE) {
  if (!isPlainObject(user)) throw configError(`${path} must contain a JSON object`)
  for (const key of ['sources', 'quota']) {
    if (key in user && !isPlainObject(user[key])) throw configError(`${path}: ${key} must be an object`)
  }
  if (isPlainObject(user.sources) && 'arxiv' in user.sources && !isPlainObject(user.sources.arxiv)) {
    throw configError(`${path}: sources.arxiv must be an object`)
  }

  const defaults = defaultConfig()
  return {
    ...defaults,
    ...user,
    sources: {
      ...defaults.sources,
      ...(isPlainObject(user.sources) ? user.sources : {}),
      arxiv: {
        ...defaults.sources.arxiv,
        ...(isPlainObject(user.sources?.arxiv) ? user.sources.arxiv : {}),
      },
    },
    quota: { ...defaults.quota, ...(isPlainObject(user.quota) ? user.quota : {}) },
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

  for (const key of ['total', 'papers', 'blogs']) assertCount(config.quota?.[key], `quota.${key}`, path)
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
