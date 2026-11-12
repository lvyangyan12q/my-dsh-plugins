import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ClassroomClient } from './classroom-client.ts'
import type { ClassroomSpaceView, ClassroomView } from './contract.ts'
import { createComposerFace, type ComposerDraftView, type ComposerFace } from './composer.ts'
import type { ConversationLike } from './composer.ts'
import { QuestionContextBar } from './question-bar.tsx'
import type { AskQuestionResult, AskedContext } from './question-context.ts'

/**
 * Reference source for this plugin's own teacher Sessions. It is deliberately
 * not `mainView`: the classroom owns these references and must release them
 * without touching the native Conversation selection. A host-typed consumer
 * declares this label through `SessionReferenceSourceMap`; this plugin keeps a
 * structural client view, so runtime ownership is only the source label.
 */
export const teacherSessionSource = 'personalLearning'

/**
 * The plugin's own session child seat. The main classroom entry declares it so
 * the framework injects a `SessionProvider`; the conversation content Factory
 * is then rendered inside that explicit Session binding. It must be a slot key
 * this plugin declares itself — child keys of the native Conversation Factory
 * are single-declarer and cannot be claimed twice.
 */
export const teacherSessionSeat = 'learningClassroom.teacherSession'

/** One owned Session reference, narrowed to what the classroom actually uses. */
export interface SessionReferenceLike {
  readonly sessionId: string
  readonly ready: Promise<unknown>
  /** Public Session binding handle; the composer seam is addressed through it. */
  readonly binding?: unknown
  release(): void
}

export interface SessionRetainOptionsLike {
  source: string
  signal?: AbortSignal
}

/** The public `ctx.sessions` face this plugin consumes. */
export interface SessionsLike {
  create(options: { cwd?: string; workspaceId?: string; agentPreset?: string }): Promise<string>
  retain(id: string, options: SessionRetainOptionsLike): SessionReferenceLike
}

/** Framework-injected `SessionProvider` seat, rendered with an explicit reference. */
export type SessionProviderLike = (props: { session: SessionReferenceLike; children?: ReactNode }) => ReactNode

/** Framework-injected `renderSlot` for the entry that declares the seat. */
export type RenderSlotLike = (name: string, owner?: object) => ReactNode

/** Framework-injected `renderFactorySlot` for every renderer-created component. */
export type RenderFactorySlotLike = (
  name: string,
  props: Record<string, unknown>,
  options?: object,
) => ReactNode

/** Standard Session snapshot fields used to derive the embedded presentation phase. */
interface SessionSnapshotLike {
  blank?: boolean
  awaitingFirstTurn?: boolean
  running?: boolean
  promptAttempted?: boolean
  openState?: string
}

interface ConversationSnapshotLike {
  activeTargets?: ReadonlySet<string> | readonly string[]
}

export interface TeacherConversationSeatProps {
  /** Current Session identity, supplied by the strict session scope. */
  sessionId?: string
  /** Session lifecycle selector from the standard Session props. */
  useSession?: (selector: (snapshot: SessionSnapshotLike | undefined) => unknown) => unknown
  /** Conversation assembly selector from ui-conversation's Session source. */
  useConversation?: (selector: (snapshot: ConversationSnapshotLike | undefined) => unknown) => unknown
  renderFactorySlot?: RenderFactorySlotLike
}

/**
 * Derive the embedded presentation phase from the same public Session facts the
 * native shell uses, without importing the private conversation helper: an
 * open history-load is `settling`, a blank Session is `hero`, anything with a
 * turn or prompt attempt is `active`.
 */
export function embeddedPhase(session: SessionSnapshotLike | undefined, conversation: ConversationSnapshotLike | undefined): 'settling' | 'hero' | 'active' {
  const targets = conversation?.activeTargets
  const targetActive = targets !== undefined && 'size' in targets && targets.size > 0
  const sessionActive = session !== undefined
    && ((session.blank === false && session.awaitingFirstTurn === false) || session.running === true)
  const active = targetActive || sessionActive
  const settling = !active && session?.openState === 'loading' && session?.promptAttempted !== true
  if (settling) return 'settling'
  if (active || session?.promptAttempted === true) return 'active'
  return 'hero'
}

const NO_SESSION: (selector: (snapshot: SessionSnapshotLike | undefined) => unknown) => unknown =
  selector => selector(undefined)
const NO_CONVERSATION: (selector: (snapshot: ConversationSnapshotLike | undefined) => unknown) => unknown =
  selector => selector(undefined)

/**
 * Render the real native Conversation inside the classroom. The Factory owns
 * the native message list, streaming output, tool presentation, Stop button,
 * questions and approvals; this component renders no message list and no
 * second composer.
 *
 * `hero` is always false here: the native blank home would show its workspace
 * switcher, and a classroom teacher Session is bound to a learning space, not
 * to a movable native workspace.
 */
export function TeacherConversationSeat(props: TeacherConversationSeatProps) {
  // Both seats are framework-injected for a session-scope entry; the fallbacks
  // keep the call order stable when a composition lacks ui-conversation.
  const useSession = props.useSession ?? NO_SESSION
  const useConversation = props.useConversation ?? NO_CONVERSATION
  const session = useSession(selector => selector) as SessionSnapshotLike | undefined
  const conversation = useConversation(selector => selector) as ConversationSnapshotLike | undefined
  const phase = embeddedPhase(session, conversation)
  if (props.renderFactorySlot === undefined) {
    return <p role="alert">老师会话界面不可用：缺少会话内容渲染能力，未显示替代聊天。</p>
  }
  return (
    <div className="lc-teacher-session" data-session={props.sessionId}>
      {props.renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero: false }, {
        fallback: <p role="alert">老师会话内容组件不可用：宿主没有组合原生会话内容，未显示替代聊天。</p>,
      })}
    </div>
  )
}

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : ''
  return message === '' ? '老师会话操作失败。' : message
}

type ZonePhase = 'unavailable' | 'idle' | 'creating' | 'connecting' | 'ready' | 'error'

export interface TeacherSessionZoneProps {
  space: ClassroomSpaceView
  client: ClassroomClient
  sessions?: SessionsLike
  renderSlot?: RenderSlotLike
  SessionProvider?: SessionProviderLike
  /** Applies a Host view returned by the session binding command. */
  onView?: (view: ClassroomView) => void
  /** Resolves the public `conversation` service lazily; absent means no seam. */
  getConversation?: () => ConversationLike | undefined
  /** Publishes the per-space composer controls while this zone owns the Session. */
  onComposer?: (face: ComposerFace | null) => void
  /** Context blocks appended in this space, shown above the native composer. */
  questionContexts?: readonly AskedContext[]
  /** Takes one context block back out of the native draft. */
  onRemoveContext?: (id: string) => Promise<AskQuestionResult>
  /** Forgets one block that is no longer in the draft. */
  onDismissContext?: (id: string) => void
}

/**
 * Owns one space's teacher-Session reference: create on explicit open, persist
 * the binding through the classroom Host command, retain on every visit, and
 * release on leave/switch/failure. Releasing never cancels a Host turn — only
 * the native Stop control may do that.
 */
export function TeacherSessionZone(props: TeacherSessionZoneProps) {
  const { space, client, sessions, renderSlot, SessionProvider, onView, getConversation, onComposer } = props
  const [boundId, setBoundId] = useState<string | null>(space.sessionId)
  const [phase, setPhase] = useState<ZonePhase>(() => sessions === undefined
    ? 'unavailable'
    : space.sessionId === null ? 'idle' : 'connecting')
  const [error, setError] = useState('')
  const [reference, setReference] = useState<SessionReferenceLike | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [unsavedId, setUnsavedId] = useState<string | null>(null)
  // Bumped by the native draft's own subscription. The draft itself is read
  // during render so mounting this zone does not cause a second seat render.
  const [, setDraftTick] = useState(0)
  const active = useRef<SessionReferenceLike | null>(null)
  const unsaved = useRef<string | null>(null)
  const creating = useRef(false)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  // The Host view stays authoritative: a binding recorded elsewhere (or
  // restored on load) becomes this zone's Session when nothing local is unsaved.
  useEffect(() => {
    if (space.sessionId !== null && space.sessionId !== boundId && unsaved.current === null) {
      setBoundId(space.sessionId)
    }
  }, [space.sessionId, boundId])

  useEffect(() => {
    if (sessions === undefined) {
      setPhase('unavailable')
      return
    }
    if (boundId === null) {
      setPhase('idle')
      return
    }
    const controller = new AbortController()
    let disposed = false
    let owned: SessionReferenceLike
    setPhase('connecting')
    setError('')
    setReference(null)
    try {
      owned = sessions.retain(boundId, { source: teacherSessionSource, signal: controller.signal })
    } catch (cause) {
      setPhase('error')
      setError(messageOf(cause))
      return
    }
    active.current = owned
    owned.ready.then(() => {
      if (disposed) return
      setReference(owned)
      setPhase('ready')
    }, cause => {
      if (disposed || controller.signal.aborted) return
      if (active.current === owned) active.current = null
      owned.release()
      setReference(null)
      setPhase('error')
      setError(messageOf(cause))
    })
    return () => {
      disposed = true
      controller.abort()
      if (active.current === owned) {
        active.current = null
        owned.release()
      }
      if (alive.current) setReference(null)
    }
  }, [sessions, boundId, attempt])

  // The composer controls are rebuilt only when the retained reference changes.
  // A missing `conversation` service is reported by the face itself, never
  // papered over with a second input.
  const face = useMemo<ComposerFace | null>(() => reference === null ? null : createComposerFace({
    spaceId: space.id,
    reference,
    conversation: () => getConversation?.(),
  }), [reference, space.id, getConversation])

  useEffect(() => {
    onComposer?.(face)
    return () => { onComposer?.(null) }
  }, [face, onComposer])

  useEffect(() => {
    if (face === null) return
    return face.subscribe(() => setDraftTick(tick => tick + 1))
  }, [face])

  const composerDraft: ComposerDraftView | null = face === null ? null : face.draft()

  const persist = async (sessionId: string): Promise<void> => {
    const next = await client.command({ action: 'session-open', spaceId: space.id, sessionId })
    if (!alive.current) return
    unsaved.current = null
    setUnsavedId(null)
    onView?.(next)
    setBoundId(sessionId)
  }

  const open = async (): Promise<void> => {
    if (sessions === undefined || creating.current) return
    if (unsaved.current !== null) {
      creating.current = true
      setPhase('creating')
      setError('')
      try {
        await persist(unsaved.current)
      } catch (cause) {
        if (!alive.current) return
        setPhase('error')
        setError(`老师会话已创建，但还没有保存到学习空间：${messageOf(cause)}`)
      } finally {
        creating.current = false
      }
      return
    }
    if (space.cwd === null) {
      setPhase('error')
      setError('学习空间目录不可用，无法创建老师会话；请重新选择知识文件库。')
      return
    }
    creating.current = true
    setPhase('creating')
    setError('')
    try {
      const created = await sessions.create({ cwd: space.cwd, agentPreset: 'standard' })
      // Persist even when the user already switched spaces: the Session exists
      // on the Host now, so dropping its binding would strand it.
      unsaved.current = created
      if (alive.current) setUnsavedId(created)
      try {
        await persist(created)
      } catch (cause) {
        if (!alive.current) return
        setPhase('error')
        setError(`老师会话已创建，但还没有保存到学习空间：${messageOf(cause)}`)
      }
    } catch (cause) {
      if (!alive.current) return
      setPhase('error')
      setError(messageOf(cause))
    } finally {
      creating.current = false
    }
  }

  const retry = (): void => {
    if (unsaved.current !== null || boundId === null) {
      void open()
      return
    }
    setAttempt(value => value + 1)
  }

  return (
    <div className="lc-session-zone" aria-label="老师会话">
      {props.questionContexts !== undefined && (
        <QuestionContextBar
          contexts={props.questionContexts}
          draft={composerDraft?.draft ?? null}
          onRemove={props.onRemoveContext ?? (async () => ({ ok: false, reason: '还没有连接移除动作。' }))}
          onDismiss={props.onDismissContext ?? (() => {})}
        />
      )}
      {phase === 'unavailable' && (
        <p role="alert">老师会话服务不可用。请刷新页面后重试。</p>
      )}

      {phase === 'idle' && (
        <div className="lc-session-empty">
          <p>打开老师会话后，可以在这里直接向老师提问。会话是真实 DSH 会话，带着标准预设与工具。</p>
          <button type="button" className="lc-secondary" onClick={() => void open()}>打开老师会话</button>
          <p className="lc-hint">打开会在当前学习空间里创建一个标准预设会话，并记住它的绑定。</p>
          <p className="lc-hint">
            边界说明：插件自己的生成工具只写当前主题的「讲义/」，不写个人笔记；但老师会话仍是标准 DSH 会话，
            它的通用文件/终端工具由宿主执行，可能改写学习空间里的其他文件。「AI 不改我的笔记」是教学约定，
            不是本插件能保证的全局权限隔离。
          </p>
        </div>
      )}

      {phase === 'creating' && <p role="status">正在创建老师会话…</p>}
      {phase === 'connecting' && <p role="status">正在恢复老师会话…</p>}

      {phase === 'error' && (
        <div className="lc-session-error" role="alert">
          <p>{error}</p>
          {unsavedId !== null && (
            <p className="lc-hint">会话已创建，但绑定尚未保存；重试只重新保存，不会新建第二个会话。</p>
          )}
          <button type="button" className="lc-secondary" onClick={retry}>重试</button>
        </div>
      )}

      {phase === 'ready' && reference !== null && (
        SessionProvider === undefined || renderSlot === undefined
          ? <p role="alert">老师会话界面不可用：缺少会话渲染位置，未显示替代聊天。</p>
          : (
            <div className="lc-session-body">
              <SessionProvider session={reference}>{renderSlot(teacherSessionSeat, {})}</SessionProvider>
            </div>
          )
      )}
    </div>
  )
}
