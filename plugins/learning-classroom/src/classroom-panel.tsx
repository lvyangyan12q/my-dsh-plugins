import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { annotationBlockFor, type AnnotationSourceInput } from './annotation-flow.ts'
import type { ClassroomSpaceView, ClassroomView, ClassroomViewCommand } from './contract.ts'
import { createClassroomClient, type ClassroomClient } from './classroom-client.ts'
import { CanvasZone, type CanvasOpenTarget } from './canvas-zone.tsx'
import { ClassroomLayoutView, type ClassroomMainView } from './classroom-layout.tsx'
import type { ComposerFace, ConversationLike } from './composer.ts'
import type { LinkFragment } from './fragments.ts'
import { normalizeLayout, type ClassroomLayout } from './layout.ts'
import { LectureZone, type LectureOpenRequest } from './lecture-zone.tsx'
import { createNativeOpenSeam, type NativeOpenSeam } from './native-open.ts'
import { NotesZone, type NoteAppendRequest, type NoteOpenRequest, type NoteStateView } from './notes-zone.tsx'
import {
  createAskedContext,
  type AskQuestionResult,
  type AskTeacher,
  type AskedContext,
  type QuestionContextInput,
} from './question-context.ts'
import {
  teacherSessionSeat,
  TeacherConversationSeat,
  TeacherSessionZone,
  type RenderSlotLike,
  type SessionProviderLike,
  type SessionsLike,
} from './session-zone.tsx'

export const panelId = 'learning-classroom'
export const panelLabel = '学习课堂'

export interface ClassroomPanelProps {
  client?: ClassroomClient
  /** Framework-injected public Session service (`ctx.sessions`). */
  sessions?: SessionsLike
  /** Framework-injected child-slot renderer for the main entry that declares the session seat. */
  renderSlot?: RenderSlotLike
  /** Framework-injected Session area component for the declared session seat. */
  SessionProvider?: SessionProviderLike
  /**
   * Resolves the public `conversation` service at call time. The classroom uses
   * only its documented input seam: append to the retained draft, read that
   * draft, and rewrite it for an explicit context removal.
   */
  getConversation?: () => ConversationLike | undefined
  /** Public DSH native open seam; probed by the canvas before it shows a control. */
  nativeOpen?: NativeOpenSeam
}

const styles = `
.lc-root{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;height:100%;min-height:0;max-width:100%;min-width:0;padding:16px;color:var(--dsh-text-primary,#1f2328)}
.lc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;min-width:0}
.lc-head h1{margin:0;font-size:20px}
.lc-head p{margin:4px 0 0;color:var(--dsh-text-secondary,#59636e);font-size:13px;overflow-wrap:anywhere}
.lc-form{display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px;min-width:0;padding:8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px}
.lc-form label{display:flex;flex-direction:column;gap:4px;flex:1 1 240px;min-width:0;font-size:13px}
.lc-form input{box-sizing:border-box;display:block;flex:none;width:100%;height:32px;min-height:32px;max-width:100%;min-width:0;padding:4px 8px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;font:inherit}
.lc-form .lc-hint{flex:1 1 100%}
.lc-form button,.lc-secondary{padding:6px 12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer}
.lc-form button[type="submit"]{background:var(--dsh-accent,#0969da);border-color:var(--dsh-accent,#0969da);color:#fff}
.lc-form button:disabled{opacity:.5;cursor:default}
.lc-hint{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e)}
.lc-alert{padding:10px 12px;border:1px solid #d1242f;border-radius:8px;background:#ffebe9;color:#82071e}
.lc-empty{padding:24px;border:1px dashed var(--dsh-border,#d8dee4);border-radius:8px;text-align:center}
.lc-main{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.lc-view-tabs{display:flex;flex-wrap:wrap;gap:6px}
.lc-view-tab{padding:5px 14px;border:1px solid var(--dsh-border,#d8dee4);border-radius:999px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer}
.lc-view-tab[aria-selected="true"]{background:var(--dsh-accent,#0969da);border-color:var(--dsh-accent,#0969da);color:#fff}
.lc-pane{display:flex;flex-direction:column;gap:8px;min-width:0;overflow:auto;padding:12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:var(--dsh-surface,#fff)}
.lc-pane h2{margin:0;font-size:14px}
.lc-pane p{margin:0;font-size:13px;line-height:1.6}
.lc-directory ul{display:flex;flex-direction:column;gap:6px;margin:0;padding:0;list-style:none}
.lc-directory button{width:100%;padding:6px 8px;border:1px solid transparent;border-radius:6px;background:transparent;color:inherit;text-align:left;cursor:pointer}
.lc-directory button[aria-current="true"]{border-color:var(--dsh-accent,#0969da);background:#ddf4ff}
.lc-conversation,.lc-zone-conversation{background:#f6f8fa;overflow:hidden}
.lc-conversation>h2,.lc-zone-conversation>h2{flex:none}
.lc-session-zone{display:flex;flex-direction:column;gap:8px;flex:1;min-height:0;min-width:0}
.lc-session-empty{display:flex;flex-direction:column;align-items:flex-start;gap:8px}
.lc-session-empty p{margin:0}
.lc-session-body{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0;overflow:hidden;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff)}
.lc-session-body [data-slot="learningClassroom.teacherSession"]{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.lc-teacher-session{display:flex;flex-direction:column;flex:1;min-height:0;min-width:0}
.lc-session-error{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:10px 12px;border:1px solid #d1242f;border-radius:8px;background:#ffebe9;color:#82071e}
.lc-session-error p{margin:0}
.lc-note-file{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}
`

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : '学习课堂操作失败。'
}

function VaultForm(props: { busy: boolean; value: string; onChange: (value: string) => void; onSubmit: () => void }) {
  return (
    <form className="lc-form" aria-label="选择知识文件库" onSubmit={event => { event.preventDefault(); props.onSubmit() }}>
      <label>
        知识文件库目录
        <input
          aria-label="知识文件库路径"
          placeholder="D:\\学习\\知识文件库"
          value={props.value}
          disabled={props.busy}
          onChange={event => props.onChange(event.target.value)}
        />
      </label>
      <button type="submit" disabled={props.busy || props.value.trim() === ''}>选择此目录</button>
      <p className="lc-hint">必须是已存在的本地目录。讲义、笔记和附件都会保存在这个目录里，Obsidian 可直接打开。</p>
    </form>
  )
}

function ClassroomGrid(props: {
  client: ClassroomClient
  view: ClassroomView
  space: ClassroomSpaceView
  busy: boolean
  onOpen: (spaceId: string) => void
  openLecture: LectureOpenRequest | null
  openNote: NoteOpenRequest | null
  sessions?: SessionsLike
  renderSlot?: RenderSlotLike
  SessionProvider?: SessionProviderLike
  /** Main-column content: lecture/classroom or the knowledge canvas. */
  mainView: ClassroomMainView
  /** Mounted canvas; kept mounted while the classroom owns the main column. */
  canvas?: ReactNode
  onView: (view: ClassroomView) => void
  onLayoutChange: (spaceId: string, layout: ClassroomLayout) => void
  /** Append a lecture selection to the current note (Host-resolved source link). */
  onAnnotate: (request: AnnotationSourceInput) => Promise<{ ok: boolean; message: string }>
  appendRequest: NoteAppendRequest | null
  onNoteState: (state: NoteStateView) => void
  onOpenLecture: (path: string, fragment?: LinkFragment) => void
  /** "Ask the teacher" capability shared by the lecture and note zones. */
  askTeacher?: AskTeacher
  getConversation?: () => ConversationLike | undefined
  questionContexts: readonly AskedContext[]
  onRemoveContext: (id: string) => Promise<AskQuestionResult>
  onDismissContext: (id: string) => void
  onComposer: (face: ComposerFace | null) => void
}) {
  const {
    client, view, space, busy, onOpen, openLecture, openNote, sessions, renderSlot, SessionProvider,
    mainView, canvas, onView, onLayoutChange, onAnnotate, appendRequest, onNoteState, onOpenLecture,
    askTeacher, getConversation, questionContexts, onRemoveContext, onDismissContext, onComposer,
  } = props
  return (
    <ClassroomLayoutView
      layout={normalizeLayout(space.layout)}
      onLayoutChange={next => onLayoutChange(space.id, next)}
      mainView={mainView}
      main={canvas}
      lecture={(
        <LectureZone
          client={client}
          space={space}
          spaces={view.spaces}
          currentSpaceId={view.currentSpaceId}
          busy={busy}
          onOpenSpace={onOpen}
          openRequest={openLecture}
          onAnnotate={onAnnotate}
          askTeacher={askTeacher}
        />
      )}
      notes={(
        <NotesZone
          client={client}
          space={space}
          openRequest={openNote}
          appendRequest={appendRequest}
          onNoteState={onNoteState}
          onOpenLecture={onOpenLecture}
          askTeacher={askTeacher}
        />
      )}
      conversation={(
        <TeacherSessionZone
          key={space.id}
          space={space}
          client={client}
          sessions={sessions}
          renderSlot={renderSlot}
          SessionProvider={SessionProvider}
          onView={onView}
          getConversation={getConversation}
          onComposer={onComposer}
          questionContexts={questionContexts}
          onRemoveContext={onRemoveContext}
          onDismissContext={onDismissContext}
        />
      )}
    />
  )
}

/** Main panel: vault onboarding, space creation and the four-region shell. */
export function ClassroomPanel({ client, sessions, renderSlot, SessionProvider, getConversation, nativeOpen }: ClassroomPanelProps) {
  const api = useMemo(() => client ?? createClassroomClient(), [client])
  const [view, setView] = useState<ClassroomView | null>(null)
  const [loadError, setLoadError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [vaultInput, setVaultInput] = useState('')
  const [spaceTitle, setSpaceTitle] = useState('')
  const [spaceGoal, setSpaceGoal] = useState('')
  const [showVaultForm, setShowVaultForm] = useState(false)
  const [mode, setMode] = useState<'classroom' | 'canvas'>('classroom')
  const [canvasMounted, setCanvasMounted] = useState(false)
  const [openLecture, setOpenLecture] = useState<LectureOpenRequest | null>(null)
  const [openNote, setOpenNote] = useState<NoteOpenRequest | null>(null)
  // Annotation append is a one-shot hand-off between the lecture and note zones.
  // The block already carries its Host-resolved source link; the notes zone only
  // appends it through the ordinary save path.
  const [appendRequest, setAppendRequest] = useState<NoteAppendRequest | null>(null)
  const appendToken = useRef(0)
  const noteState = useRef<NoteStateView | null>(null)
  // Navigation epoch: an annotation whose source resolution finishes after any
  // space switch must not be delivered to the newly selected space.
  const spaceSession = useRef(0)
  // The context strip is page state, not a chat database: the appended text
  // lives in the native draft, and the sent message lives in the native
  // Session history. Only the frozen blocks shown in this page are kept here.
  const [asked, setAsked] = useState<Record<string, AskedContext[]>>({})
  // The composer controls are held in a ref: the zone owns the retained Session,
  // and a new face must not cause an extra classroom render (that would mount a
  // second native seat render for a cosmetic state change).
  const composerRef = useRef<ComposerFace | null>(null)
  const questionSeq = useRef(0)
  const requestToken = useRef(0)
  const noteToken = useRef(0)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const controller = new AbortController()
    setLoadError('')
    api.load(controller.signal).then(next => {
      if (!controller.signal.aborted && alive.current) setView(next)
    }).catch(cause => {
      if (!controller.signal.aborted && alive.current) {
        setView(null)
        setLoadError(messageOf(cause))
      }
    })
    return () => { alive.current = false; controller.abort() }
  }, [api, reloadKey])

  const run = async (command: ClassroomViewCommand) => {
    if (busy) return
    // Any navigation invalidates annotation resolutions still in flight.
    if (command.action === 'space-open' || command.action === 'space-create'
      || command.action === 'vault-choose' || command.action === 'session-open') {
      spaceSession.current += 1
    }
    setBusy(true)
    setError('')
    try {
      const next = await api.command(command)
      if (!alive.current) return
      setView(next)
      setSpaceTitle('')
      setSpaceGoal('')
      setVaultInput('')
      setShowVaultForm(false)
      // Space/vault navigation always returns to the classroom; stale canvas
      // targets and a canvas from the previous space must not leak into the new one.
      setMode('classroom')
      setCanvasMounted(false)
      setOpenLecture(null)
      setOpenNote(null)
      setAppendRequest(null)
    } catch (cause) {
      if (alive.current) setError(messageOf(cause))
    } finally {
      if (alive.current) setBusy(false)
    }
  }

  /** Canvas file nodes hand their target to the classroom's existing zones. */
  const openCanvasTarget = (target: CanvasOpenTarget) => {
    setError('')
    if (target.kind === 'note') {
      noteToken.current += 1
      setOpenNote({
        path: target.path,
        token: noteToken.current,
        heading: target.heading ?? null,
        blockId: target.blockId ?? null,
      })
      setMode('classroom')
      return
    }
    requestToken.current += 1
    setOpenLecture({
      path: target.path,
      token: requestToken.current,
      heading: target.heading ?? null,
      blockId: target.blockId ?? null,
    })
    setMode('classroom')
  }

  /**
   * Layout is navigation state: apply it locally, then write it for the current
   * space. A failed write keeps the on-screen layout and explains itself; no
   * lecture, note or session request is involved.
   */
  const persistLayout = (spaceId: string, layout: ClassroomLayout) => {
    setView(current => current === null ? current : {
      ...current,
      spaces: current.spaces.map(row => (row.id === spaceId ? { ...row, layout } : row)),
    })
    api.saveLayout({ action: 'layout-save', spaceId, layout }).catch(cause => {
      if (alive.current) setError(`布局未能保存：${messageOf(cause)}`)
    })
  }

  const space = view?.spaces.find(row => row.id === view.currentSpaceId)
  const vaultStatus = view?.vault.status ?? 'unset'
  const currentSpaceId = space?.id ?? null
  const spaceIdRef = useRef<string | null>(null)
  spaceIdRef.current = currentSpaceId
  const questionContexts = currentSpaceId === null ? [] : (asked[currentSpaceId] ?? [])
  const serviceOf = (): ConversationLike | undefined => {
    if (getConversation === undefined) return undefined
    try { return getConversation() } catch { return undefined }
  }
  const seamAvailable = serviceOf() !== undefined
  const askReason = getConversation === undefined || space === undefined
    ? ''
    : !seamAvailable
      ? '宿主尚未提供原生输入接缝，无法追加到老师输入框。'
      : ''

  /** Append one frozen context block to the teacher's existing native draft. */
  async function askQuestion(input: QuestionContextInput): Promise<AskQuestionResult> {
    const target = currentSpaceId
    const face = composerRef.current
    if (target === null || face === null || face.spaceId !== target) {
      return { ok: false, reason: askReason || '老师会话准备好后才能追加提问上下文。' }
    }
    if (input.excerpt.trim() === '') return { ok: false, reason: '没有可附加的摘录，未追加。' }
    questionSeq.current += 1
    const context = createAskedContext(input, `q${questionSeq.current}`)
    const result = face.append(context.block)
    if (!result.ok) return result
    if (alive.current) setAsked(previous => ({ ...previous, [target]: [...(previous[target] ?? []), context] }))
    return { ok: true }
  }

  /** Take one appended block back out of the native draft; sent messages stay untouched. */
  async function removeContext(id: string): Promise<AskQuestionResult> {
    const target = currentSpaceId
    const face = composerRef.current
    const context = questionContexts.find(row => row.id === id)
    if (target === null || context === undefined) return { ok: false, reason: '这条上下文已经不在此学习空间。' }
    if (face === null || face.spaceId !== target) return { ok: false, reason: '老师会话还没准备好，未移除。' }
    // Deduct the other context blocks this page owns before the host-side
    // unknown-quote check; they are never deleted by this removal.
    const known = questionContexts.filter(row => row.id !== id).map(row => row.block)
    const result = face.remove(context.block, known)
    if (!result.ok) return result
    if (alive.current) {
      setAsked(previous => ({ ...previous, [target]: (previous[target] ?? []).filter(row => row.id !== id) }))
    }
    return { ok: true }
  }

  /** Forget a block that left the draft by other means (sent or manually edited). */
  const dismissContext = (id: string): void => {
    const target = currentSpaceId
    if (target === null) return
    setAsked(previous => ({ ...previous, [target]: (previous[target] ?? []).filter(row => row.id !== id) }))
  }

  /**
   * The classroom's ask capability. The zone publishes its face through this
   * stable callback; keeping it out of React state avoids a re-render that would
   * re-mount the native conversation seat merely because it became available.
   */
  const publishComposer = useCallback((face: ComposerFace | null): void => {
    composerRef.current = face !== null && face.spaceId === spaceIdRef.current ? face : null
  }, [])

  const askTeacher: AskTeacher | undefined = getConversation === undefined || space === undefined
    ? undefined
    : { available: askReason === '', reason: askReason, ask: askQuestion }

  /** Notes zone publishes the note it is editing, so refusals are accurate. */
  const handleNoteState = useCallback((state: NoteStateView) => {
    noteState.current = state
  }, [])

  /** A wikilink in the note preview opens a lecture in the main column, keeping its real fragment. */
  const openLectureFromNote = useCallback((path: string, fragment?: LinkFragment) => {
    requestToken.current += 1
    setOpenLecture({
      path,
      token: requestToken.current,
      heading: fragment?.heading ?? null,
      blockId: fragment?.blockId ?? null,
    })
    setMode('classroom')
  }, [])

  /**
   * Build the annotation from a real lecture selection: the Host resolves the
   * file/heading link, and a note that is loading or has an unresolved conflict
   * refuses the append instead of overwriting either side.
   */
  async function annotateLecture(input: AnnotationSourceInput): Promise<{ ok: boolean; message: string }> {
    if (space === undefined) return { ok: false, message: '还没有打开学习空间，批注没有追加。' }
    const current = noteState.current
    if (current === null || current.path === '') {
      return { ok: false, message: '笔记还没准备好，批注没有追加。' }
    }
    if (current.spaceId !== space.id) {
      return { ok: false, message: '当前笔记属于另一个学习空间，批注没有追加。' }
    }
    if (current.status === 'loading') {
      return { ok: false, message: '笔记还没加载完，批注没有追加。' }
    }
    if (current.status === 'conflict') {
      return { ok: false, message: '笔记有未解决的保存冲突，批注没有追加。请先比较并处理冲突。' }
    }
    // Capture the target identity before the async Host resolution. A late
    // response for space A must never be delivered after the reader switched to
    // space B, even when both spaces share the same relative note path.
    const requestSpace = space
    const requestNote = current
    const requestSession = spaceSession.current
    const stillCurrent = (): boolean => alive.current
      && spaceSession.current === requestSession
      && spaceIdRef.current === requestSpace.id
      && noteState.current?.spaceId === requestSpace.id
      && noteState.current?.path === requestNote.path
    const result = await annotationBlockFor(api, requestSpace.id, requestSpace.directory, input, stillCurrent)
    if (!result.ok || result.block === undefined) {
      return { ok: false, message: result.message }
    }
    if (!stillCurrent()) {
      return { ok: false, message: '解析来源期间学习空间或笔记已切换，旧批注没有追加。' }
    }
    appendToken.current += 1
    setAppendRequest({
      token: appendToken.current,
      spaceId: requestSpace.id,
      block: result.block,
      path: requestNote.path,
    })
    return { ok: true, message: result.message }
  }

  return (
    <section className="lc-root" aria-label="学习课堂">
      <style>{styles}</style>
      <header className="lc-head">
        <div>
          <h1>学习课堂</h1>
          <p>{view?.vault.path ? `知识文件库：${view.vault.path}` : '把讲义、笔记和对话放在同一个学习空间里。'}</p>
        </div>
        {vaultStatus === 'ready' && !showVaultForm && (
          <button className="lc-secondary" disabled={busy} onClick={() => { setShowVaultForm(true); setVaultInput(view?.vault.path ?? '') }}>更换知识文件库</button>
        )}
      </header>

      {loadError !== '' && (
        <div className="lc-alert" role="alert">
          <p>无法读取学习课堂状态：{loadError}</p>
          <button className="lc-secondary" onClick={() => setReloadKey(key => key + 1)}>重试</button>
        </div>
      )}

      {view === null && loadError === '' && <p role="status">正在读取学习课堂…</p>}

      {error !== '' && <div className="lc-alert" role="alert">{error}</div>}

      {view !== null && vaultStatus === 'unset' && (
        <>
          <div className="lc-empty">
            <h2>选择知识文件库</h2>
            <p>先选一个已存在的本地目录作为知识文件库。它是所有学习空间的根目录，内容始终是普通文件。</p>
          </div>
          <VaultForm busy={busy} value={vaultInput} onChange={setVaultInput} onSubmit={() => { if (vaultInput.trim()) void run({ action: 'vault-choose', path: vaultInput.trim() }) }} />
        </>
      )}

      {view !== null && vaultStatus === 'unavailable' && (
        <>
          <div className="lc-alert" role="status">
            <p>{view.vault.reason ?? '知识文件库不可访问。'}</p>
            <p>{view.vault.hint}</p>
          </div>
          <VaultForm busy={busy} value={vaultInput} onChange={setVaultInput} onSubmit={() => { if (vaultInput.trim()) void run({ action: 'vault-choose', path: vaultInput.trim() }) }} />
        </>
      )}

      {view !== null && vaultStatus === 'ready' && showVaultForm && (
        <VaultForm busy={busy} value={vaultInput} onChange={setVaultInput} onSubmit={() => { if (vaultInput.trim()) void run({ action: 'vault-choose', path: vaultInput.trim() }) }} />
      )}

      {view !== null && vaultStatus === 'ready' && !showVaultForm && (
        <>
          <form className="lc-form" aria-label="创建学习空间" onSubmit={event => {
            event.preventDefault()
            const title = spaceTitle.trim()
            if (!title) return
            const goal = spaceGoal.trim()
            void run(goal === '' ? { action: 'space-create', title } : { action: 'space-create', title, goal })
          }}>
            <label>
              学习空间名称
              <input aria-label="学习空间名称" value={spaceTitle} disabled={busy} maxLength={120} onChange={event => setSpaceTitle(event.target.value)} placeholder="例如：线性代数" />
            </label>
            <label>
              学习目标（可选）
              <input aria-label="学习目标（可选）" value={spaceGoal} disabled={busy} maxLength={2000} onChange={event => setSpaceGoal(event.target.value)} placeholder="例如：能独立完成条件概率题" />
            </label>
            <button type="submit" disabled={busy || spaceTitle.trim() === ''}>创建学习空间</button>
            <p className="lc-hint">会在知识文件库根目录下建立一个同名文件夹，包含讲义、笔记、附件和学习目标文件。</p>
          </form>

          {space !== undefined
            ? (
              <>
                <div className="lc-view-tabs" role="tablist" aria-label="主内容视图">
                  <button
                    type="button"
                    role="tab"
                    className="lc-view-tab"
                    aria-selected={mode === 'classroom'}
                    disabled={busy}
                    onClick={() => setMode('classroom')}
                  >课堂</button>
                  <button
                    type="button"
                    role="tab"
                    className="lc-view-tab"
                    aria-selected={mode === 'canvas'}
                    disabled={busy}
                    onClick={() => { setCanvasMounted(true); setMode('canvas') }}
                  >脉络</button>
                </div>
                <div className="lc-main">
                  <ClassroomGrid
                    client={api}
                    view={view}
                    space={space}
                    busy={busy}
                    onOpen={spaceId => void run({ action: 'space-open', spaceId })}
                    openLecture={openLecture}
                    openNote={openNote}
                    sessions={sessions}
                    renderSlot={renderSlot}
                    SessionProvider={SessionProvider}
                    mainView={mode === 'canvas' ? 'canvas' : 'lecture'}
                    canvas={canvasMounted
                      ? (
                        <CanvasZone
                          client={api}
                          space={space}
                          vaultPath={view.vault.path}
                          busy={busy}
                          onOpenTarget={openCanvasTarget}
                          nativeOpen={nativeOpen}
                        />
                      )
                      : undefined}
                    onView={setView}
                    onLayoutChange={persistLayout}
                    onAnnotate={annotateLecture}
                    appendRequest={appendRequest}
                    onNoteState={handleNoteState}
                    onOpenLecture={openLectureFromNote}
                    askTeacher={askTeacher}
                    getConversation={getConversation}
                    questionContexts={questionContexts}
                    onRemoveContext={removeContext}
                    onDismissContext={dismissContext}
                    onComposer={publishComposer}
                  />
                </div>
              </>
            )
            : (
              <div className="lc-empty">
                <h2>{view.spaces.length === 0 ? '还没有学习空间' : '选择一个学习空间'}</h2>
                <p>{view.spaces.length === 0 ? '创建一个学习空间开始。文件夹会出现在知识文件库根目录下。' : '从上方输入框创建，或在课程目录里选择已有空间。'}</p>
                {view.spaces.length > 0 && (
                  <ul>
                    {view.spaces.map(row => <li key={row.id}><button className="lc-secondary" disabled={busy} onClick={() => void run({ action: 'space-open', spaceId: row.id })}>{row.title}</button></li>)}
                  </ul>
                )}
              </div>
            )}
        </>
      )}
    </section>
  )
}

interface SlotsContext {
  /** Public Session Controller face; the classroom owns and releases its own references. */
  sessions: SessionsLike
  /** Cordis service probe used for optional services such as `conversation`. */
  get?: (name: string) => unknown
  slots: {
    inject(name: string, install: () => unknown): unknown
    register(spec: Record<string, unknown>, component: unknown): unknown
  }
  effect(install: () => unknown): unknown
}

/** Waits for the client services this entry composes with. */
export const inject = ['slots', 'sessions']

/**
 * Public sidebar entry and main panel registration, same id for both.
 *
 * The main entry declares one Session child seat of this plugin's own name:
 * that is what makes the framework inject `SessionProvider` into the panel.
 * The seat entry then renders the native `conversation.content` Factory inside
 * that explicit Session binding. Neither registration imports a private Chat
 * component or opens the native Conversation page.
 *
 * `conversation` is probed, not injected: a Host composition without it still
 * renders the classroom, and the "ask the teacher" action reports the missing
 * seam instead of sending through anything else.
 */
export function apply(ctx: SlotsContext) {
  const sessions = ctx.sessions
  const getConversation = (): ConversationLike | undefined => {
    const service = typeof ctx.get === 'function' ? ctx.get('conversation') : undefined
    return typeof service === 'object' && service !== null ? service as ConversationLike : undefined
  }
  // `remote` is probed lazily: a Host composition without the public Session
  // Remote still renders the canvas with an honest native-open fallback.
  const nativeOpen = createNativeOpenSeam(
    () => (typeof ctx.get === 'function' ? ctx.get('remote') : undefined),
  )
  ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: panelId,
    inject: () => ({ sessions, getConversation, nativeOpen }),
    children: { [teacherSessionSeat]: { kind: 'single', scope: 'session' } },
  }, ClassroomPanel)))
  ctx.effect(() => ctx.slots.inject(teacherSessionSeat, () => ctx.slots.register(
    { name: teacherSessionSeat },
    TeacherConversationSeat,
  )))
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: panelId,
    order: 30,
    label: () => panelLabel,
  }, () => <span aria-hidden="true">学</span>)))
}
