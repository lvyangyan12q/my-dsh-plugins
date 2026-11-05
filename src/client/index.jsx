/**
 * dsh-paper-reader client half.
 *
 * Contributes one sidebar entry ("论文阅读") and the main-column page it
 * opens. The page is native DSH DOM — no iframe, no external site:
 *
 *   left   daily groups of X / Claude Blog items, collapsible, search + direction filter
 *   right  one paper with 3 reading modes: 中英对照 / 仅中文 / English
 *
 * Data comes from GET /api/paper-reader/digest (see src/index.js). Reading
 * state (mode, read, bookmarks, collapsed days, active paper) is local to the
 * browser via localStorage.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import cssText from './styles.css'

const STORAGE_KEY = 'dsh-paper-reader:v1'
const PANEL_ID = 'paper-reader'
const MODES = [
  { id: 'both', label: '中英对照', short: '对照' },
  { id: 'zh', label: '仅中文' },
  { id: 'en', label: 'English' },
]
const DIRECTION_COLORS = {
  agent: '#8b7cf6',
  reasoning: '#3f9fb0',
  training: '#b07d2a',
  alignment: '#3f8f63',
  architecture: '#b56b6b',
}
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

const DEFAULT_PREFS = {
  mode: 'both',
  direction: 'all',
  bookmarksOnly: false,
  activeId: null,
  read: [],
  bookmarks: [],
  collapsed: [],
  sidebarCollapsed: false,
  outlineOpen: false,
}

/** Read persisted preferences, reporting whether a stored value existed. */
function readStoredPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { prefs: { ...DEFAULT_PREFS }, stored: false }
    const value = JSON.parse(raw)
    const prefs = { ...DEFAULT_PREFS, ...(value && typeof value === 'object' ? value : {}) }
    prefs.mode = MODES.some(mode => mode.id === prefs.mode) ? prefs.mode : 'both'
    prefs.direction = typeof prefs.direction === 'string' ? prefs.direction : 'all'
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

/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

function flattenDigest(digest) {
  if (!digest || !Array.isArray(digest.days)) return []
  const items = []
  for (const day of digest.days) {
    if (!day || typeof day.date !== 'string' || !Array.isArray(day.items)) continue
    for (const item of day.items) if (item && typeof item.id === 'string') items.push({ ...item, dayDate: day.date })
  }
  return items
}

function parseDate(value) {
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Day label relative to the newest day in the digest (今天/昨天/前天). */
function dayLabel(dateStr, refStr) {
  const date = parseDate(dateStr)
  const ref = parseDate(refStr)
  if (!date) return { name: dateStr, sub: '' }
  const diff = ref ? Math.round((ref.getTime() - date.getTime()) / 86_400_000) : 99
  const dateLabel = `${date.getMonth() + 1} 月 ${date.getDate()} 日`
  const weekday = WEEKDAYS[date.getDay()]
  if (diff >= 0 && diff < 3) return { name: ['今天', '昨天', '前天'][diff], sub: `${dateLabel} · ${weekday}` }
  return { name: dateLabel, sub: weekday }
}

/** HH:MM in the browser's local time, from an ISO timestamp. */
function clockTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function matchesQuery(item, query) {
  if (!query) return true
  const haystack = [
    item.titleZh, item.titleEn, item.summaryZh, item.org, item.venue,
    ...(Array.isArray(item.authors) ? item.authors : []),
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(value => typeof value === 'string').join(' ').toLowerCase()
  return haystack.includes(query)
}

function authorLine(authors) {
  if (!Array.isArray(authors) || authors.length === 0) return ''
  if (authors.length <= 3) return authors.join('、')
  return `${authors.slice(0, 3).join('、')} 等 ${authors.length} 人`
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const SVG = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
}

function IconSearch() {
  return <svg {...SVG}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
}
function IconChevron({ open }) {
  return <svg {...SVG} className={open ? 'pr-chev pr-chev-open' : 'pr-chev'}><path d="m9 6 6 6-6 6" /></svg>
}
function IconStar({ filled }) {
  return <svg {...SVG} fill={filled ? 'currentColor' : 'none'}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z" /></svg>
}
function IconRefresh() {
  return <svg {...SVG}><path d="M20 11a8 8 0 1 0-2.3 6.3" /><path d="M20 5v6h-6" /></svg>
}
function IconOutline() {
  return <svg {...SVG}><path d="M4 6h10M4 12h10M4 18h7" /><path d="M18 5v14" /></svg>
}
function IconSidebar() {
  return <svg {...SVG}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
}
function IconMenu() {
  return <svg {...SVG}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
}
function IconClose() {
  return <svg {...SVG}><path d="m6 6 12 12M18 6 6 18" /></svg>
}
function IconBook() {
  return <svg {...SVG}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" /><path d="M4 5.5v15" /></svg>
}
function IconLink() {
  return <svg {...SVG} width={13} height={13}><path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></svg>
}
function IconSpark() {
  return <svg {...SVG} width={14} height={14}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8" /></svg>
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

/** Render `^{...}` / `_{...}` in an equation as <sup>/<sub>. */
function renderMath(text) {
  const source = typeof text === 'string' ? text : ''
  const regex = /(\^\{[^}]*\}|_\{[^}]*\})/
  const nodes = []
  let rest = source
  let key = 0
  while (true) {
    const match = regex.exec(rest)
    if (!match) break
    if (match.index > 0) nodes.push(rest.slice(0, match.index))
    const token = match[0]
    const content = token.slice(2, -1)
    nodes.push(token[0] === '^' ? <sup key={`sup-${key++}`}>{content}</sup> : <sub key={`sub-${key++}`}>{content}</sub>)
    rest = rest.slice(match.index + token.length)
  }
  if (rest) nodes.push(rest)
  return nodes
}

function SourceBadge({ source }) {
  const id = source?.id ?? 'x'
  return <span className={`pr-source pr-source-${id}`} title={source?.label ?? id}>{(source?.short ?? id).slice(0, 1)}</span>
}

function PendingParagraph() {
  return (
    <div className="pr-pending" aria-label="该段翻译生成中">
      <span className="pr-skeleton" />
      <span className="pr-skeleton pr-skeleton-short" />
      <span className="pr-pending-label">翻译生成中…</span>
    </div>
  )
}

function ZhParagraph({ block }) {
  if (typeof block.zh === 'string' && block.zh.length > 0) return <p>{block.zh}</p>
  if (block.zhState === 'pending') return <PendingParagraph />
  return (
    <div className="pr-missing">
      <p>{block.en}</p>
      <span>暂未翻译，显示原文</span>
    </div>
  )
}

function UnreadDot() {
  return <span className="pr-unread" title="未读" />
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export function PaperReaderPage() {
  const stored = useRef(readStoredPrefs())
  const [prefs, setPrefs] = useState(stored.current.prefs)
  const [digest, setDigest] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [toast, setToast] = useState('')
  const [progress, setProgress] = useState(0)
  const [activeHeading, setActiveHeading] = useState(-1)

  const searchRef = useRef(null)
  const scrollRef = useRef(null)
  const restoreBlockRef = useRef(null)
  const rafRef = useRef(0)
  const toastTimerRef = useRef(0)
  const seededRef = useRef(false)
  const digestRef = useRef(null)

  const update = useCallback((patch) => setPrefs(previous => ({ ...previous, ...patch })), [])

  const showToast = useCallback((message) => {
    setToast(message)
    window.clearTimeout(toastTimerRef.current)
    toastTimerRef.current = window.setTimeout(() => setToast(''), 2800)
  }, [])

  useEffect(() => () => {
    window.clearTimeout(toastTimerRef.current)
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }, [])

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true)
    else setLoadState('loading')
    try {
      const response = await fetch('/api/paper-reader/digest', {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok) {
        let detail = ''
        try {
          const body = await response.json()
          detail = body?.message ? `：${body.message}` : ''
        } catch {
          // Ignore a body that is not JSON.
        }
        throw new Error(`HTTP ${response.status}${detail}`)
      }
      const data = await response.json()
      if (!data || !Array.isArray(data.days)) throw new Error('数据格式无效')
      digestRef.current = data
      setDigest(data)
      setLoadState('ready')
      setLoadError('')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isRefresh && digestRef.current) {
        // Keep the readable list on screen; a refresh failure is a notice, not a page reset.
        showToast(`刷新失败：${message}`)
      } else {
        setLoadError(message)
        setLoadState('error')
      }
    } finally {
      setRefreshing(false)
    }
  }, [showToast])

  useEffect(() => { void load(false) }, [load])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* storage may be unavailable */ }
  }, [prefs])

  const items = useMemo(() => flattenDigest(digest), [digest])
  const sourceById = useMemo(() => {
    const map = new Map()
    for (const source of digest?.sources ?? []) map.set(source.id, source)
    return map
  }, [digest])
  const directions = useMemo(() => {
    const declared = Array.isArray(digest?.directions) ? digest.directions : []
    return [{ id: 'all', label: '全部' }, ...declared.filter(direction => direction && typeof direction.id === 'string')]
  }, [digest])
  const directionById = useMemo(() => new Map(directions.map(direction => [direction.id, direction])), [directions])

  // Seed first-open state and keep the active paper valid after a refresh.
  useEffect(() => {
    if (!digest) return
    setPrefs(previous => {
      const known = new Set(items.map(item => item.id))
      let next = previous
      if (!previous.activeId || !known.has(previous.activeId)) {
        next = { ...next, activeId: items[0]?.id ?? null }
      }
      if (!seededRef.current) {
        seededRef.current = true
        if (!stored.current.stored) {
          next = {
            ...next,
            read: items.filter(item => item.read === true).map(item => item.id),
            bookmarks: items.filter(item => item.bookmarked === true).map(item => item.id),
          }
        }
        if (next.activeId && !next.read.includes(next.activeId)) next = { ...next, read: [...next.read, next.activeId] }
      }
      return next
    })
  }, [digest, items])

  const activeItem = useMemo(() => items.find(item => item.id === prefs.activeId) ?? null, [items, prefs.activeId])
  const normalizedQuery = query.trim().toLowerCase()

  const baseItems = useMemo(() => items.filter(item =>
    matchesQuery(item, normalizedQuery) && (!prefs.bookmarksOnly || prefs.bookmarks.includes(item.id)),
  ), [items, normalizedQuery, prefs.bookmarksOnly, prefs.bookmarks])

  const counts = useMemo(() => {
    const map = new Map([['all', baseItems.length]])
    for (const item of baseItems) map.set(item.direction, (map.get(item.direction) ?? 0) + 1)
    return map
  }, [baseItems])

  const visibleItems = useMemo(
    () => baseItems.filter(item => prefs.direction === 'all' || item.direction === prefs.direction),
    [baseItems, prefs.direction],
  )

  const groups = useMemo(() => {
    const byDate = new Map(visibleItems.map(item => [item.dayDate, []]))
    for (const item of visibleItems) byDate.get(item.dayDate).push(item)
    const referenceDate = digest?.days?.[0]?.date ?? ''
    return (digest?.days ?? [])
      .filter(day => byDate.has(day.date))
      .map(day => ({
        date: day.date,
        label: dayLabel(day.date, referenceDate),
        items: byDate.get(day.date),
      }))
  }, [digest, visibleItems])

  const unreadCount = useMemo(() => items.filter(item => !prefs.read.includes(item.id)).length, [items, prefs.read])
  const bookmarkedCount = prefs.bookmarks.length
  const activeVisibleIndex = visibleItems.findIndex(item => item.id === prefs.activeId)

  const headings = useMemo(() => {
    if (!activeItem) return []
    const out = []
    activeItem.blocks.forEach((block, index) => {
      if (block && block.type === 'heading') {
        const label = prefs.mode === 'en' ? (block.en ?? block.zh) : (block.zh ?? block.en)
        out.push({ index, level: Number(block.level) || 1, label: label || '未命名小节' })
      }
    })
    return out
  }, [activeItem, prefs.mode])

  /* ---------------------------- actions ---------------------------- */

  const selectItem = (id) => {
    setPrefs(previous => ({
      ...previous,
      activeId: id,
      read: previous.read.includes(id) ? previous.read : [...previous.read, id],
    }))
    setDrawerOpen(false)
  }

  const toggleDay = (date) => {
    setPrefs(previous => ({
      ...previous,
      collapsed: previous.collapsed.includes(date)
        ? previous.collapsed.filter(entry => entry !== date)
        : [...previous.collapsed, date],
    }))
  }

  const toggleBookmark = () => {
    if (!activeItem) return
    const id = activeItem.id
    setPrefs(previous => ({
      ...previous,
      bookmarks: previous.bookmarks.includes(id)
        ? previous.bookmarks.filter(entry => entry !== id)
        : [...previous.bookmarks, id],
    }))
  }

  const currentBlockIndex = () => {
    const container = scrollRef.current
    if (!container) return null
    const top = container.getBoundingClientRect().top + 12
    let current = null
    for (const element of container.querySelectorAll('[data-block]')) {
      if (element.getBoundingClientRect().top <= top) current = Number(element.getAttribute('data-block'))
      else break
    }
    return current
  }

  const changeMode = (mode) => {
    if (mode === prefs.mode) return
    restoreBlockRef.current = currentBlockIndex()
    update({ mode })
  }

  const move = (delta) => {
    if (visibleItems.length === 0) return
    const current = visibleItems.findIndex(item => item.id === prefs.activeId)
    const index = current < 0 ? 0 : Math.min(visibleItems.length - 1, Math.max(0, current + delta))
    selectItem(visibleItems[index].id)
  }

  const scrollToBlock = (index) => {
    const container = scrollRef.current
    const element = container?.querySelector(`[data-block="${index}"]`)
    if (!container || !element) return
    container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top - 12
  }

  const clearFilters = () => {
    setQuery('')
    update({ direction: 'all', bookmarksOnly: false })
  }

  const retryTranslation = () => {
    showToast('翻译由每日 agent 生成；缺失段落会在下次抓取时补齐。')
  }

  /* ---------------------------- effects ---------------------------- */

  useLayoutEffect(() => {
    const container = scrollRef.current
    if (container) container.scrollTop = 0
    setProgress(0)
    setActiveHeading(-1)
  }, [prefs.activeId])

  useLayoutEffect(() => {
    const anchor = restoreBlockRef.current
    restoreBlockRef.current = null
    const container = scrollRef.current
    if (anchor === null || !container) return
    const element = container.querySelector(`[data-block="${anchor}"]`)
    if (!element) return
    container.scrollTop += element.getBoundingClientRect().top - container.getBoundingClientRect().top - 12
  }, [prefs.mode])

  const handleScroll = () => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const container = scrollRef.current
      if (!container) return
      const max = container.scrollHeight - container.clientHeight
      setProgress(max > 0 ? Math.min(1, Math.max(0, container.scrollTop / max)) : 0)
      const top = container.getBoundingClientRect().top + 16
      let current = -1
      for (const heading of headings) {
        const element = container.querySelector(`[data-block="${heading.index}"]`)
        if (element && element.getBoundingClientRect().top <= top) current = heading.index
      }
      setActiveHeading(current)
    })
  }

  // Keyboard shortcuts: /, 1 2 3, j k, b, Ctrl/Cmd+B, Escape.
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target
      const typing = target instanceof HTMLElement && (
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      )
      if (event.defaultPrevented) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        update({ sidebarCollapsed: !prefs.sidebarCollapsed })
        return
      }
      if (event.key === '/' && !typing) {
        event.preventDefault()
        searchRef.current?.focus()
        return
      }
      if (typing) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === '1') changeMode('both')
      else if (event.key === '2') changeMode('zh')
      else if (event.key === '3') changeMode('en')
      else if (event.key.toLowerCase() === 'j') { event.preventDefault(); move(1) }
      else if (event.key.toLowerCase() === 'k') { event.preventDefault(); move(-1) }
      else if (event.key.toLowerCase() === 'b') toggleBookmark()
      else if (event.key === 'Escape') {
        if (query) setQuery('')
        else if (drawerOpen) setDrawerOpen(false)
        else searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  /* ---------------------------- render ----------------------------- */

  if (loadState === 'loading') {
    return (
      <div className="pr-root">
        <div className="pr-loading">
          <span className="pr-spinner" />
          <span>正在读取每日论文…</span>
        </div>
      </div>
    )
  }

  if (loadState === 'error') {
    return (
      <div className="pr-root">
        <div className="pr-error">
          <div className="pr-error-title">无法读取论文列表</div>
          <p className="pr-error-text">{loadError}</p>
          <p className="pr-error-hint">
            数据来自 <code>$DSH_HOME/paper-reader/digest.json</code>；文件缺失时使用内置示例。
          </p>
          <button className="pr-primary-btn" onClick={() => void load(false)}>重试</button>
        </div>
      </div>
    )
  }

  return (
    <div className="pr-root">

      <header className="pr-top">
        <div className="pr-brand">
          <span className="pr-brand-mark"><IconBook /></span>
          <span className="pr-brand-name">论文阅读</span>
          {digest.demo && <span className="pr-demo" title="当前为内置示例数据；agent 写入 digest.json 后自动切换">示例数据</span>}
        </div>

        <div className="pr-status">
          <span className="pr-status-dot" />
          <span className="pr-status-text">每日 09:00 抓取 · X / Claude Blog · {items.length} 篇 · {unreadCount} 未读</span>
        </div>

        <div className="pr-top-actions">
          <button
            type="button"
            className="pr-icon-btn"
            onClick={() => {
              const narrow = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 900px)').matches
              if (narrow) setDrawerOpen(true)
              else update({ sidebarCollapsed: !prefs.sidebarCollapsed })
            }}
            title="展开 / 收起列表（Ctrl+B）"
            aria-label="展开或收起列表"
          >
            <IconSidebar />
          </button>
          <button
            type="button"
            className={prefs.outlineOpen ? 'pr-icon-btn is-active' : 'pr-icon-btn'}
            onClick={() => update({ outlineOpen: !prefs.outlineOpen })}
            title="本文大纲"
            aria-label="切换本文大纲"
            aria-pressed={prefs.outlineOpen}
          >
            <IconOutline />
          </button>
          <button
            type="button"
            className="pr-ghost-btn"
            onClick={() => void load(true)}
            disabled={refreshing}
            title="重新读取 digest.json"
          >
            <span className={refreshing ? 'pr-spin' : undefined}><IconRefresh /></span>
            {refreshing ? '刷新中' : '刷新'}
          </button>
        </div>
      </header>

      <div className="pr-workspace">
        {drawerOpen && <div className="pr-scrim" onClick={() => setDrawerOpen(false)} />}

        <aside
          className={[
            'pr-sidebar',
            prefs.sidebarCollapsed && !drawerOpen ? 'is-collapsed' : '',
            drawerOpen ? 'is-drawer-open' : '',
          ].filter(Boolean).join(' ')}
          aria-label="每日论文列表"
        >
          <div className="pr-sidebar-head">
            <div className="pr-search">
              <span className="pr-search-icon"><IconSearch /></span>
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索标题、作者、关键词"
                aria-label="搜索论文"
              />
              {query
                ? <button type="button" className="pr-search-clear" onClick={() => setQuery('')} aria-label="清除搜索"><IconClose /></button>
                : <kbd className="pr-kbd">/</kbd>}
            </div>

            <div className="pr-filters" role="toolbar" aria-label="按方向筛选">
              {directions.map(direction => (
                <button
                  type="button"
                  key={direction.id}
                  className={prefs.direction === direction.id ? 'pr-chip is-active' : 'pr-chip'}
                  onClick={() => update({ direction: direction.id })}
                  aria-pressed={prefs.direction === direction.id}
                >
                  {direction.label}
                  <span className="pr-chip-count">{counts.get(direction.id) ?? 0}</span>
                </button>
              ))}
              <button
                type="button"
                className={prefs.bookmarksOnly ? 'pr-chip pr-chip-mark is-active' : 'pr-chip pr-chip-mark'}
                onClick={() => update({ bookmarksOnly: !prefs.bookmarksOnly })}
                aria-pressed={prefs.bookmarksOnly}
                title="只看收藏"
              >
                ★ 收藏 <span className="pr-chip-count">{bookmarkedCount}</span>
              </button>
            </div>

            {(normalizedQuery || prefs.direction !== 'all' || prefs.bookmarksOnly) && (
              <div className="pr-result-line">
                <span>{visibleItems.length} 篇匹配</span>
                <button type="button" className="pr-link-btn" onClick={clearFilters}>清除筛选</button>
              </div>
            )}
          </div>

          <div className="pr-feed" role="listbox" aria-label="论文列表">
            {groups.length === 0 && (
              <div className="pr-feed-empty">
                <p>没有匹配的论文</p>
                <button type="button" className="pr-link-btn" onClick={clearFilters}>清除搜索与筛选</button>
              </div>
            )}

            {groups.map(group => {
              const expanded = normalizedQuery || prefs.direction !== 'all' || prefs.bookmarksOnly
                ? true
                : !prefs.collapsed.includes(group.date)
              return (
                <section className="pr-day" key={group.date}>
                  <button
                    type="button"
                    className="pr-day-head"
                    onClick={() => toggleDay(group.date)}
                    aria-expanded={expanded}
                  >
                    <IconChevron open={expanded} />
                    <span className="pr-day-name">{group.label.name}</span>
                    <span className="pr-day-sub">{group.label.sub}</span>
                    <span className="pr-day-count">{group.items.length}</span>
                  </button>

                  {expanded && (
                    <div className="pr-day-items" role="group" aria-label={group.label.name}>
                      {group.items.map(item => {
                        const source = sourceById.get(item.sourceId) ?? { id: item.sourceId ?? 'x', label: item.sourceId ?? 'X', short: 'X' }
                        const direction = directionById.get(item.direction) ?? { label: item.direction ?? '未分类' }
                        const read = prefs.read.includes(item.id)
                        const bookmarked = prefs.bookmarks.includes(item.id)
                        const active = prefs.activeId === item.id
                        return (
                          <div
                            key={item.id}
                            role="option"
                            tabIndex={0}
                            aria-selected={active}
                            className={[
                              'pr-item',
                              active ? 'is-active' : '',
                              read ? 'is-read' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => selectItem(item.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault()
                                selectItem(item.id)
                              }
                            }}
                          >
                            <div className="pr-item-head">
                              <SourceBadge source={source} />
                              <span className="pr-item-time">{clockTime(item.collectedAt)}</span>
                              {item.translation?.status === 'partial' && <span className="pr-pill">翻译中</span>}
                              {bookmarked && <span className="pr-item-mark" title="已收藏">★</span>}
                              {!read && <UnreadDot />}
                            </div>
                            <div className="pr-item-title-zh">{item.titleZh}</div>
                            <div className="pr-item-title-en">{item.titleEn}</div>
                            <div className="pr-item-meta">
                              <span
                                className="pr-dir"
                                style={{ '--pr-dir-color': DIRECTION_COLORS[item.direction] ?? 'var(--pr-muted)' }}
                              >
                                {direction.label}
                              </span>
                              <span className="pr-dot">·</span>
                              <span>{item.readingMinutes ?? '—'} 分钟</span>
                              <span className="pr-dot">·</span>
                              <span className="pr-item-venue">{item.venue}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <div className="pr-sidebar-foot">
            <span>每日 09:00 由 agent 抓取 · 已去重</span>
            <button type="button" className="pr-link-btn" onClick={() => showToast(digest.demo ? '当前是内置示例；agent 写入 digest.json 后自动切换。' : `数据文件：${digest.digestPath ?? 'digest.json'}`)}>
              数据来源
            </button>
          </div>
        </aside>

        <main className="pr-reader">
          <div className="pr-reader-bar">
            <button type="button" className="pr-icon-btn pr-mobile-only" onClick={() => setDrawerOpen(true)} aria-label="打开论文列表">
              <IconMenu />
            </button>

            <div className="pr-reader-context">
              {activeItem
                ? <><span>{Math.max(0, activeVisibleIndex) + 1}</span> / {visibleItems.length || items.length} · 已读 {prefs.read.length}/{items.length}</>
                : '未选择论文'}
            </div>

            <div className="pr-mode" role="tablist" aria-label="阅读模式">
              {MODES.map(mode => (
                <button
                  type="button"
                  key={mode.id}
                  role="tab"
                  aria-selected={prefs.mode === mode.id}
                  className={prefs.mode === mode.id ? 'pr-mode-btn is-active' : 'pr-mode-btn'}
                  onClick={() => changeMode(mode.id)}
                  title={`${mode.label}（快捷键 ${mode.id === 'both' ? 1 : mode.id === 'zh' ? 2 : 3}）`}
                >
                  {mode.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              className={activeItem && prefs.bookmarks.includes(activeItem.id) ? 'pr-icon-btn pr-star is-active' : 'pr-icon-btn pr-star'}
              onClick={toggleBookmark}
              disabled={!activeItem}
              title="收藏（B）"
              aria-label="收藏当前论文"
              aria-pressed={Boolean(activeItem && prefs.bookmarks.includes(activeItem.id))}
            >
              <IconStar filled={Boolean(activeItem && prefs.bookmarks.includes(activeItem.id))} />
            </button>
          </div>

          <div className="pr-progress" aria-hidden="true">
            <div className="pr-progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <div className="pr-scroll" ref={scrollRef} onScroll={handleScroll}>
            {!activeItem && (
              <div className="pr-reader-empty">
                <IconBook />
                <p>从左侧选择一篇论文开始阅读</p>
                <span>按 / 搜索，按 J / K 切换上一篇、下一篇</span>
              </div>
            )}

            {activeItem && (
              <article className="pr-paper">
                <header className="pr-paper-head">
                  <div className="pr-kicker">
                    <SourceBadge source={sourceById.get(activeItem.sourceId) ?? { id: 'x', short: 'X', label: 'X' }} />
                    <span>{sourceById.get(activeItem.sourceId)?.label ?? activeItem.sourceId}</span>
                    <span className="pr-dot">·</span>
                    <span>{(directionById.get(activeItem.direction) ?? { label: activeItem.direction }).label}</span>
                    <span className="pr-dot">·</span>
                    <span>收集于 {clockTime(activeItem.collectedAt)}</span>
                    {activeItem.excerpt && <span className="pr-chip-inline">节选</span>}
                  </div>

                  {prefs.mode !== 'en' && <h1 className="pr-title-zh">{activeItem.titleZh}</h1>}
                  {prefs.mode !== 'zh' && (
                    <p className={prefs.mode === 'en' ? 'pr-title-en pr-title-en-hero' : 'pr-title-en'}>
                      {activeItem.titleEn}
                    </p>
                  )}

                  <div className="pr-meta">
                    {activeItem.authors?.length > 0 && <span>{authorLine(activeItem.authors)}</span>}
                    {activeItem.org && <><span className="pr-dot">·</span><span>{activeItem.org}</span></>}
                    {activeItem.venue && <><span className="pr-dot">·</span><span>{activeItem.venue}</span></>}
                    {activeItem.published && <><span className="pr-dot">·</span><span>{activeItem.published}</span></>}
                    <span className="pr-dot">·</span>
                    <span>{activeItem.readingMinutes ?? '—'} 分钟</span>
                    {activeItem.url && (
                      <a className="pr-origin" href={activeItem.url} target="_blank" rel="noreferrer">
                        原文 <IconLink />
                      </a>
                    )}
                  </div>

                  {prefs.mode !== 'en' && activeItem.summaryZh && (
                    <div className="pr-summary">
                      <span className="pr-summary-label">导读</span>
                      <p>{activeItem.summaryZh}</p>
                    </div>
                  )}

                  {activeItem.translation?.status === 'partial' && (
                    <div className="pr-notice">
                      <span>翻译进行中 · {activeItem.translation.done ?? '—'}/{activeItem.translation.total ?? '—'} 段</span>
                      <button type="button" className="pr-link-btn" onClick={retryTranslation}>重试</button>
                    </div>
                  )}

                  {digest.demo && (
                    <div className="pr-demo-note">
                      当前显示内置示例。agent 写入 <code>$DSH_HOME/paper-reader/digest.json</code> 后，这里会自动换成真实抓取结果。
                    </div>
                  )}
                </header>

                <div className="pr-body" data-mode={prefs.mode}>
                  {prefs.mode === 'both' && (
                    <div className="pr-legend" aria-hidden="true">
                      <span>原文</span>
                      <span>中文</span>
                    </div>
                  )}

                  {activeItem.blocks.map((block, index) => {
                    if (!block || typeof block !== 'object') return null
                    const blockId = `pr-b-${index}`
                    const anchor = { 'data-block': index, id: blockId }

                    if (block.type === 'heading') {
                      const level = Number(block.level) || 1
                      const HeadingTag = level <= 2 ? 'h2' : 'h3'
                      if (prefs.mode === 'both') {
                        return (
                          <div className="pr-pair pr-pair-heading" key={index} {...anchor}>
                            <div className="pr-col pr-col-en"><HeadingTag>{block.en}</HeadingTag></div>
                            <div className="pr-col pr-col-zh"><HeadingTag>{block.zh ?? block.en}</HeadingTag></div>
                          </div>
                        )
                      }
                      return (
                        <HeadingTag className="pr-single-heading" key={index} {...anchor}>
                          {prefs.mode === 'en' ? (block.en ?? block.zh) : (block.zh ?? block.en)}
                        </HeadingTag>
                      )
                    }

                    if (block.type === 'paragraph') {
                      if (prefs.mode === 'both') {
                        return (
                          <div className="pr-pair" key={index} {...anchor}>
                            <div className="pr-col pr-col-en"><p>{block.en}</p></div>
                            <div className="pr-col pr-col-zh"><ZhParagraph block={block} /></div>
                          </div>
                        )
                      }
                      if (prefs.mode === 'en') {
                        return <p className="pr-single-paragraph" key={index} {...anchor}>{block.en}</p>
                      }
                      return <div className="pr-single-paragraph" key={index} {...anchor}><ZhParagraph block={block} /></div>
                    }

                    if (block.type === 'equation') {
                      return (
                        <figure className="pr-equation" key={index} {...anchor}>
                          <div className="pr-eq-line">
                            <span className="pr-eq-display">{renderMath(block.display)}</span>
                            {block.label && <span className="pr-eq-label">{block.label}</span>}
                          </div>
                          {block.detail && <div className="pr-eq-detail">{renderMath(block.detail)}</div>}
                          {(block.noteZh || block.noteEn) && (
                            <figcaption className="pr-eq-note">
                              {prefs.mode !== 'en' && block.noteZh && <span>{block.noteZh}</span>}
                              {prefs.mode !== 'zh' && block.noteEn && <span className="pr-eq-note-en">{block.noteEn}</span>}
                            </figcaption>
                          )}
                        </figure>
                      )
                    }

                    if (block.type === 'figure') {
                      const steps = Array.isArray(block.diagram?.steps) ? block.diagram.steps : []
                      return (
                        <figure className="pr-figure" key={index} {...anchor}>
                          {steps.length > 0 && (
                            <div className="pr-diagram" role="img" aria-label={block.diagram?.title ?? '流程图'}>
                              {steps.map((step, stepIndex) => (
                                <span className="pr-diagram-step-wrap" key={`${step}-${stepIndex}`}>
                                  <span className="pr-diagram-step">{step}</span>
                                  {stepIndex < steps.length - 1 && <span className="pr-diagram-arrow" aria-hidden="true">→</span>}
                                </span>
                              ))}
                            </div>
                          )}
                          <figcaption className="pr-figure-caption">
                            {prefs.mode !== 'zh' && block.captionEn && <span>{block.captionEn}</span>}
                            {prefs.mode !== 'en' && block.captionZh && <span>{block.captionZh}</span>}
                          </figcaption>
                        </figure>
                      )
                    }

                    if (block.type === 'code') {
                      return (
                        <pre className="pr-code" key={index} {...anchor}>
                          <code>{block.code}</code>
                        </pre>
                      )
                    }

                    return null
                  })}

                  <footer className="pr-paper-end">
                    <span>已读完本文</span>
                    <button type="button" className="pr-primary-btn" onClick={() => move(1)} disabled={visibleItems.length <= 1}>
                      下一篇（J）
                    </button>
                  </footer>
                </div>
              </article>
            )}
          </div>
        </main>

        {prefs.outlineOpen && (
          <aside className="pr-outline" aria-label="本文大纲">
            <div className="pr-outline-head">
              <span>大纲</span>
              <button type="button" className="pr-icon-btn" onClick={() => update({ outlineOpen: false })} aria-label="关闭大纲">
                <IconClose />
              </button>
            </div>
            {headings.length > 0 ? (
              <nav className="pr-outline-nav">
                {headings.map(heading => (
                  <button
                    type="button"
                    key={heading.index}
                    className={[
                      'pr-outline-link',
                      heading.level > 2 ? 'is-sub' : '',
                      activeHeading === heading.index ? 'is-active' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => scrollToBlock(heading.index)}
                  >
                    {heading.label}
                  </button>
                ))}
              </nav>
            ) : (
              <p className="pr-outline-empty">本文暂无小节标题</p>
            )}
          </aside>
        )}
      </div>

      {toast && <div className="pr-toast" role="status">{toast}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Plugin registration                                                 */
/* ------------------------------------------------------------------ */

/** Sidebar entry glyph; the sidebar owns the button and its label. */
export function PaperReaderPanelIcon({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
      <path d="M4 5.5v15" />
      <path d="M8 7h8M8 10.5h5" />
    </svg>
  )
}

/** Add the stylesheet once per page load. */
function installStyles() {
  if (document.getElementById('dsh-paper-reader-styles')) return
  const tag = document.createElement('style')
  tag.id = 'dsh-paper-reader-styles'
  tag.textContent = cssText
  document.head.appendChild(tag)
}

export const inject = ['slots']

export function apply(ctx) {
  installStyles()
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    label: '论文阅读',
  }, PaperReaderPanelIcon))

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
  }, PaperReaderPage))
}
