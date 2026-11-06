/**
 * dsh-paper-reader client half.
 *
 * Contributes one sidebar entry ("论文阅读") and the main-column page it
 * opens. The page is native DSH DOM — no iframe, no external site:
 *
 *   left   daily groups of X / Claude Blog items, collapsible, search + direction filter
 *   right  one paper with 3 reading modes: 中英对照 / 仅中文 / English
 *
 * Data comes from the host's day-file history: GET /api/paper-reader/index
 * names the stored days, then GET /api/paper-reader/digest/YYYY-MM-DD serves
 * each one (see src/index.js). The page loads the newest seven days first and
 * extends the window on demand, up to the 30-day retention limit. When no index
 * exists yet it falls back to the legacy single-file digest. Reading state
 * (mode, read, bookmarks, collapsed days, active paper) is local to the browser
 * via localStorage.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { normalizeDigest, otherLanguage, pickText } from '../shared/schema.js'
import { localDate } from '../shared/date.js'
import {
  applyBaseFilters,
  countBy,
  dayLabel,
  flattenDigest,
  mergeDays,
  readStoredPrefs,
} from './data.js'
import cssText from './styles.css'

const STORAGE_KEY = 'dsh-paper-reader:v1'
const PANEL_ID = 'paper-reader'
const INDEX_URL = '/api/paper-reader/index'
const STATUS_URL = '/api/paper-reader/status'
const DIGEST_URL = '/api/paper-reader/digest'
const PAGE_DAYS = 7
const MAX_HISTORY_DAYS = 30
const MODES = [
  { id: 'both', label: '中英对照', short: '对照' },
  { id: 'zh', label: '仅中文' },
  { id: 'en', label: 'English' },
]
const LANGUAGE_LABELS = { en: 'English', zh: '中文' }
const DIRECTION_COLORS = {
  agent: '#8b7cf6',
  reasoning: '#3f9fb0',
  training: '#b07d2a',
  alignment: '#3f8f63',
  architecture: '#b56b6b',
}
/* ------------------------------------------------------------------ */
/* Data helpers                                                        */
/* ------------------------------------------------------------------ */

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

/** HH:MM in the browser's local time, from an ISO timestamp. */
function clockTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ */
/* Latest run status                                                   */
/* ------------------------------------------------------------------ */

/**
 * Stable reason codes from the run record. The host owns the codes; the page
 * only maps them to short Chinese labels, so wording changes stay in one place.
 */
const SOURCE_REASON_LABELS = {
  source_failed: '抓取失败',
  source_skipped: '已跳过',
  proxy_unconfigured: '未配置代理',
  proxy_invalid: '代理地址无效',
  proxy_env_disabled: '代理环境变量未启用',
  proxy_transport_missing: '缺少代理传输层',
  proxy_auth: '代理认证失败',
  proxy_timeout: '代理连接超时',
  proxy_unreachable: '代理不可达',
  proxy_http: '代理健康检查失败',
}
const RUN_STATUS_LABELS = { ok: '成功', partial: '部分失败', failed: '失败', unknown: '未知' }

/** Human duration for the status line; 65 s reads as `1 分 5 秒`. */
function formatDuration(value) {
  const ms = Number(value)
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSeconds = Math.round(ms / 1000)
  if (totalSeconds < 60) return `${totalSeconds} 秒`
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`
}

function sourceLabel(source) {
  return source?.label ?? source?.id ?? '未知来源'
}

/** Prefer the stable code label; fall back to the recorded explanation. */
function sourceReason(source) {
  const code = typeof source?.code === 'string' ? source.code : ''
  if (code && SOURCE_REASON_LABELS[code]) return SOURCE_REASON_LABELS[code]
  if (typeof source?.reason === 'string' && source.reason && source.reason !== code) return source.reason
  if (typeof source?.error === 'string' && source.error) return source.error
  return '原因未知'
}

function issuesOf(status, name) {
  if (Array.isArray(status?.[name])) return status[name]
  const want = name === 'failedSources' ? 'failed' : 'skipped'
  return (Array.isArray(status?.sources) ? status.sources : []).filter(source => source?.status === want)
}

function RunSourceIssue({ source }) {
  const detail = source?.error && source.error !== sourceReason(source) ? source.error : ''
  return (
    <span className="pr-run-status-source" title={detail || sourceReason(source)}>
      {sourceLabel(source)}
      <span className="pr-run-status-reason">（{sourceReason(source)}）</span>
    </span>
  )
}

/** The language the item was written in; v1 digests are English-first. */
function sourceLanguageOf(item) {
  return item?.sourceLanguage === 'zh' ? 'zh' : 'en'
}

/** 「仅中文」/「English」 are target-language views, not original/translation ones. */
function targetLanguageOf(mode) {
  return mode === 'en' ? 'en' : 'zh'
}

function languageLabel(language) {
  return LANGUAGE_LABELS[language] ?? language
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

function UntranslatedNote() {
  return <span className="pr-fallback">未翻译，显示原文</span>
}

/** Translation column of a paired block: text, pending skeleton, or fallback. */
function TranslatedText({ block }) {
  if (block.translation) return <p>{block.translation}</p>
  if (block.translationState === 'pending') return <PendingParagraph />
  return (
    <div className="pr-missing">
      <p>{block.original}</p>
      <UntranslatedNote />
    </div>
  )
}

/** Original column; inline MathML is rendered when the extractor kept it. */
function OriginalText({ block }) {
  if (block.originalHtml) {
    return <p className="pr-inline-math" dangerouslySetInnerHTML={{ __html: block.originalHtml }} />
  }
  return <p>{block.original}</p>
}

/**
 * Single-language view of a pair. A missing translation falls back to the
 * other language and says so, rather than showing an empty paragraph.
 */
function SingleLanguageText({ pair, sourceLanguage, targetLanguage, headingLevel = 0, anchor }) {
  const picked = pickText(pair, sourceLanguage, targetLanguage)
  if (!picked.text) return null
  const Tag = headingLevel > 0 ? (headingLevel <= 2 ? 'h2' : 'h3') : 'p'
  const className = headingLevel > 0 ? 'pr-single-heading' : 'pr-single-paragraph'
  const isOriginal = targetLanguage === sourceLanguage && !headingLevel && pair.originalHtml
  if (!picked.fallback && isOriginal) {
    return <Tag className={`${className} pr-inline-math`} {...anchor} dangerouslySetInnerHTML={{ __html: pair.originalHtml }} />
  }
  if (!picked.fallback) {
    return <Tag className={className} {...anchor}>{picked.text}</Tag>
  }
  return (
    <div className="pr-missing" {...anchor}>
      <Tag className={className}>{picked.text}</Tag>
      <UntranslatedNote />
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
  const [days, setDays] = useState([])
  const [dayErrors, setDayErrors] = useState([])
  const [indexInfo, setIndexInfo] = useState(null)
  const [meta, setMeta] = useState({
    ready: false,
    demo: false,
    legacy: false,
    digestPath: null,
    directions: null,
    sources: null,
  })
  const [loadState, setLoadState] = useState('loading')
  const [loadError, setLoadError] = useState('')
  const [runStatus, setRunStatus] = useState(null)
  const [runStatusError, setRunStatusError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
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

  /** One JSON request, with the host's error message when it says no. */
  const fetchJson = useCallback(async (url) => {
    const response = await fetch(url, {
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
    return response.json()
  }, [])

  /** Fetch and normalize one stored day. */
  const fetchDay = useCallback(async (date) => {
    const data = await fetchJson(`${DIGEST_URL}/${date}`)
    // v1 (en/zh) and v2 (sourceLanguage + original/translation) both land in
    // one normalized shape, so the reading page never branches on version.
    const normalized = normalizeDigest(data)
    if (!normalized) throw new Error('数据格式无效')
    return normalized
  }, [fetchJson])

  /** Merge fetched days into the window; failures stay visible per day. */
  const applyResults = useCallback((results, { replace = false } = {}) => {
    const loaded = []
    const failures = []
    for (const result of results) {
      if (result.error) failures.push({ date: result.date, message: errorMessage(result.error) })
      else loaded.push(...result.value.days)
    }
    setDays(previous => {
      if (!replace) return mergeDays(previous, loaded)
      // A refresh replaces the window, but keeps the previous copy of a day
      // whose re-read failed, so a transient error never blanks the list.
      const touched = new Set(results.map(result => result.date))
      return mergeDays(previous.filter(day => touched.has(day.date)), loaded)
    })
    setDayErrors(previous => {
      const byDate = new Map(previous.map(entry => [entry.date, entry]))
      for (const failure of failures) byDate.set(failure.date, failure)
      for (const day of loaded) byDate.delete(day.date)
      return [...byDate.values()].sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : 0))
    })

    // Each stored day carries the run's source metadata (label and short
    // name). Keep it beside the items so Anthropic/Kimi are labelled by name
    // rather than by their id, whichever day introduced them.
    const declared = results.flatMap(result => (
      !result.error && Array.isArray(result.value?.sources) ? result.value.sources : []
    ))
    if (declared.length > 0) {
      setMeta((previous) => {
        const byId = new Map((previous.sources ?? []).map(source => [source.id, source]))
        for (const source of declared) {
          if (source && typeof source.id === 'string') byId.set(source.id, source)
        }
        return { ...previous, sources: [...byId.values()] }
      })
    }
    return loaded
  }, [])

  /**
   * Latest run status is advisory: a failure keeps the last readable digest on
   * screen and only adds a notice. It is never part of the page's error state.
   */
  const loadRunStatus = useCallback(async () => {
    try {
      const data = await fetchJson(STATUS_URL)
      const latest = data && typeof data === 'object' ? data.latest : null
      setRunStatus(latest && typeof latest === 'object' ? latest : null)
      setRunStatusError('')
    } catch (error) {
      setRunStatusError(errorMessage(error))
    }
  }, [fetchJson])

  /**
   * Boot: ask the index which days exist, load the newest seven, and fall back
   * to the legacy digest when this user has no day files yet. A refresh keeps
   * the current list on screen if it fails.
   */
  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true)
    else {
      setLoadState('loading')
      setLoadError('')
    }
    try {
      let indexData
      try {
        indexData = await fetchJson(INDEX_URL)
      } catch (error) {
        throw new Error(`索引读取失败：${errorMessage(error)}`)
      }
      // Start the advisory status request after the index request: it must not
      // delay or replace the readable digest, and the page checks it separately.
      void loadRunStatus()
      const indexed = Array.isArray(indexData?.days)
        ? indexData.days.filter(day => day && typeof day.date === 'string')
        : []
      if (indexed.length === 0) {
        const normalized = normalizeDigest(await fetchJson(DIGEST_URL))
        if (!normalized) throw new Error('数据格式无效')
        setIndexInfo(null)
        setMeta({
          ready: true,
          demo: normalized.demo === true,
          legacy: true,
          digestPath: normalized.digestPath ?? null,
          directions: Array.isArray(normalized.directions) ? normalized.directions : null,
          sources: Array.isArray(normalized.sources) ? normalized.sources : null,
        })
        setDays(normalized.days)
        setDayErrors([])
        setLoadState('ready')
        return
      }
      const history = indexed.slice(0, MAX_HISTORY_DAYS)
      setIndexInfo({ ...indexData, days: history })
      setMeta({
        ready: true,
        demo: indexData.demo === true,
        legacy: false,
        digestPath: indexData.indexPath ?? null,
        directions: null,
        sources: null,
      })
      const wanted = history.slice(0, PAGE_DAYS).map(day => day.date)
      const results = await Promise.all(wanted.map(date => fetchDay(date).then(
        value => ({ date, value }),
        error => ({ date, error }),
      )))
      applyResults(results, { replace: true })
      setLoadState('ready')
    } catch (error) {
      if (isRefresh && digestRef.current) {
        // Keep the readable list on screen; a refresh failure is a notice, not a page reset.
        showToast(`刷新失败：${errorMessage(error)}`)
      } else {
        setLoadError(errorMessage(error))
        setLoadState('error')
      }
    } finally {
      setRefreshing(false)
    }
  }, [applyResults, fetchDay, fetchJson, loadRunStatus, showToast])

  useEffect(() => { void load(false) }, [load])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)) } catch { /* storage may be unavailable */ }
  }, [prefs])

  /**
   * The page renders from loaded days plus the index metadata. Sources and
   * directions are derived from items when a day file does not carry the
   * document-level lists the sample does.
   */
  const digest = useMemo(() => {
    if (!meta.ready) return null
    const flat = flattenDigest({ days })
    const sourceMap = new Map()
    const directionIds = new Set()
    for (const item of flat) {
      if (typeof item.sourceId === 'string' && !sourceMap.has(item.sourceId)) {
        sourceMap.set(item.sourceId, {
          id: item.sourceId,
          label: item.sourceId,
          short: item.sourceId.slice(0, 1).toUpperCase(),
        })
      }
      if (typeof item.direction === 'string') directionIds.add(item.direction)
    }
    return {
      schemaVersion: 2,
      demo: meta.demo,
      legacy: meta.legacy,
      updatedAt: indexInfo?.updatedAt ?? null,
      digestPath: meta.digestPath,
      days,
      directions: meta.directions ?? [...directionIds].map(id => ({ id, label: id })),
      sources: meta.sources ?? [...sourceMap.values()],
    }
  }, [days, indexInfo, meta])

  useEffect(() => { digestRef.current = digest }, [digest])

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

  /** Dates the page has already fetched, including the ones that failed. */
  const attemptedDates = useMemo(() => new Set([
    ...days.map(day => day.date),
    ...dayErrors.map(entry => entry.date),
  ]), [days, dayErrors])
  const historyDays = useMemo(() => indexInfo?.days ?? [], [indexInfo])
  const remainingDays = useMemo(
    () => historyDays.filter(day => !attemptedDates.has(day.date)),
    [historyDays, attemptedDates],
  )

  /**
   * Sources the newest run skipped because its proxy was unavailable. The day
   * document carries the run summary, so no extra route is needed to explain a
   * missing source.
   */
  const proxyNotice = useMemo(() => {
    const newest = days[0]
    const sources = Array.isArray(newest?.run?.sources) ? newest.run.sources : []
    return {
      date: newest?.date ?? null,
      sources: sources.filter(source => source && source.status === 'skipped'),
    }
  }, [days])

  const runFailedSources = useMemo(() => issuesOf(runStatus, 'failedSources'), [runStatus])
  const runSkippedSources = useMemo(() => issuesOf(runStatus, 'skippedSources'), [runStatus])
  const runTranslation = runStatus?.translation ?? null

  const loadOlder = useCallback(async () => {
    if (loadingMore || remainingDays.length === 0) return
    const wanted = remainingDays.slice(0, PAGE_DAYS).map(day => day.date)
    setLoadingMore(true)
    try {
      const results = await Promise.all(wanted.map(date => fetchDay(date).then(
        value => ({ date, value }),
        error => ({ date, error }),
      )))
      applyResults(results)
    } finally {
      setLoadingMore(false)
    }
  }, [applyResults, fetchDay, loadingMore, remainingDays])

  const retryDay = useCallback(async (date) => {
    const result = await fetchDay(date).then(
      value => ({ date, value }),
      error => ({ date, error }),
    )
    applyResults([result])
  }, [applyResults, fetchDay])

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
  const activeLanguage = sourceLanguageOf(activeItem)
  const translationLanguage = otherLanguage(activeLanguage)
  const targetLanguage = targetLanguageOf(prefs.mode)
  const zhTitle = activeItem ? pickText(activeItem.title, activeLanguage, 'zh') : { text: null, fallback: false }
  const enTitle = activeItem ? pickText(activeItem.title, activeLanguage, 'en') : { text: null, fallback: false }
  const summaryPick = activeItem ? pickText(activeItem.summary, activeLanguage, targetLanguage) : { text: null, fallback: false }
  const normalizedQuery = query.trim().toLowerCase()

  /**
   * Source is a third facet beside search/favorites and direction. The pool
   * after search/favorites feeds the source chip counts; the pool after the
   * source choice feeds the direction counts, so neither chip row claims items
   * the other facet already hid.
   */
  const base = useMemo(() => applyBaseFilters(items, {
    query: normalizedQuery,
    bookmarksOnly: prefs.bookmarksOnly,
    bookmarks: prefs.bookmarks,
    source: prefs.source,
  }), [items, normalizedQuery, prefs.bookmarksOnly, prefs.bookmarks, prefs.source])
  const sourceCounts = useMemo(() => countBy(base.searched, 'sourceId'), [base.searched])
  const counts = useMemo(() => countBy(base.visible, 'direction'), [base.visible])

  const visibleItems = useMemo(
    () => base.visible.filter(item => prefs.direction === 'all' || item.direction === prefs.direction),
    [base.visible, prefs.direction],
  )

  /** Source chips: declared order, only sources that contribute items today. */
  const sourceChoices = useMemo(() => {
    const present = new Set(items.map(item => item.sourceId).filter(Boolean))
    const declared = (Array.isArray(digest?.sources) ? digest.sources : [])
      .filter(source => source && typeof source.id === 'string' && present.has(source.id))
    const known = new Set(declared.map(source => source.id))
    const extra = [...present]
      .filter(id => !known.has(id))
      .map(id => ({ id, label: id, short: id.slice(0, 1).toUpperCase() }))
    return [{ id: 'all', label: '全部来源' }, ...declared, ...extra]
  }, [digest, items])

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
    const language = sourceLanguageOf(activeItem)
    const target = targetLanguageOf(prefs.mode)
    const out = []
    activeItem.blocks.forEach((block, index) => {
      if (block && block.type === 'heading') {
        const label = pickText(block, language, target).text
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
    update({ direction: 'all', source: 'all', bookmarksOnly: false })
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
          <span>正在读取最近 7 天…</span>
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
            数据来自 <code>$DSH_HOME/paper-reader/index.json</code> 与{' '}
            <code>digest/YYYY-MM-DD.json</code>；没有索引时回退到 <code>digest.json</code> 或内置示例。
          </p>
          <button className="pr-primary-btn" onClick={() => void load(false)}>重试</button>
        </div>
      </div>
    )
  }

  if (items.length === 0 && !digest?.demo && dayErrors.length === 0 && !runStatus && !runStatusError) {
    return (
      <div className="pr-root">
        <div className="pr-empty">
          <span className="pr-empty-mark"><IconBook /></span>
          <div className="pr-empty-title">还没有抓取数据</div>
          <p className="pr-empty-text">
            每日抓取运行后，按天 digest 会写入 <code>$DSH_HOME/paper-reader/digest/</code>，这里会自动出现最近 7 天。
          </p>
          <button className="pr-primary-btn" onClick={() => void load(false)}>重新读取</button>
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
          {digest.demo && <span className="pr-demo" title="当前为内置示例数据；agent 写入按天 digest 后自动切换">示例数据</span>}
        </div>

        <div className="pr-status">
          <span className="pr-status-dot" />
          <span className="pr-status-text">
            {historyDays.length > 0
              ? `每日 09:00 抓取 · 已加载 ${days.length}/${historyDays.length} 天 · ${items.length} 篇 · ${unreadCount} 未读`
              : `每日 09:00 抓取 · ${items.length} 篇 · ${unreadCount} 未读`}
          </span>
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

      {runStatus && (
        <div
          className={runStatus.status === 'failed' ? 'pr-run-status is-failed' : 'pr-run-status'}
          role="status"
        >
          <div className="pr-run-status-main">
            <span className="pr-run-status-title">最近一次运行</span>
            <span className={`pr-run-status-badge pr-run-status-${runStatus.status ?? 'unknown'}`}>
              {RUN_STATUS_LABELS[runStatus.status] ?? runStatus.status ?? '未知'}
            </span>
            <span className="pr-run-status-meta">
              {runStatus.date ?? ''} {clockTime(runStatus.finishedAt ?? runStatus.startedAt)}
            </span>
            <span className="pr-dot">·</span>
            <span>{runStatus.items ?? 0} 篇</span>
            <span className="pr-dot">·</span>
            <span>耗时 {formatDuration(runStatus.durationMs)}</span>
            {runTranslation && (
              <>
                <span className="pr-dot">·</span>
                <span className="pr-run-status-token">
                  翻译 {runTranslation.tokensUsed ?? '—'} / {runTranslation.tokenBudget ?? '—'} tokens
                </span>
                {runTranslation.pendingItems > 0 && (
                  <span className="pr-run-status-token">{runTranslation.pendingItems} 篇待翻译</span>
                )}
                {runTranslation.budgetExceeded && (
                  <span className="pr-run-status-token is-warn">已达每日预算</span>
                )}
              </>
            )}
          </div>

          {runFailedSources.length > 0 && (
            <div className="pr-run-status-line pr-run-status-failed">
              <span className="pr-run-status-label">失败</span>
              {runFailedSources.map((source, index) => (
                <span key={`failed-${source.id ?? index}`}>
                  {index > 0 ? '、' : ''}
                  <RunSourceIssue source={source} />
                </span>
              ))}
            </div>
          )}

          {runSkippedSources.length > 0 && (
            <div className="pr-run-status-line pr-run-status-skipped">
              <span className="pr-run-status-label">跳过</span>
              {runSkippedSources.map((source, index) => (
                <span key={`skipped-${source.id ?? index}`}>
                  {index > 0 ? '、' : ''}
                  <RunSourceIssue source={source} />
                </span>
              ))}
            </div>
          )}

          {runStatus.status === 'failed' && (
            <div className="pr-run-status-line pr-run-status-fallback">
              这次运行没有写入 digest，继续显示上一份可读内容。
            </div>
          )}
        </div>
      )}

      {runStatusError && (
        <div className="pr-run-status-error" role="status">
          运行状态读取失败：{runStatusError}（仍显示已加载的 digest）
        </div>
      )}

      {proxyNotice.sources.length > 0 && (
        <div className="pr-proxy-notice" role="status">
          <span className="pr-proxy-notice-dot" aria-hidden="true" />
          <span className="pr-proxy-notice-text">
            <strong>{proxyNotice.date === localDate() ? '今日' : proxyNotice.date}</strong>
            因代理不可用跳过：
            {proxyNotice.sources.map((source, index) => (
              <span key={source.id ?? index}>
                {index > 0 ? '、' : ''}
                {source.label ?? source.id}
                {source.reason ? `（${source.reason}）` : ''}
              </span>
            ))}
          </span>
        </div>
      )}

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

            <div className="pr-filters pr-source-filters" role="toolbar" aria-label="按来源筛选">
              {sourceChoices.map(source => (
                <button
                  type="button"
                  key={source.id}
                  data-source-filter={source.id}
                  className={prefs.source === source.id ? 'pr-chip is-active' : 'pr-chip'}
                  onClick={() => update({ source: source.id })}
                  aria-pressed={prefs.source === source.id}
                  title={source.label}
                >
                  {source.label}
                  <span className="pr-chip-count">{sourceCounts.get(source.id) ?? 0}</span>
                </button>
              ))}
            </div>

            {(normalizedQuery || prefs.direction !== 'all' || prefs.source !== 'all' || prefs.bookmarksOnly) && (
              <div className="pr-result-line">
                <span>{visibleItems.length} 篇匹配</span>
                <button type="button" className="pr-link-btn" onClick={clearFilters}>清除筛选</button>
              </div>
            )}
          </div>

          <div className="pr-feed" role="listbox" aria-label="论文列表">
            {groups.length === 0 && items.length > 0 && (
              <div className="pr-feed-empty">
                <p>没有匹配的论文</p>
                <button type="button" className="pr-link-btn" onClick={clearFilters}>清除搜索与筛选</button>
              </div>
            )}

            {groups.map(group => {
              const expanded = normalizedQuery || prefs.direction !== 'all' || prefs.source !== 'all' || prefs.bookmarksOnly
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
                        const itemLanguage = sourceLanguageOf(item)
                        const itemTitleZh = pickText(item.title, itemLanguage, 'zh')
                        const itemTitleEn = pickText(item.title, itemLanguage, 'en')
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
                              {item.excerpt && <span className="pr-pill pr-pill-excerpt">节选</span>}
                              {item.translationState !== 'complete' && <span className="pr-pill">翻译中</span>}
                              {bookmarked && <span className="pr-item-mark" title="已收藏">★</span>}
                              {!read && <UnreadDot />}
                            </div>
                            <div className="pr-item-title-zh">{itemTitleZh.text}</div>
                            <div className="pr-item-title-en">{itemTitleEn.text}</div>
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

            {dayErrors.map(error => (
              <div className="pr-day-error" key={`error-${error.date}`}>
                <div className="pr-day-error-body">
                  <span className="pr-day-error-date">{error.date}</span>
                  <span className="pr-day-error-msg">{error.message}</span>
                </div>
                <button type="button" className="pr-link-btn pr-day-retry" onClick={() => void retryDay(error.date)}>
                  重试
                </button>
              </div>
            ))}

            {remainingDays.length > 0 && (
              <button
                type="button"
                className="pr-history-more"
                onClick={() => void loadOlder()}
                disabled={loadingMore}
              >
                {loadingMore ? '加载中…' : `加载更早（还有 ${remainingDays.length} 天）`}
              </button>
            )}
          </div>

          <div className="pr-sidebar-foot">
            <span>每日 09:00 由 agent 抓取 · 已去重</span>
            <button type="button" className="pr-link-btn" onClick={() => showToast(digest.demo ? '当前是内置示例；agent 写入按天 digest 后自动切换。' : `数据文件：${digest.digestPath ?? '$DSH_HOME/paper-reader/index.json'}`)}>
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
                    <span className="pr-chip-inline" data-source-language={activeLanguage}>
                      {activeLanguage === 'zh' ? '中文原文' : '英文原文'}
                    </span>
                  </div>

                  {activeItem.excerpt && activeItem.excerptReason && (
                    <div className="pr-excerpt-notice" role="note">
                      <span className="pr-excerpt-mark">节选</span>
                      <span className="pr-excerpt-text">
                        {activeItem.excerptReason.message}
                        {activeItem.excerptReason.detail && (
                          <span className="pr-excerpt-detail">（{activeItem.excerptReason.detail}）</span>
                        )}
                      </span>
                    </div>
                  )}

                  {prefs.mode !== 'en' && zhTitle.text && (
                    <h1 className="pr-title-zh">
                      {zhTitle.text}
                      {zhTitle.fallback && <span className="pr-title-flag">未翻译</span>}
                    </h1>
                  )}
                  {prefs.mode !== 'zh' && enTitle.text && enTitle.text !== zhTitle.text && (
                    <p className={prefs.mode === 'en' ? 'pr-title-en pr-title-en-hero' : 'pr-title-en'}>
                      {enTitle.text}
                      {enTitle.fallback && <span className="pr-title-flag">未翻译</span>}
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

                  {summaryPick.text && (
                    <div className="pr-summary">
                      <span className="pr-summary-label">{prefs.mode === 'en' ? 'Summary' : '导读'}</span>
                      <p>{summaryPick.text}</p>
                      {summaryPick.fallback && <UntranslatedNote />}
                    </div>
                  )}

                  {activeItem.translationState !== 'complete' && (
                    <div className="pr-notice">
                      <span>
                        翻译进行中 · {activeItem.translation.done ?? '—'}/{activeItem.translation.total ?? '—'} 段
                      </span>
                      <button type="button" className="pr-link-btn" onClick={retryTranslation}>重试</button>
                    </div>
                  )}

                  {digest.demo && (
                    <div className="pr-demo-note">
                      当前显示内置示例。agent 写入 <code>$DSH_HOME/paper-reader/digest/YYYY-MM-DD.json</code> 后，这里会自动换成真实抓取结果。
                    </div>
                  )}
                </header>

                <div className="pr-body" data-mode={prefs.mode} data-source-language={activeLanguage}>
                  {prefs.mode === 'both' && (
                    <div className="pr-legend" aria-hidden="true">
                      <span>原文 · {languageLabel(activeLanguage)}</span>
                      <span>译文 · {languageLabel(translationLanguage)}</span>
                    </div>
                  )}

                  {activeItem.blocks.map((block, index) => {
                    if (!block || typeof block !== 'object') return null
                    const anchor = { 'data-block': index, 'data-block-type': block.type, id: `pr-b-${index}` }
                    const originalColumn = `pr-col pr-col-${activeLanguage} pr-col-original`
                    const translationColumn = `pr-col pr-col-${translationLanguage} pr-col-translation`

                    if (block.type === 'heading') {
                      const level = Number(block.level) || 1
                      const HeadingTag = level <= 2 ? 'h2' : 'h3'
                      if (prefs.mode === 'both') {
                        return (
                          <div className="pr-pair pr-pair-heading" key={index} {...anchor}>
                            <div className={originalColumn} data-column="original" data-lang={activeLanguage}>
                              <HeadingTag>{block.original}</HeadingTag>
                            </div>
                            <div className={translationColumn} data-column="translation" data-lang={translationLanguage}>
                              {block.translation ? <HeadingTag>{block.translation}</HeadingTag> : <PendingParagraph />}
                            </div>
                          </div>
                        )
                      }
                      return (
                        <SingleLanguageText
                          key={index}
                          pair={block}
                          sourceLanguage={activeLanguage}
                          targetLanguage={targetLanguage}
                          headingLevel={level}
                          anchor={anchor}
                        />
                      )
                    }

                    if (block.type === 'paragraph') {
                      if (prefs.mode === 'both') {
                        return (
                          <div className="pr-pair" key={index} {...anchor}>
                            <div className={originalColumn} data-column="original" data-lang={activeLanguage}>
                              <OriginalText block={block} />
                            </div>
                            <div className={translationColumn} data-column="translation" data-lang={translationLanguage}>
                              <TranslatedText block={block} />
                            </div>
                          </div>
                        )
                      }
                      return (
                        <SingleLanguageText
                          key={index}
                          pair={block}
                          sourceLanguage={activeLanguage}
                          targetLanguage={targetLanguage}
                          anchor={anchor}
                        />
                      )
                    }

                    if (block.type === 'equation') {
                      const notePick = pickText(block.note, activeLanguage, targetLanguage)
                      return (
                        <figure className="pr-equation" key={index} {...anchor}>
                          <div className="pr-eq-line">
                            {block.mathml
                              ? <span className="pr-eq-display pr-eq-math" dangerouslySetInnerHTML={{ __html: block.mathml }} />
                              : <span className="pr-eq-display">{renderMath(block.display)}</span>}
                            {block.label && <span className="pr-eq-label">{block.label}</span>}
                          </div>
                          {block.detail && <div className="pr-eq-detail">{renderMath(block.detail)}</div>}
                          {block.note && prefs.mode === 'both' && (
                            <figcaption className="pr-eq-note">
                              {block.note.original && <span>{block.note.original}</span>}
                              {block.note.translation && <span className="pr-eq-note-en">{block.note.translation}</span>}
                            </figcaption>
                          )}
                          {block.note && prefs.mode !== 'both' && notePick.text && (
                            <figcaption className="pr-eq-note">
                              <span>{notePick.text}</span>
                              {notePick.fallback && <UntranslatedNote />}
                            </figcaption>
                          )}
                        </figure>
                      )
                    }

                    if (block.type === 'figure') {
                      const steps = Array.isArray(block.diagram?.steps) ? block.diagram.steps : []
                      const captionPick = pickText(block.caption, activeLanguage, targetLanguage)
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
                          {block.image && (
                            <img className="pr-figure-image" src={block.image} alt={block.diagram?.title ?? ''} />
                          )}
                          {block.svg && (
                            <div className="pr-figure-svg" dangerouslySetInnerHTML={{ __html: block.svg }} />
                          )}
                          {block.caption && prefs.mode === 'both' && (
                            <figcaption className="pr-figure-caption">
                              {block.caption.original && <span>{block.caption.original}</span>}
                              {block.caption.translation && (
                                <span className="pr-figure-caption-en">{block.caption.translation}</span>
                              )}
                            </figcaption>
                          )}
                          {block.caption && prefs.mode !== 'both' && captionPick.text && (
                            <figcaption className="pr-figure-caption">
                              <span>{captionPick.text}</span>
                              {captionPick.fallback && <UntranslatedNote />}
                            </figcaption>
                          )}
                        </figure>
                      )
                    }

                    if (block.type === 'table') {
                      const tableCaption = block.caption
                        ? (prefs.mode === 'both'
                            ? block.caption
                            : pickText(block.caption, activeLanguage, targetLanguage))
                        : null
                      return (
                        <figure className="pr-table" key={index} {...anchor}>
                          <div className="pr-table-scroll">
                            <table>
                              {block.header.length > 0 && (
                                <thead>
                                  <tr>{block.header.map((cell, cellIndex) => <th key={cellIndex}>{cell}</th>)}</tr>
                                </thead>
                              )}
                              <tbody>
                                {block.rows.map((row, rowIndex) => (
                                  <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {tableCaption && (tableCaption.original || tableCaption.text) && (
                            <figcaption className="pr-figure-caption">
                              {prefs.mode === 'both'
                                ? <><span>{tableCaption.original}</span>{tableCaption.translation && <span className="pr-figure-caption-en">{tableCaption.translation}</span>}</>
                                : <><span>{tableCaption.text}</span>{tableCaption.fallback && <UntranslatedNote />}</>}
                            </figcaption>
                          )}
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
