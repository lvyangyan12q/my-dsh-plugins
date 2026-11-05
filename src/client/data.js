/**
 * Pure data helpers for the reading page.
 *
 * The page component used to carry preference parsing, digest flattening,
 * day labels and the filter/query rules inline. They are pure (except the
 * deliberately injectable storage access), so they live here where the
 * component, the build, and a future unit test can share one definition.
 */
export const STORAGE_KEY = 'dsh-paper-reader:v1'
export const MODE_IDS = ['both', 'zh', 'en']

export const DEFAULT_PREFS = {
  mode: 'both',
  direction: 'all',
  source: 'all',
  bookmarksOnly: false,
  activeId: null,
  read: [],
  bookmarks: [],
  collapsed: [],
  sidebarCollapsed: false,
  outlineOpen: false,
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** Read persisted preferences, reporting whether a stored value existed. */
export function readStoredPrefs(storage = globalThis.localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { prefs: { ...DEFAULT_PREFS }, stored: false }
    const value = JSON.parse(raw)
    const prefs = { ...DEFAULT_PREFS, ...(value && typeof value === 'object' ? value : {}) }
    prefs.mode = MODE_IDS.includes(prefs.mode) ? prefs.mode : 'both'
    prefs.direction = typeof prefs.direction === 'string' ? prefs.direction : 'all'
    prefs.source = typeof prefs.source === 'string' ? prefs.source : 'all'
    prefs.activeId = typeof prefs.activeId === 'string' ? prefs.activeId : null
    for (const key of ['read', 'bookmarks', 'collapsed']) {
      prefs[key] = Array.isArray(prefs[key]) ? prefs[key].filter(entry => typeof entry === 'string') : []
    }
    prefs.bookmarksOnly = prefs.bookmarksOnly === true
    prefs.sidebarCollapsed = prefs.sidebarCollapsed === true
    prefs.outlineOpen = prefs.outlineOpen === true
    return { prefs, stored: true }
  } catch {
    return { prefs: { ...DEFAULT_PREFS }, stored: false }
  }
}

/** Flatten loaded days into the item list the page renders. */
export function flattenDigest(digest) {
  if (!digest || !Array.isArray(digest.days)) return []
  const items = []
  for (const day of digest.days) {
    if (!day || typeof day.date !== 'string' || !Array.isArray(day.items)) continue
    for (const item of day.items) if (item && typeof item.id === 'string') items.push({ ...item, dayDate: day.date })
  }
  return items
}

/** Merge day documents by date, newest first. A reloaded day replaces its copy. */
export function mergeDays(previous, incoming) {
  const byDate = new Map(previous.map(day => [day.date, day]))
  for (const day of incoming) {
    if (day && typeof day.date === 'string') byDate.set(day.date, day)
  }
  return [...byDate.values()].sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0))
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Day label relative to the newest day in the digest (今天/昨天/前天). */
export function dayLabel(dateStr, refStr) {
  const date = parseDate(dateStr)
  const ref = parseDate(refStr)
  if (!date) return { name: dateStr, sub: '' }
  const diff = ref ? Math.round((ref.getTime() - date.getTime()) / 86_400_000) : 99
  const dateLabel = `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  const weekday = WEEKDAYS[date.getDay()]
  if (diff >= 0 && diff < 3) return { name: ['今天', '昨天', '前天'][diff], sub: `${dateLabel} · ${weekday}` }
  return { name: dateLabel, sub: weekday }
}

/** Does an item match the free-text query? Title, summary, authors, tags, venue. */
export function matchesQuery(item, query) {
  if (!query) return true
  const haystack = [
    item.title?.original, item.title?.translation,
    item.summary?.original, item.summary?.translation,
    item.org, item.venue,
    ...(Array.isArray(item.authors) ? item.authors : []),
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(value => typeof value === 'string').join(' ').toLowerCase()
  return haystack.includes(query)
}

/**
 * Apply search + favorites, then return the source-filtered pool.
 *
 * Source chips are a third independent facet: the returned pool still has to
 * go through the direction filter, and the counts the page shows are computed
 * over this pool so a chip never claims items another facet already hid.
 */
export function applyBaseFilters(items, {
  query = '',
  bookmarksOnly = false,
  bookmarks = [],
  source = 'all',
} = {}) {
  const normalized = String(query ?? '').trim().toLowerCase()
  const marked = new Set(bookmarks)
  const searched = items.filter(item =>
    matchesQuery(item, normalized) && (!bookmarksOnly || marked.has(item.id)))
  const visible = source === 'all' ? searched : searched.filter(item => item.sourceId === source)
  return { searched, visible }
}

/** Count items per facet value over a pool. */
export function countBy(items, key, { allId = 'all' } = {}) {
  const counts = new Map([[allId, items.length]])
  for (const item of items) {
    const value = item?.[key]
    if (typeof value !== 'string') continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}
