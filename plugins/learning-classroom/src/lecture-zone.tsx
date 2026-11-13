import { useEffect, useMemo, useRef, useState, type UIEvent as ReactUIEvent } from 'react'
import { AnnotationAction } from './annotation-action.tsx'
import type { AnnotationSourceInput } from './annotation-flow.ts'
import { ClassroomClientError, type ClassroomClient } from './classroom-client.ts'
import type {
  ClassroomSpaceView,
  LectureCandidatesView,
  LectureListView,
  LectureReadView,
  ReadingPositionView,
  TopicView,
} from './contract.ts'
import { buildExperimentSrcdoc } from './experiment-runtime.ts'
import type { ExperimentSpec } from './experiment-spec.ts'
import { ContinuityZone } from './continuity-zone.tsx'
import { groupCourseLectures, resolveLectureHref } from './lectures.ts'
import { scrollToFragment, type LinkFragment } from './fragments.ts'
import { parseMarkdown } from './markdown.ts'
import { markdownMathStyles, MarkdownBlocks, selectionTextWithMath, type MathRenderer } from './markdown-view.tsx'
import { excerptForQuestion, type AskTeacher } from './question-context.ts'

export interface LectureZoneProps {
  client: ClassroomClient
  space: ClassroomSpaceView
  spaces: ClassroomSpaceView[]
  currentSpaceId: string | null
  busy: boolean
  onOpenSpace: (spaceId: string) => void
  /** Ask the reader to open a specific lecture, e.g. from a canvas file node. */
  openRequest?: LectureOpenRequest | null
  /** Append a selection from this lecture to the current note (real source link). */
  onAnnotate?: (request: AnnotationSourceInput) => Promise<{ ok: boolean; message: string }>
  /** Adds the selected passage or the current lecture to the native teacher draft. */
  askTeacher?: AskTeacher
  /** Inject a math renderer (tests or an alternate host); production uses KaTeX. */
  mathRenderer?: MathRenderer
  /** Debounce before a scroll offset is written as navigation state; tests shorten it. */
  positionDebounceMs?: number
}

/** One-shot request to open a lecture; a new token re-opens the same path. */
export interface LectureOpenRequest {
  path: string
  token: number
  /** Real heading/block fragment resolved from a wikilink, if any. */
  heading?: string | null
  blockId?: string | null
}

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; list: LectureListView }
  | { status: 'failed'; message: string }

type ReaderState =
  | { status: 'idle' }
  | { status: 'loading'; path: string }
  | { status: 'ready'; doc: LectureReadView; fragment?: (LinkFragment & { token: number }) }
  | { status: 'failed'; path: string; message: string }

/** Unsaved goal text, kept per learning space so a view switch cannot lose it. */
interface GoalDraft {
  text: string
  editing: boolean
  /** Bumped on every local edit; a save only clears the draft it submitted. */
  revision: number
}

const lectureStyles = `
.lc-lecture-head{display:flex;flex-direction:column;gap:2px}
.lc-lecture-head h3{margin:0;font-size:16px}
.lc-lecture-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.lc-lecture-actions button{padding:4px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer;font-size:12px}
.lc-lecture-actions button:disabled{opacity:.5;cursor:default}
.lc-lecture-actions p{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-lecture-path{margin:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:var(--dsh-text-secondary,#59636e);word-break:break-all}
.lc-directory-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.lc-directory-head h3{margin:0;font-size:13px}
.lc-goal-form{display:flex;flex-direction:column;gap:6px;min-width:0}
.lc-goal-form textarea{box-sizing:border-box;display:block;flex:none;width:100%;min-height:72px;max-height:200px;padding:6px 8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;font:inherit;line-height:1.5;resize:vertical}
.lc-goal-actions{display:flex;flex-wrap:wrap;gap:6px}
.lc-lecture-refresh{padding:2px 8px;font-size:12px}
.lc-lecture-doc{display:flex;flex-direction:column;gap:10px;line-height:1.75;font-size:14px}
.lc-lecture-doc h3,.lc-lecture-doc h4,.lc-lecture-doc h5,.lc-lecture-doc h6{margin:8px 0 0;line-height:1.4}
.lc-lecture-doc p,.lc-lecture-doc .lc-md-p,.lc-lecture-doc ul,.lc-lecture-doc ol,.lc-lecture-doc blockquote,.lc-lecture-doc pre,.lc-lecture-doc table{margin:0}
.lc-lecture-doc ul,.lc-lecture-doc ol{padding-left:22px}
.lc-lecture-doc blockquote{padding:4px 12px;border-left:3px solid var(--dsh-border,#d8dee4);color:var(--dsh-text-secondary,#59636e)}
.lc-lecture-doc pre{padding:10px 12px;border-radius:6px;background:#f6f8fa;overflow:auto}
.lc-lecture-doc code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}
.lc-lecture-doc :not(pre) > code{padding:1px 4px;border-radius:4px;background:#f6f8fa}
.lc-lecture-table{overflow:auto}
.lc-lecture-doc table{border-collapse:collapse;font-size:13px}
.lc-lecture-doc th,.lc-lecture-doc td{padding:6px 10px;border:1px solid var(--dsh-border,#d8dee4);text-align:left}
.lc-lecture-doc th{background:#f6f8fa}
.lc-lecture-doc hr{width:100%;border:0;border-top:1px solid var(--dsh-border,#d8dee4)}
.lc-lecture-experiment{display:flex;flex-direction:column;gap:10px}
.lc-experiment-frame{box-sizing:border-box;width:100%;height:min(70vh,720px);min-height:480px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:#fff}
.lc-experiment-note{margin:0;padding:8px 10px;border-radius:6px;background:#f6f8fa;color:var(--dsh-text-secondary,#59636e);font-size:12px;line-height:1.6}
.lc-experiment-meta{display:flex;flex-direction:column;gap:4px;font-size:12px}
.lc-experiment-meta ul{margin:0;padding-left:20px}
.lc-experiment-meta code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
.lc-lecture-empty{padding:24px;border:1px dashed var(--dsh-border,#d8dee4);border-radius:8px;text-align:center}
${markdownMathStyles}
`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '讲义操作失败。'
}

function isMissing(error: unknown): boolean {
  return error instanceof ClassroomClientError && error.code === 'lecture-missing'
}

function missingNotice(path: string): string {
  return `讲义「${path}」已被删除或改名。请重新加载目录，或从左侧选择另一节。`
}

function MarkdownBody({
  content,
  onOpenHref,
  mathRenderer,
}: {
  content: string
  onOpenHref?: (href: string) => boolean
  mathRenderer?: MathRenderer
}) {
  const blocks = parseMarkdown(content)
  if (blocks.length === 0) return <p className="lc-hint">这一节还没有正文。</p>
  return (
    <article className="lc-lecture-doc">
      <MarkdownBlocks
        blocks={blocks}
        tableClassName="lc-lecture-table"
        onOpenHref={onOpenHref}
        mathRenderer={mathRenderer}
      />
    </article>
  )
}

/**
 * The experiment is a declarative spec, never model HTML/JS. The iframe document
 * is built from a fixed trusted runtime source; only the escaped JSON spec is
 * injected. The frame has no same-origin permission and no external data channel.
 */
function ExperimentFrame({ spec }: { spec: ExperimentSpec }) {
  const srcdoc = useMemo(() => buildExperimentSrcdoc(spec), [spec])
  return (
    <div className="lc-lecture-experiment" aria-label="动态实验">
      <p className="lc-experiment-note" role="note">
        实验由固定可信 runtime 渲染声明式参数与图形，不执行模型 HTML/JS；iframe 仅允许内联脚本、无同源权限，也不接收外部消息或联网。
      </p>
      <iframe
        className="lc-experiment-frame"
        title={`动态实验：${spec.title}`}
        sandbox="allow-scripts"
        allow=""
        referrerPolicy="no-referrer"
        srcDoc={srcdoc}
      />
      {(spec.parameters.length > 0 || spec.sources.length > 0) && (
        <div className="lc-experiment-meta">
          {spec.parameters.length > 0 && (
            <section aria-label="实验参数">
              <strong>实验参数</strong>
              <ul>
                {spec.parameters.map(parameter => (
                  <li key={parameter.name}>
                    <code>{parameter.name}</code> {parameter.label}：{parameter.min}–{parameter.max}
                    {parameter.unit === '' ? '' : ` ${parameter.unit}`}，步长 {parameter.step}，默认 {parameter.default}
                    {parameter.unit === '' ? '' : ` ${parameter.unit}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {spec.sources.length > 0 && (
            <section aria-label="实验来源">
              <strong>来源</strong>
              <ul>{spec.sources.map((source, index) => <li key={index}>{source}</li>)}</ul>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

/** Legacy arbitrary HTML/script experiments are never rendered. */
function ExperimentUnsupported({ doc }: { doc: LectureReadView }) {
  return (
    <div className="lc-lecture-experiment" role="alert">
      <p>{doc.experimentError ?? '这个动态实验无法读取，未执行。'}</p>
      <p className="lc-lecture-path">{doc.path}</p>
      <p className="lc-hint">
        旧式任意 HTML/脚本实验不会在本版本运行；原文件保留在原位置。请让老师重新生成声明式实验（参数、读数、折线/柱状图）。
      </p>
    </div>
  )
}

/**
 * Classify the learner's current selection against the rendered lecture body.
 *
 * A selection only counts as a lecture excerpt when the whole range lives inside
 * the body. Anchor-only checks are not enough: dragging from a lecture paragraph
 * into the notes or the conversation keeps the anchor inside the lecture while
 * the selection text carries unrelated content. `outside` is distinct from
 * `none` so a real-but-invalid selection never silently falls back to the whole
 * lecture.
 */
type LectureSelection = { kind: 'none' } | { kind: 'inside'; text: string } | { kind: 'outside' }

function lectureSelection(root: HTMLElement | null): LectureSelection {
  if (root === null) return { kind: 'none' }
  const selection = typeof window === 'undefined' ? null : window.getSelection?.() ?? null
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return { kind: 'none' }
  // One bounded range is required: multi-range selections cannot be proven to
  // stay inside the lecture body.
  if (selection.rangeCount !== 1) return { kind: 'outside' }
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return { kind: 'outside' }
  // Restore formulas to their Markdown source instead of KaTeX's two DOM arms.
  const text = selectionTextWithMath(range).trim()
  if (text === '') return { kind: 'none' }
  return { kind: 'inside', text }
}

function LectureReader(props: {
  doc: LectureReadView
  space: ClassroomSpaceView
  askTeacher?: AskTeacher
  onOpenHref?: (href: string) => boolean
  mathRenderer?: MathRenderer
  /** Present only when this experiment was opened from a lecture. */
  returnTarget?: { title: string } | null
  onReturn?: () => void
  onAnnotate?: (request: AnnotationSourceInput) => Promise<{ ok: boolean; message: string }>
  fragment?: (LinkFragment & { token: number }) | null
}) {
  const { doc, space, askTeacher, onOpenHref, returnTarget, onReturn, onAnnotate, fragment, mathRenderer } = props
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const [notice, setNotice] = useState('')
  const [askError, setAskError] = useState('')
  const [fragmentNotice, setFragmentNotice] = useState('')
  const askBusy = useRef(false)

  // A wikilink fragment must land on the real heading/block in the rendered
  // lecture. Opening the file without locating it is reported, not hidden.
  useEffect(() => {
    if (fragment === undefined || fragment === null) return
    if (scrollToFragment(bodyRef.current, fragment)) {
      setFragmentNotice('')
      return
    }
    const where = fragment.heading !== null && fragment.heading !== undefined
      ? `标题「${fragment.heading}」`
      : `块 ^${fragment.blockId ?? ''}`
    setFragmentNotice(`已打开讲义，但没有找到${where}；不会伪造锚点位置。`)
  }, [fragment])

  const ask = async (): Promise<void> => {
    if (askTeacher === undefined || askTeacher.available === false || askBusy.current) return
    const selection = lectureSelection(bodyRef.current)
    if (selection.kind === 'outside') {
      setNotice('')
      setAskError('选中的内容不在讲义正文内（可能跨到了目录、笔记或对话）；请只在讲义正文里重新选择要问的段落。')
      return
    }
    const selected = selection.kind === 'inside' ? selection.text : ''
    const source = selected !== '' ? selected : doc.kind === 'markdown' ? doc.content ?? '' : ''
    if (source.trim() === '') {
      setNotice('')
      setAskError('这一节没有可附加的正文；动态实验本身不会作为提问材料。')
      return
    }
    const bounded = excerptForQuestion(source)
    askBusy.current = true
    try {
      const result = await askTeacher.ask({
        kind: selected !== '' ? 'lecture-selection' : 'lecture',
        spaceTitle: space.title,
        title: doc.title,
        path: doc.path,
        version: doc.version,
        unsaved: false,
        excerpt: bounded.text,
        truncated: bounded.truncated,
      })
      if (result.ok) {
        setAskError('')
        setNotice('已追加到老师输入框，未发送。')
      } else {
        setNotice('')
        setAskError(result.reason)
      }
    } finally {
      askBusy.current = false
    }
  }

  return (
    <>
      <div className="lc-lecture-head">
        <h3>{doc.title}</h3>
        <p className="lc-lecture-path">{doc.path}</p>
        {askTeacher !== undefined && (
          <div className="lc-lecture-actions" aria-label="讲义提问">            <button
              type="button"
              className="lc-secondary"
              disabled={askTeacher.available === false}
              title={askTeacher.available ? '选中文字后只附选段；未选中则附当前讲义的摘录' : askTeacher.reason}
              onClick={() => { void ask() }}
            >
              问老师
            </button>
            <p>选中文字后只附选段；未选中则附当前讲义摘录。不会自动发送。</p>
            {askTeacher.available === false && <p role="status">{askTeacher.reason}</p>}
            {notice !== '' && <p role="status">{notice}</p>}
            {askError !== '' && <p role="alert">{askError}</p>}
          </div>
        )}
        {returnTarget != null && onReturn !== undefined && (
          <div className="lc-lecture-actions" aria-label="实验返回">
            <button type="button" className="lc-secondary" onClick={onReturn}>
              返回讲义《{returnTarget.title}》
            </button>
            <p>回到打开实验前的讲义与阅读位置。</p>
          </div>
        )}
        {fragmentNotice !== '' && <p className="lc-hint" role="alert">{fragmentNotice}</p>}
      </div>
      <AnnotationAction doc={doc} onAnnotate={onAnnotate}>
        <div ref={bodyRef}>
          {doc.kind === 'markdown'
            ? <MarkdownBody content={doc.content ?? ''} onOpenHref={onOpenHref} mathRenderer={mathRenderer} />
            : doc.experiment !== null
              ? <ExperimentFrame spec={doc.experiment} />
              : <ExperimentUnsupported doc={doc} />}
        </div>
      </AnnotationAction>
    </>
  )
}

/**
 * Course directory plus lecture reader. The directory is derived from the
 * space's `讲义/` folder on the Host side; the reader renders a typed block model
 * with React elements, so lecture HTML never reaches the DOM.
 */
export function LectureZone(props: LectureZoneProps) {
  const { client, space, spaces, currentSpaceId, busy, onOpenSpace, positionDebounceMs = 500 } = props
  const spaceId = space.id
  const canTopic = typeof client.readTopic === 'function' && typeof client.saveTopicGoal === 'function'
  const canLink = typeof client.listLectureCandidates === 'function'
    && typeof client.linkLecture === 'function'
    && typeof client.unlinkLecture === 'function'
  const [reloadKey, setReloadKey] = useState(0)
  const [listState, setListState] = useState<ListState>({ status: 'loading' })
  const [reader, setReader] = useState<ReaderState>({ status: 'idle' })
  const [selected, setSelected] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [topic, setTopic] = useState<TopicView | null>(null)
  const [topicError, setTopicError] = useState('')
  // Goal drafts, errors and notices are keyed by space: switching a view or
  // refreshing must never silently drop text the learner is still writing.
  const [drafts, setDrafts] = useState<Record<string, GoalDraft>>({})
  const [goalErrors, setGoalErrors] = useState<Record<string, string>>({})
  const [goalNotices, setGoalNotices] = useState<Record<string, string>>({})
  // Request ownership is per space: a pending save/reload for topic A must not
  // be treated as this topic's busy state, and a late A response must not clear
  // a newer request owned by another topic.
  const [savingRequests, setSavingRequests] = useState<Record<string, number>>({})
  const [reloadingRequests, setReloadingRequests] = useState<Record<string, number>>({})
  const [candidatePanel, setCandidatePanel] = useState(false)
  const [candidates, setCandidates] = useState<LectureCandidatesView | null>(null)
  const [candidatesLoading, setCandidatesLoading] = useState(false)
  const [candidatesError, setCandidatesError] = useState('')
  const [linking, setLinking] = useState<string | null>(null)
  const [linkError, setLinkError] = useState('')
  /** The lecture an experiment was opened from, including its scroll position. */
  const [returnTo, setReturnTo] = useState<{ path: string; title: string; scrollTop: number } | null>(null)
  const paneRef = useRef<HTMLElement | null>(null)
  const pendingScroll = useRef<number | null>(null)
  // Positions saved by this reader, keyed by space: a late response for the
  // previous theme can update only that theme's entry. The latest saved value is
  // newer than the space prop until the whole view is re-read, so it also drives
  // the continuity card and the restore action immediately.
  const [positions, setPositions] = useState<Record<string, ReadingPositionView>>({})
  const effectivePosition = positions[spaceId] ?? space.readingPosition ?? { path: null, scrollTop: 0 }
  const readingPositionRef = useRef(effectivePosition)
  readingPositionRef.current = effectivePosition
  const positionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedPosition = useRef('')
  // Per-space request sequence: two debounced writes can resolve out of order,
  // and an older response must not move the card/restore offset backwards.
  const positionSeq = useRef<Record<string, number>>({})
  const positionApplied = useRef<Record<string, number>>({})
  const alive = useRef(true)
  const generation = useRef(0)
  const handledRequest = useRef<number | null>(null)
  const draftsRef = useRef<Record<string, GoalDraft>>({})
  const currentSpaceIdRef = useRef(spaceId)
  // Per-space read tokens: a save for A only invalidates A's in-flight read.
  const topicLoadTokens = useRef<Record<string, number>>({})
  const requestSeq = useRef(0)
  const draftRevisionSeq = useRef(0)
  currentSpaceIdRef.current = spaceId

  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  const draft = drafts[spaceId]
  const goalEditing = draft?.editing ?? false
  const goalDraft = draft?.text ?? topic?.goal ?? ''
  const goalError = goalErrors[spaceId] ?? ''
  const goalNotice = goalNotices[spaceId] ?? ''
  const goalSaving = savingRequests[spaceId] !== undefined
  const goalReloading = reloadingRequests[spaceId] !== undefined
  const goalBusy = goalSaving || goalReloading

  const nextDraftRevision = () => {
    draftRevisionSeq.current += 1
    return draftRevisionSeq.current
  }

  const beginRequest = (kind: 'save' | 'reload', id: string): number => {
    requestSeq.current += 1
    const requestId = requestSeq.current
    const setter = kind === 'save' ? setSavingRequests : setReloadingRequests
    setter(prev => ({ ...prev, [id]: requestId }))
    return requestId
  }

  const endRequest = (kind: 'save' | 'reload', id: string, requestId: number) => {
    const setter = kind === 'save' ? setSavingRequests : setReloadingRequests
    setter(prev => {
      if (prev[id] !== requestId) return prev
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  const clearGoalError = (id: string) => {
    setGoalErrors(prev => {
      if (prev[id] === undefined) return prev
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  const clearGoalNotice = (id: string) => {
    setGoalNotices(prev => {
      if (prev[id] === undefined) return prev
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  useEffect(() => {
    alive.current = true
    const mine = generation.current + 1
    generation.current = mine
    const controller = new AbortController()
    setListState({ status: 'loading' })
    setReader({ status: 'idle' })
    setSelected(null)
    setNotice('')
    setTopic(null)
    setTopicError('')
    setCandidatePanel(false)
    setCandidates(null)
    setCandidatesLoading(false)
    setCandidatesError('')
    setLinkError('')
    setLinking(null)
    setReturnTo(null)
    pendingScroll.current = null
    if (positionTimer.current !== null) {
      clearTimeout(positionTimer.current)
      positionTimer.current = null
    }

    const loadToken = (topicLoadTokens.current[spaceId] ?? 0) + 1
    topicLoadTokens.current[spaceId] = loadToken
    const current = () => alive.current && generation.current === mine && !controller.signal.aborted

    client.listLectures(spaceId, controller.signal).then(async list => {
      if (!current()) return
      setListState({ status: 'ready', list })
      setSelected(list.selectedPath)
      if (list.missingSelection !== null) setNotice(missingNotice(list.missingSelection))
      if (list.selectedPath === null) return
      setReader({ status: 'loading', path: list.selectedPath })
      try {
        const doc = await client.readLecture(spaceId, list.selectedPath, controller.signal)
        if (!current()) return
        // Cold start restores the saved offset only when the same course file is
        // opened again; a renamed or replaced lecture starts at the top.
        const stored = readingPositionRef.current
        if (stored.path === doc.path && stored.scrollTop > 0) pendingScroll.current = stored.scrollTop
        setReader({ status: 'ready', doc })
      } catch (error) {
        if (!current()) return
        setSelected(null)
        setReader({ status: 'failed', path: list.selectedPath, message: messageOf(error) })
        if (isMissing(error)) setNotice(missingNotice(list.selectedPath))
      }
    }).catch(error => {
      if (current()) setListState({ status: 'failed', message: messageOf(error) })
    })

    if (canTopic) {
      client.readTopic?.(spaceId, controller.signal).then(next => {
        if (!current() || topicLoadTokens.current[spaceId] !== loadToken) return
        setTopic(next)
        const existing = draftsRef.current[spaceId]
        if (existing !== undefined && existing.editing) {
          // A reload never replaces text the learner is still writing; keep the
          // draft and say why the disk copy differs.
          if (existing.text !== next.goal) {
            setGoalNotices(prev => ({ ...prev, [spaceId]: '磁盘上的学习目标已更新；你的未保存草稿仍保留。' }))
          } else {
            clearGoalNotice(spaceId)
          }
          return
        }
        const revision = nextDraftRevision()
        setDrafts(prev => ({ ...prev, [spaceId]: { text: next.goal, editing: false, revision } }))
        clearGoalNotice(spaceId)
      }).catch(error => {
        if (current() && topicLoadTokens.current[spaceId] === loadToken) setTopicError(messageOf(error))
      })
    }

    return () => {
      alive.current = false
      controller.abort()
    }
  }, [client, spaceId, reloadKey, canTopic])

  const select = async (
    path: string,
    fragment?: LinkFragment & { token: number },
    options: { fromLink?: boolean; keepScroll?: boolean } = {},
  ) => {
    if (reader.status === 'loading' && reader.path === path) return
    const mine = generation.current
    const row = list?.lectures.find(lecture => lecture.path === path)
    const targetKind = row?.kind ?? (path.toLowerCase().endsWith('.html') ? 'experiment' : 'markdown')
    const currentDoc = reader.status === 'ready' && reader.doc.kind === 'markdown' ? reader.doc : null
    if (targetKind === 'experiment' && currentDoc !== null) {
      // Capture the reading position before the experiment replaces the body;
      // the return action restores it after the lecture is rendered again.
      setReturnTo({
        path: currentDoc.path,
        title: currentDoc.title,
        scrollTop: paneRef.current?.scrollTop ?? 0,
      })
    } else if (targetKind !== 'experiment') {
      setReturnTo(null)
      if (options.keepScroll !== true) pendingScroll.current = null
    }
    setNotice('')
    setSelected(path)
    setReader({ status: 'loading', path })
    try {
      const doc = await client.readLecture(spaceId, path)
      if (!alive.current || generation.current !== mine) return
      setReader({ status: 'ready', doc, fragment })
    } catch (error) {
      if (!alive.current || generation.current !== mine) return
      setSelected(null)
      setReader({ status: 'failed', path, message: messageOf(error) })
      if (isMissing(error)) setNotice(missingNotice(path))
    }
  }

  const returnToLecture = () => {
    const target = returnTo
    if (target === null) return
    pendingScroll.current = target.scrollTop
    setReturnTo(null)
    void select(target.path, undefined, { keepScroll: true })
  }

  /** Open a course link inside the classroom instead of the browser tab. */
  const openHref = (href: string): boolean => {
    if (reader.status !== 'ready' || reader.doc.kind !== 'markdown') return false
    const resolved = resolveLectureHref(reader.doc.path, href)
    if (resolved === null) return false
    const row = list?.lectures.find(lecture => lecture.path === resolved)
    if (row?.missing === true) return false
    // A just-generated target may not be in the last directory snapshot yet;
    // the Host still validates the resolved 讲义/ path when it is opened.
    void select(resolved, undefined, { fromLink: true })
    return true
  }

  // Restore the captured scroll only after the returned lecture is on screen.
  useEffect(() => {
    if (reader.status !== 'ready') return
    if (pendingScroll.current === null) return
    const top = pendingScroll.current
    pendingScroll.current = null
    if (paneRef.current !== null) paneRef.current.scrollTop = top
    // Restoring the same offset must not immediately write it back.
    savedPosition.current = `${spaceId}:${reader.doc.path}:${Math.round(top)}`
  }, [reader])

  // A pending debounce must not fire after leaving the zone.
  useEffect(() => () => {
    if (positionTimer.current !== null) {
      clearTimeout(positionTimer.current)
      positionTimer.current = null
    }
  }, [])

  /**
   * "Back to where I was": scroll an already-open lecture, or reopen the stored
   * file and restore its offset once it renders. A stored path that no longer
   * opens is reported by the normal lecture error path.
   */
  const restoreReadingPosition = (path: string): void => {
    const top = readingPositionRef.current.path === path ? readingPositionRef.current.scrollTop : 0
    if (reader.status === 'ready' && reader.doc.path === path) {
      if (paneRef.current !== null) paneRef.current.scrollTop = top
      savedPosition.current = `${spaceId}:${path}:${Math.round(top)}`
      return
    }
    pendingScroll.current = top
    void select(path, undefined, { keepScroll: true })
  }

  /** Persist a debounced reading offset for the current course file. */
  const savePositionSoon = (path: string, scrollTop: number): void => {
    if (typeof client.saveReadingPosition !== 'function') return
    if (positionTimer.current !== null) clearTimeout(positionTimer.current)
    const requestSpaceId = spaceId
    positionTimer.current = setTimeout(() => {
      positionTimer.current = null
      if (!alive.current) return
      const key = `${requestSpaceId}:${path}:${scrollTop}`
      if (savedPosition.current === key) return
      savedPosition.current = key
      const seq = (positionSeq.current[requestSpaceId] ?? 0) + 1
      positionSeq.current[requestSpaceId] = seq
      void client.saveReadingPosition?.({ action: 'position-save', spaceId: requestSpaceId, path, scrollTop })
        ?.then(next => {
          if (!alive.current || next === undefined || next.readingPosition === undefined) return
          if (seq < (positionApplied.current[requestSpaceId] ?? 0)) return
          positionApplied.current[requestSpaceId] = seq
          // Attribute by the space that asked: a late A response must not move B.
          setPositions(prev => ({ ...prev, [requestSpaceId]: next.readingPosition }))
        })
        ?.catch(() => undefined)
    }, positionDebounceMs)
  }

  const onPaneScroll = (event: ReactUIEvent<HTMLElement>): void => {
    if (reader.status !== 'ready') return
    savePositionSoon(reader.doc.path, Math.round(event.currentTarget.scrollTop))
  }

  const reload = () => setReloadKey(key => key + 1)
  const list = listState.status === 'ready' ? listState.list : null
  const retryButton = <button className="lc-secondary" onClick={reload}>重新加载目录</button>

  const startGoalEdit = () => {
    const revision = nextDraftRevision()
    setDrafts(prev => ({
      ...prev,
      [spaceId]: { text: prev[spaceId]?.text ?? topic?.goal ?? '', editing: true, revision },
    }))
    clearGoalError(spaceId)
  }

  const cancelGoalEdit = () => {
    setDrafts(prev => {
      if (prev[spaceId] === undefined) return prev
      const copy = { ...prev }
      delete copy[spaceId]
      return copy
    })
    clearGoalError(spaceId)
    clearGoalNotice(spaceId)
  }

  const changeGoalDraft = (text: string) => {
    const revision = nextDraftRevision()
    setDrafts(prev => ({ ...prev, [spaceId]: { text, editing: true, revision } }))
  }

  /**
   * Save the goal through the versioned Host command. The request is owned by
   * the space that started it: another topic's pending request never counts as
   * this topic's busy flag, and this response never clears a newer draft.
   */
  const saveGoal = async () => {
    if (!canTopic || topic === null || goalBusy) return
    const targetSpace = spaceId
    const submitted = drafts[targetSpace]
    const text = submitted?.text ?? goalDraft
    const submittedRevision = submitted?.revision ?? null
    const version = topic.version
    const requestId = beginRequest('save', targetSpace)
    clearGoalError(targetSpace)
    try {
      const next = await client.saveTopicGoal?.({ action: 'topic-save', spaceId: targetSpace, goal: text, version })
      if (next === undefined) return
      // Only this space's in-flight read is older than this save.
      topicLoadTokens.current[targetSpace] = (topicLoadTokens.current[targetSpace] ?? 0) + 1
      if (submittedRevision !== null) {
        setDrafts(prev => {
          const current = prev[targetSpace]
          // A newer local revision belongs to the learner; keep it.
          if (current === undefined || current.revision !== submittedRevision) return prev
          const copy = { ...prev }
          delete copy[targetSpace]
          return copy
        })
      }
      clearGoalNotice(targetSpace)
      if (alive.current && currentSpaceIdRef.current === targetSpace) setTopic(next)
    } catch (error) {
      // The error stays with the space that asked, even after a view switch.
      if (alive.current) setGoalErrors(prev => ({ ...prev, [targetSpace]: messageOf(error) }))
    } finally {
      endRequest('save', targetSpace, requestId)
    }
  }

  /** Explicit choice after a conflict: replace the draft with the disk copy. */
  const reloadGoal = async () => {
    if (!canTopic || topic === null || goalBusy) return
    const targetSpace = spaceId
    const mine = generation.current
    const requestId = beginRequest('reload', targetSpace)
    clearGoalError(targetSpace)
    try {
      const next = await client.readTopic?.(targetSpace)
      if (next === undefined || !alive.current) return
      if (generation.current !== mine || currentSpaceIdRef.current !== targetSpace) return
      topicLoadTokens.current[targetSpace] = (topicLoadTokens.current[targetSpace] ?? 0) + 1
      const revision = nextDraftRevision()
      setTopic(next)
      setDrafts(prev => ({ ...prev, [targetSpace]: { text: next.goal, editing: true, revision } }))
      clearGoalNotice(targetSpace)
    } catch (error) {
      if (alive.current) setGoalErrors(prev => ({ ...prev, [targetSpace]: messageOf(error) }))
    } finally {
      endRequest('reload', targetSpace, requestId)
    }
  }

  const openCandidates = async () => {
    if (!canLink) return
    const mine = generation.current
    setCandidatePanel(true)
    setCandidates(null)
    setCandidatesError('')
    setLinkError('')
    setCandidatesLoading(true)
    try {
      const next = await client.listLectureCandidates?.(spaceId)
      if (next === undefined || !alive.current || generation.current !== mine) return
      setCandidates(next)
    } catch (error) {
      if (alive.current && generation.current === mine) setCandidatesError(messageOf(error))
    } finally {
      if (alive.current && generation.current === mine) setCandidatesLoading(false)
    }
  }

  /** Link an existing file in place; the directory refreshes from the Host response. */
  const linkExisting = async (path: string) => {
    if (!canLink || linking !== null) return
    const mine = generation.current
    setLinking(path)
    setLinkError('')
    try {
      const next = await client.linkLecture?.(spaceId, path)
      if (next === undefined || !alive.current || generation.current !== mine) return
      setListState({ status: 'ready', list: next })
      setCandidatePanel(false)
      setCandidates(null)
    } catch (error) {
      if (alive.current && generation.current === mine) setLinkError(messageOf(error))
    } finally {
      if (alive.current && generation.current === mine) setLinking(null)
    }
  }

  const unlinkExisting = async (path: string) => {
    if (!canLink || linking !== null) return
    const mine = generation.current
    setLinking(path)
    setLinkError('')
    try {
      const next = await client.unlinkLecture?.(spaceId, path)
      if (next === undefined || !alive.current || generation.current !== mine) return
      setListState({ status: 'ready', list: next })
      if (selected === path) {
        setSelected(null)
        setReader({ status: 'idle' })
      }
      if (candidatePanel) void openCandidates()
    } catch (error) {
      if (alive.current && generation.current === mine) setLinkError(messageOf(error))
    } finally {
      if (alive.current && generation.current === mine) setLinking(null)
    }
  }

  const lectureRows = (list?.lectures ?? []).filter(row => row.source !== 'linked')
  const linkedRows = (list?.lectures ?? []).filter(row => row.source === 'linked')
  // A hand-written/test client may omit the chapter field; it means the root.
  const lectureChapters = groupCourseLectures(lectureRows.map(row => ({ ...row, chapter: row.chapter ?? '' })))
  const linkedChapters = groupCourseLectures(linkedRows.map(row => ({ ...row, chapter: row.chapter ?? '' })))
  const goalText = (topic?.goal ?? '').trim()

  // A request from another zone (the canvas) opens a lecture once the directory
  // is ready. The token makes repeated requests for the same path observable.
  const requestToken = props.openRequest?.token ?? null
  const requestPath = props.openRequest?.path ?? null
  const requestHeading = props.openRequest?.heading ?? null
  const requestBlockId = props.openRequest?.blockId ?? null
  useEffect(() => {
    if (requestToken === null || requestPath === null) return
    if (handledRequest.current === requestToken) return
    if (listState.status !== 'ready') return
    handledRequest.current = requestToken
    const fragment = requestHeading === null && requestBlockId === null
      ? undefined
      : { token: requestToken, heading: requestHeading, blockId: requestBlockId }
    void select(requestPath, fragment)
  }, [requestToken, requestPath, requestHeading, requestBlockId, listState.status])

  return (
    <>
      <aside className="lc-pane lc-directory" aria-label="课程目录">
        <h2>课程目录</h2>
        <h3>学习空间</h3>
        <ul className="lc-space-list">
          {spaces.map(row => (
            <li key={row.id}>
              <button aria-current={row.id === currentSpaceId ? 'true' : undefined} disabled={busy} onClick={() => onOpenSpace(row.id)}>
                {row.title}
              </button>
            </li>
          ))}
        </ul>

        {canTopic && (
          <section className="lc-topic-goal" aria-label="学习目标">
            <div className="lc-directory-head">
              <h3>学习目标</h3>
              {!goalEditing && (
                <button className="lc-secondary" disabled={busy || topic === null} onClick={startGoalEdit}>编辑目标</button>
              )}
            </div>
            {topicError !== '' && <p className="lc-hint" role="alert">{topicError}</p>}
            {topic === null && topicError === '' && <p className="lc-hint" role="status">正在读取学习目标…</p>}
            {topic !== null && !goalEditing && (
              <>
                {topic.fileMissing && (
                  <p className="lc-hint">学习目标文件「学习目标.md」不见了；点“编辑目标”保存会重新创建它。</p>
                )}
                <p className={goalText === '' ? 'lc-hint' : 'lc-topic-goal-text'}>
                  {goalText === '' ? '还没有填写学习目标。' : topic.goal}
                </p>
              </>
            )}
            {topic !== null && goalEditing && (
              <form className="lc-goal-form" aria-label="编辑学习目标" onSubmit={event => { event.preventDefault(); void saveGoal() }}>
                <textarea
                  aria-label="学习目标内容"
                  rows={4}
                  value={goalDraft}
                  disabled={goalBusy}
                  onChange={event => changeGoalDraft(event.target.value)}
                />
                <div className="lc-goal-actions">
                  <button type="submit" disabled={goalBusy}>{goalSaving ? '保存中…' : '保存目标'}</button>
                  <button type="button" className="lc-secondary" disabled={goalBusy} onClick={() => void reloadGoal()}>
                    {goalReloading ? '重新加载中…' : '重新加载目标（放弃我的修改）'}
                  </button>
                  <button type="button" className="lc-secondary" disabled={goalBusy} onClick={cancelGoalEdit}>取消</button>
                </div>
                {goalNotice !== '' && <p className="lc-hint" role="status">{goalNotice}</p>}
                {goalError !== '' && <p className="lc-hint" role="alert">{goalError}</p>}
              </form>
            )}
          </section>
        )}

        <div className="lc-directory-head">
          <h3>讲义</h3>
          <button className="lc-secondary lc-lecture-refresh" aria-label="刷新讲义目录" disabled={busy} onClick={reload}>刷新目录</button>
        </div>
        {listState.status === 'loading' && <p className="lc-hint" role="status">正在读取讲义目录…</p>}
        {listState.status === 'failed' && <p className="lc-hint">无法读取讲义目录。</p>}
        {list !== null && list.lectures.length === 0 && <p className="lc-hint">还没有讲义。</p>}
        <ul className="lc-lecture-list">
          {lectureChapters.map(group => (
            <li key={`${group.chapter || '__root'}`} className="lc-chapter">
              {group.chapter !== '' && <h4 className="lc-chapter-title">{group.chapter}</h4>}
              <ul className="lc-chapter-list">
                {group.entries.map(row => (
                  <li key={row.path}>
                    <button
                      aria-current={selected === row.path ? 'true' : undefined}
                      disabled={busy}
                      title={row.path}
                      onClick={() => void select(row.path)}
                    >
                      {row.title}
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        {(linkedRows.length > 0 || canLink) && (
          <section className="lc-linked" aria-label="已关联文件">
            <div className="lc-directory-head">
              <h3>已关联文件</h3>
              {canLink && (
                <button className="lc-secondary" disabled={busy || linking !== null} onClick={() => void openCandidates()}>关联已有文件</button>
              )}
            </div>
            {linkedRows.length === 0 && (
              <p className="lc-hint">还没有关联本空间已有的文件。关联只登记路径，不复制、不移动原文件。</p>
            )}
            <ul className="lc-linked-list">
              {linkedChapters.flatMap(group => group.entries.map(row => (
                <li key={row.path}>
                  <button
                    aria-current={selected === row.path ? 'true' : undefined}
                    disabled={busy || row.missing}
                    title={row.path}
                    onClick={() => void select(row.path)}
                  >
                    {row.title}{row.missing ? '（文件缺失）' : ''}
                  </button>
                  {canLink && (
                    <button
                      className="lc-secondary"
                      aria-label={`取消关联 ${row.title}`}
                      disabled={busy || linking !== null}
                      onClick={() => void unlinkExisting(row.path)}
                    >
                      取消关联
                    </button>
                  )}
                </li>
              )))}
            </ul>
            {candidatePanel && (
              <div className="lc-candidates" aria-label="可关联文件">
                <p className="lc-hint">从学习空间已有文件里选一个加入目录；文件留在原处，不复制、不移动。</p>
                {candidatesLoading && <p className="lc-hint" role="status">正在查找可关联文件…</p>}
                {candidatesError !== '' && <p className="lc-hint" role="alert">{candidatesError}</p>}
                {!candidatesLoading && candidatesError === '' && candidates !== null && candidates.files.length === 0 && (
                  <p className="lc-hint">没有可关联的文件。把 .md 或 .html 放进这个学习空间的其他文件夹后再试。</p>
                )}
                <ul className="lc-candidate-list">
                  {candidates?.files.map(file => (
                    <li key={file.path}>
                      <button className="lc-secondary" disabled={busy || linking !== null} onClick={() => void linkExisting(file.path)}>
                        {file.title}
                      </button>
                      <span className="lc-lecture-path">{file.path}</span>
                    </li>
                  ))}
                </ul>
                {candidates?.truncated === true && <p className="lc-hint">文件较多，只列出前 {candidates.files.length} 个。</p>}
                {linkError !== '' && <p className="lc-hint" role="alert">{linkError}</p>}
                <button className="lc-secondary" onClick={() => { setCandidatePanel(false); setCandidates(null); setCandidatesError(''); setLinkError('') }}>收起</button>
              </div>
            )}
            {!candidatePanel && linkError !== '' && <p className="lc-hint" role="alert">{linkError}</p>}
          </section>
        )}
      </aside>

      <section className="lc-pane lc-lectures" aria-label="讲义" ref={paneRef} onScroll={onPaneScroll}>
        <style>{lectureStyles}</style>
        <h2>讲义</h2>

        <ContinuityZone
          client={client}
          space={space}
          busy={busy}
          goal={topic?.goal ?? ''}
          lectures={list?.lectures ?? []}
          currentPath={reader.status === 'ready' ? reader.doc.path : null}
          readingPosition={effectivePosition}
          onRestorePosition={restoreReadingPosition}
        />

        {notice !== '' && (
          <div className="lc-alert" role="alert">
            <p>{notice}</p>
            {retryButton}
          </div>
        )}

        {listState.status === 'failed' && (
          <div className="lc-alert" role="alert">
            <p>{listState.message}</p>
            {retryButton}
          </div>
        )}

        {listState.status === 'loading' && <p role="status">正在读取讲义目录…</p>}

        {listState.status === 'ready' && reader.status === 'loading' && <p role="status">正在打开讲义…</p>}

        {listState.status === 'ready' && reader.status === 'ready' && (
          <LectureReader
            doc={reader.doc}
            space={space}
            askTeacher={props.askTeacher}
            onOpenHref={openHref}
            mathRenderer={props.mathRenderer}
            returnTarget={reader.doc.kind === 'experiment' ? returnTo : null}
            onReturn={returnToLecture}
            onAnnotate={props.onAnnotate}
            fragment={reader.fragment ?? null}
          />
        )}

        {listState.status === 'ready' && reader.status === 'failed' && (
          <div className="lc-alert" role="alert">
            <p>{reader.message}</p>
            {retryButton}
          </div>
        )}

        {listState.status === 'ready' && reader.status === 'idle' && (
          list !== null && list.lectures.length === 0
            ? (
              <div className="lc-lecture-empty">
                <h3>{list.folderMissing ? '讲义文件夹不见了' : '还没有讲义'}</h3>
                <p>
                  {list.folderMissing
                    ? '在知识文件库里恢复这个学习空间的「讲义/」文件夹后，重新加载目录。'
                    : '把 Markdown（.md）或动态实验（.html）放进该学习空间的「讲义/」文件夹，目录会自动出现，不需要清单文件。也可以在右侧请老师生成一节带来源的讲义或动态实验，成功后点「刷新目录」发现新文件。'}
                </p>
                {list.folderMissing && retryButton}
              </div>
            )
            : <p className="lc-hint">从左侧目录选择一节讲义开始阅读。</p>
        )}
      </section>
    </>
  )
}
