import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { AnnotationAction } from './annotation-action.tsx'
import type { AnnotationSourceInput } from './annotation-flow.ts'
import { ClassroomClientError, type ClassroomClient } from './classroom-client.ts'
import type {
  ClassroomSpaceView,
  LectureCandidatesView,
  LectureListView,
  LectureReadView,
  TopicView,
} from './contract.ts'
import { groupCourseLectures } from './lectures.ts'
import { scrollToFragment, type LinkFragment } from './fragments.ts'
import { parseInline, parseMarkdown, type Block } from './markdown.ts'
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
.lc-lecture-doc p,.lc-lecture-doc ul,.lc-lecture-doc ol,.lc-lecture-doc blockquote,.lc-lecture-doc pre,.lc-lecture-doc table{margin:0}
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
.lc-lecture-experiment{display:flex;flex-direction:column;gap:8px;padding:16px;border:1px dashed var(--dsh-border,#d8dee4);border-radius:8px;background:#f6f8fa}
.lc-lecture-empty{padding:24px;border:1px dashed var(--dsh-border,#d8dee4);border-radius:8px;text-align:center}
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

function InlineText({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((token, index) => {
        switch (token.type) {
          case 'code': return <code key={index}>{token.text}</code>
          case 'strong': return <strong key={index}>{token.text}</strong>
          case 'em': return <em key={index}>{token.text}</em>
          case 'link': return <a key={index} href={token.href} target="_blank" rel="noreferrer noopener">{token.text}</a>
          case 'wikilink': return <span key={index} className="lc-wikilink-static" title={`双链：${token.target}`}>{token.text}</span>
          case 'text': return <Fragment key={index}>{token.text}</Fragment>
        }
      })}
    </>
  )
}

const headingTags = ['h3', 'h4', 'h5', 'h6', 'h6', 'h6'] as const

function BlockView({ block }: { block: Block }): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = headingTags[Math.min(Math.max(block.level, 1), 6) - 1]
      return <Tag data-block-id={block.blockId}><InlineText text={block.text} /></Tag>
    }
    case 'paragraph':
      return <p data-block-id={block.blockId}><InlineText text={block.text} /></p>
    case 'list': {
      const items = block.items.map((item, index) => <li key={index}><InlineText text={item} /></li>)
      return block.ordered
        ? <ol data-block-id={block.blockId}>{items}</ol>
        : <ul data-block-id={block.blockId}>{items}</ul>
    }
    case 'table':
      return (
        <div className="lc-lecture-table">
          <table>
            <thead>
              <tr>{block.header.map((cell, index) => <th key={index}><InlineText text={cell} /></th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><InlineText text={cell} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'code':
      return <pre><code className={block.lang === '' ? undefined : `language-${block.lang}`}>{block.code}</code></pre>
    case 'quote':
      return <blockquote data-block-id={block.blockId}><InlineText text={block.text} /></blockquote>
    case 'rule':
      return <hr />
  }
}

function MarkdownBody({ content }: { content: string }) {
  const blocks = parseMarkdown(content)
  if (blocks.length === 0) return <p className="lc-hint">这一节还没有正文。</p>
  return (
    <article className="lc-lecture-doc">
      {blocks.map((block, index) => <BlockView key={index} block={block} />)}
    </article>
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
  const text = selection.toString().trim()
  if (text === '') return { kind: 'none' }
  // One bounded range is required: multi-range selections cannot be proven to
  // stay inside the lecture body.
  if (selection.rangeCount !== 1) return { kind: 'outside' }
  const range = selection.getRangeAt(0)
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return { kind: 'outside' }
  return { kind: 'inside', text }
}

function LectureReader(props: {
  doc: LectureReadView
  space: ClassroomSpaceView
  askTeacher?: AskTeacher
  onAnnotate?: (request: AnnotationSourceInput) => Promise<{ ok: boolean; message: string }>
  fragment?: (LinkFragment & { token: number }) | null
}) {
  const { doc, space, askTeacher, onAnnotate, fragment } = props
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
      setAskError('这一节没有可附加的正文；实验占位不会作为提问材料。')
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
        {fragmentNotice !== '' && <p className="lc-hint" role="alert">{fragmentNotice}</p>}
      </div>
      <AnnotationAction doc={doc} onAnnotate={onAnnotate}>
        <div ref={bodyRef}>
          {doc.kind === 'markdown'
            ? <MarkdownBody content={doc.content ?? ''} />
            : (
              <div className="lc-lecture-experiment" role="note">
                <p>{doc.placeholder ?? '这是一节动态实验（HTML），隔离渲染尚未打开。'}</p>
                <p className="lc-hint">实验内容不会直接注入课堂页面。</p>
              </div>
            )}
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
  const { client, space, spaces, currentSpaceId, busy, onOpenSpace } = props
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
        if (current()) setReader({ status: 'ready', doc })
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

  const select = async (path: string, fragment?: LinkFragment & { token: number }) => {
    if (reader.status === 'loading' && reader.path === path) return
    const mine = generation.current
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

      <section className="lc-pane lc-lectures" aria-label="讲义">
        <style>{lectureStyles}</style>
        <h2>讲义</h2>

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
                    : '把 Markdown（.md）或动态实验（.html）放进该学习空间的「讲义/」文件夹，目录会自动出现，不需要清单文件。'}
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
