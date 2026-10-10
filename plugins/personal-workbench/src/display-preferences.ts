import type { DisplayScope, DisplaySource } from './display-api.ts'

const storageKey = 'personal-workbench/display-state/v1'
const maxBytes = 262144, maxEntries = 64
export type DisplayStorage = Pick<Storage, 'getItem' | 'setItem'>
export interface DisplayPreferences { filters: Record<string, string>; search: string; selectedId?: string }
export interface DisplayPersistence { connectionId: string; storage?: DisplayStorage }
interface Entry { key: string; state: DisplayPreferences }
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit
const identity = (value: unknown): value is string => text(value, 1024) && !!value

export function browserDisplayStorage(): DisplayStorage | undefined { try { return window.localStorage } catch { return undefined } }
export function displayPreferenceKey(source: DisplaySource, scope: DisplayScope, connectionId: string): string | undefined {
  const parts = [scope.appId, scope.instanceId, connectionId, source.appId, source.resource, scope.preview]
  if (!parts.slice(0, 5).every(identity) || typeof scope.preview !== 'boolean') return undefined
  return JSON.stringify(parts)
}
function validKey(key: unknown): key is string {
  if (!text(key, 6144)) return false
  try { const parts: unknown = JSON.parse(key); return Array.isArray(parts) && parts.length === 6 && parts.slice(0, 5).every(identity) && typeof parts[5] === 'boolean' }
  catch { return false }
}
function validPreferences(value: unknown): value is DisplayPreferences {
  return object(value) && Object.keys(value).every(key => ['filters', 'search', 'selectedId'].includes(key))
    && object(value.filters) && Object.keys(value.filters).length <= 32
    && Object.entries(value.filters).every(([field, selection]) => text(field, 256) && !!field && text(selection, 1024))
    && text(value.search, 4096) && (value.selectedId === undefined || identity(value.selectedId))
}
/** Read only a bounded versioned presentation cache; never restore records or executable context. */
function entries(storage: DisplayStorage): Entry[] {
  const raw = storage.getItem(storageKey)
  if (raw === null) return []
  if (raw.length > maxBytes) throw Error('Oversized display state')
  const value: unknown = JSON.parse(raw)
  if (!object(value) || value.version !== 1 || Object.keys(value).length !== 2 || !Array.isArray(value.entries)
    || value.entries.length > maxEntries) throw Error('Unsupported display state')
  const found: Entry[] = [], seen = new Set<string>()
  for (const row of value.entries) {
    if (!object(row) || Object.keys(row).length !== 2 || !validKey(row.key) || !validPreferences(row.state) || seen.has(row.key)) throw Error('Invalid display state')
    seen.add(row.key); found.push({ key: row.key, state: row.state })
  }
  return found
}
export function loadDisplayPreferences(storage: DisplayStorage | undefined, key: string): { state?: DisplayPreferences; available: boolean } {
  if (!storage) return { available: false }
  try { const row = entries(storage).find(row => row.key === key); return { available: true, ...(row ? { state: { ...row.state, filters: { ...row.state.filters } } } : {}) } }
  catch { return { available: false } }
}
export function saveDisplayPreferences(storage: DisplayStorage | undefined, key: string, state: DisplayPreferences): boolean {
  if (!storage || !validKey(key) || !validPreferences(state)) return false
  try {
    const rows = entries(storage).filter(row => row.key !== key)
    rows.push({ key, state }); while (rows.length > maxEntries) rows.shift()
    let encoded = JSON.stringify({ version: 1, entries: rows })
    while (encoded.length > maxBytes && rows.length > 1) { rows.shift(); encoded = JSON.stringify({ version: 1, entries: rows }) }
    if (encoded.length > maxBytes) return false
    storage.setItem(storageKey, encoded)
    return storage.getItem(storageKey) === encoded
  } catch { return false }
}
