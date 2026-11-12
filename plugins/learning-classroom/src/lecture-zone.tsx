import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { ClassroomClientError, type ClassroomClient } from './classroom-client.ts'
import type {
  ClassroomSpaceView,
  LectureCandidatesView,
  LectureListView,
  LectureReadView,
  TopicView,
} from './contract.ts'
import { groupCourseLectures } from './lectures.ts'
import { parseInline, parseMarkdown, type Block } from './markdown.ts'

export interface LectureZoneProps {
  client: ClassroomClient
  space: ClassroomSpaceView
  spaces: ClassroomSpaceView[]
  currentSpaceId: string | null
  busy: boolean
  onOpenSpace: (spaceId: string) => void
  /** Ask the reader to open a specific lecture, e.g. from a canvas file node. */
  openRequest?: LectureOpenRequest | null
}

/** One-shot request to open a lecture; a new token re-opens the same path. */
export interface LectureOpenRequest {
  path: string
  token: number
}

type ListState =
  | { status: 'loading' }
  | { status: 'ready'; list: LectureListView }
  | { status: 'failed'; message: string }

type ReaderState =
  | { status: 'idle' }
  | { status: 'loading'; path: string }
  | { status: 'ready'; doc: LectureReadView }
  | { status: 'failed'; path: string; message: string }

/** Unsaved goal text, kept per learning space so a view switch cannot lose it. */
interface GoalDraft {
  text: string
  editing: boolean
}

const lectureStyles = `
.lc-lecture-head{display:flex;flex-direction:column;gap:2px}
.lc-lecture-head h3{margin:0;font-size:16px}
.lc-lecture-path{margin:0;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;color:var(--dsh-text-secondary,#59636e);word-break:break-all}
.lc-directory-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.lc-directory-head h3{margin:0;font-size:13px}
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
      return <Tag><InlineText text={block.text} /></Tag>
    }
    case 'paragraph':
      return <p><InlineText text={block.text} /></p>
    case 'list': {
      const items = block.items.map((item, index) => <li key={index}><InlineText text={item} /></li>)
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
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
      return <blockquote><InlineText text={block.text} /></blockquote>
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

function LectureReader(props: { doc: LectureReadView }) {
  const { doc } = props
  return (
    <>
      <div className="lc-lecture-head">
        <h3>{doc.title}</h3>
        <p className="lc-lecture-path">{doc.path}</p>
      </div>
      {doc.kind === 'markdown'
        ? <MarkdownBody content={doc.content ?? ''} />
        : (
          <div className="lc-lecture-experiment" role="note">
            <p>{doc.placeholder ?? '这是一节动态实验（HTML），隔离渲染尚未打开。'}</p>
            <p className="lc-hint">实验内容不会直接注入课堂页面。</p>
          </div>
        )}
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
  const [savingSpaceId, setSavingSpaceId] = useState<string | null>(null)
  const [reloadingSpaceId, setReloadingSpaceId] = useState<string | null>(null)
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
  const topicLoadToken = useRef(0)
  currentSpaceIdRef.current = spaceId

  useEffect(() => {
    draftsRef.current = drafts
  }, [drafts])

  const draft = drafts[spaceId]
  const goalEditing = draft?.editing ?? false
  const goalDraft = draft?.text ?? topic?.goal ?? ''
  const goalError = goalErrors[spaceId] ?? ''
  const goalNotice = goalNotices[spaceId] ?? ''
  const goalSaving = savingSpaceId === spaceId
  const goalReloading = reloadingSpaceId === spaceId
  const goalBusy = goalSaving || goalReloading

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

    const loadToken = ++topicLoadToken.current
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
        if (!current() || topicLoadToken.current !== loadToken) return
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
        setDrafts(prev => ({ ...prev, [spaceId]: { text: next.goal, editing: false } }))
        clearGoalNotice(spaceId)
      }).catch(error => {
        if (current() && topicLoadToken.current === loadToken) setTopicError(messageOf(error))
      })
    }

    return () => {
      alive.current = false
      controller.abort()
    }
  }, [client, spaceId, reloadKey, canTopic])

  const select = async (path: string) => {
    if (reader.status === 'loading' && reader.path === path) return
    const mine = generation.current
    setNotice('')
    setSelected(path)
    setReader({ status: 'loading', path })
    try {
      const doc = await client.readLecture(spaceId, path)
      if (!alive.current || generation.current !== mine) return
      setReader({ status: 'ready', doc })
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
    setDrafts(prev => ({
      ...prev,
      [spaceId]: { text: prev[spaceId]?.text ?? topic?.goal ?? '', editing: true },
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
    setDrafts(prev => ({ ...prev, [spaceId]: { text, editing: true } }))
  }

  /**
   * Save the goal through the versioned Host command. The busy flag belongs to
   * the space that started the request, so switching views or a late response
   * can never disable (or re-enable) another topic's form.
   */
  const saveGoal = async () => {
    if (!canTopic || topic === null || goalBusy) return
    const targetSpace = spaceId
    const text = goalDraft
    const version = topic.version
    setSavingSpaceId(targetSpace)
    clearGoalError(targetSpace)
    try {
      const next = await client.saveTopicGoal?.({ action: 'topic-save', spaceId: targetSpace, goal: text, version })
      if (next === undefined) return
      // Any in-flight read of this goal file is now older than the save.
      topicLoadToken.current += 1
      setDrafts(prev => {
        if (prev[targetSpace] === undefined) return prev
        const copy = { ...prev }
        delete copy[targetSpace]
        return copy
      })
      clearGoalNotice(targetSpace)
      if (alive.current && currentSpaceIdRef.current === targetSpace) setTopic(next)
    } catch (error) {
      // The error stays with the space that asked, even after a view switch.
      if (alive.current) setGoalErrors(prev => ({ ...prev, [targetSpace]: messageOf(error) }))
    } finally {
      setSavingSpaceId(current => current === targetSpace ? null : current)
    }
  }

  /** Explicit choice after a conflict: replace the draft with the disk copy. */
  const reloadGoal = async () => {
    if (!canTopic || topic === null || goalBusy) return
    const targetSpace = spaceId
    const mine = generation.current
    setReloadingSpaceId(targetSpace)
    clearGoalError(targetSpace)
    try {
      const next = await client.readTopic?.(targetSpace)
      if (next === undefined || !alive.current) return
      if (generation.current !== mine || currentSpaceIdRef.current !== targetSpace) return
      topicLoadToken.current += 1
      setTopic(next)
      setDrafts(prev => ({ ...prev, [targetSpace]: { text: next.goal, editing: true } }))
      clearGoalNotice(targetSpace)
    } catch (error) {
      if (alive.current) setGoalErrors(prev => ({ ...prev, [targetSpace]: messageOf(error) }))
    } finally {
      setReloadingSpaceId(current => current === targetSpace ? null : current)
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
  useEffect(() => {
    if (requestToken === null || requestPath === null) return
    if (handledRequest.current === requestToken) return
    if (listState.status !== 'ready') return
    handledRequest.current = requestToken
    void select(requestPath)
  }, [requestToken, requestPath, listState.status])

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

        {listState.status === 'ready' && reader.status === 'ready' && <LectureReader doc={reader.doc} />}

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
