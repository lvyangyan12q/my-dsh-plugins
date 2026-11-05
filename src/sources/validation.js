/**
 * Config validation helpers shared by every source adapter.
 *
 * Each adapter owns the keys it understands and validates them through these
 * helpers, so adding a source does not mean editing one growing validation
 * function. The error shape (`code: "config_invalid"`, status 400, exit code 2)
 * is the same one the CLI and the HTTP layer already report.
 */

export function configError(message) {
  return Object.assign(new Error(message), { code: 'config_invalid', exitCode: 2, status: 400 })
}

export function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function assertStringList(value, key, path, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) throw configError(`${path}: ${key} must be an array of strings`)
  if (value.some(entry => typeof entry !== 'string' || entry.trim().length === 0)) {
    throw configError(`${path}: ${key} must only contain non-empty strings`)
  }
  if (!allowEmpty && value.length === 0) throw configError(`${path}: ${key} must not be empty`)
}

export function assertCount(value, key, path) {
  if (!Number.isInteger(value) || value < 0) throw configError(`${path}: ${key} must be a non-negative integer`)
}

export function assertPositive(value, key, path) {
  if (!Number.isFinite(value) || value <= 0) throw configError(`${path}: ${key} must be a positive number`)
}

export function assertUrl(value, key, path) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    throw configError(`${path}: ${key} must be an http(s) URL`)
  }
}
