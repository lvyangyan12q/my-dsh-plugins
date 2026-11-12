/**
 * The narrow adapter between the classroom and the Host's public composer.
 *
 * Two documented faces are used and nothing else:
 * - `ctx.conversation.input.requestDraftInitialization(binding, {
 *     prompt, whenDraftExists: 'append' })` appends a prompt as new paragraphs
 *   to the retained Session's existing draft without sending it.
 * - `ctx.conversation.input.for(scope)` reads that draft (`state`) and rewrites
 *   it only for the explicit "remove this context" action (`setDraft`).
 *
 * Neither face is invented here. When the Host does not provide them (older
 * composition, or the Session service is absent), the adapter reports that
 * plainly instead of falling back to a fake chat or a DOM textarea.
 */
import { removeContextBlock } from './question-context.ts'

/** The public Session reference fields this adapter needs. */
export interface ComposerSessionReference {
  readonly sessionId: string
  /** Public `SessionReference.binding`; the retained generation handle. */
  readonly binding?: unknown
}

/** Structural `SessionBinding` subset: identity plus the Session-scope ctx. */
interface SessionBindingLike {
  readonly sessionId: string
  readonly ctx?: unknown
}

/** Structural `InputState` subset published by the native composer. */
export interface ComposerDraftView {
  readonly draft: string
  readonly phase: string
  readonly occurrences: number
  /** A command chip is present (public `phase: 'claimed'` or its `claim`). */
  readonly claimed: boolean
}

/** Structural `SessionInput` subset: state currency plus explicit draft rewrite. */
interface SessionInputLike {
  readonly state?: {
    getSnapshot?: () => unknown
    subscribe?: (listener: () => void) => unknown
  }
  setDraft?: (text: string) => void
  focus?: () => void
}

/** Structural `conversation.input` subset. */
export interface ConversationInputLike {
  requestDraftInitialization?(
    binding: SessionBindingLike,
    options: { prompt?: string; whenDraftExists?: 'replace' | 'append' | 'keep'; clearPreviousDraft?: boolean },
  ): 'applied' | 'preserved' | 'blocked'
  for?(actx: unknown): SessionInputLike
}

export interface ConversationLike {
  readonly input?: ConversationInputLike
}

export type ComposerResult = { ok: true } | { ok: false; reason: string }

/** The per-space composer controls the classroom calls into. */
export interface ComposerFace {
  readonly spaceId: string
  /** The Host exposes the append seam right now. */
  available(): boolean
  /** Current native draft, or null when it cannot be read. */
  draft(): ComposerDraftView | null
  /** Observe draft changes; returns an unsubscribe noop when unavailable. */
  subscribe(listener: () => void): () => void
  append(block: string): ComposerResult
  /**
   * Remove one appended block. `knownBlocks` are the other context blocks the
   * page still owns: they are deducted before the unknown-quote check so a
   * second block's quoted excerpt does not make removal impossible. They are
   * never deleted by this call.
   */
  remove(block: string, knownBlocks?: readonly string[]): ComposerResult
}

export interface ComposerFaceOptions {
  spaceId: string
  reference: ComposerSessionReference
  /** Resolved lazily: client services may be provided after this plugin loads. */
  conversation: () => ConversationLike | undefined
}

const NO_SEAM = '宿主尚未提供原生输入接缝，无法追加到老师输入框。'
const SENDING = '老师会话正在发送，草稿暂时不能改动；等这一轮结束后再试。'
const CREATED_ONLY = '老师会话还没有准备好，未追加；请等会话就绪后再试。'

function messageOf(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : ''
  return message === '' ? '未知原因' : message
}

function isBinding(value: unknown): value is SessionBindingLike {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { sessionId?: unknown }
  return typeof candidate.sessionId === 'string'
}

function draftViewOf(input: SessionInputLike | undefined): ComposerDraftView | null {
  const state = input?.state?.getSnapshot?.()
  if (typeof state !== 'object' || state === null) return null
  const candidate = state as { draft?: unknown; phase?: unknown; occurrences?: unknown; claim?: unknown }
  if (typeof candidate.draft !== 'string' || typeof candidate.phase !== 'string') return null
  return {
    draft: candidate.draft,
    phase: candidate.phase,
    occurrences: Array.isArray(candidate.occurrences) ? candidate.occurrences.length : 0,
    // Contract: `claim` is present exactly while claimed/submitting. Treating
    // either signal as a command chip keeps a lagging phase from losing it.
    claimed: candidate.phase === 'claimed' || candidate.claim !== undefined,
  }
}

/** Build the adapter for one learning space's teacher Session. */
export function createComposerFace(options: ComposerFaceOptions): ComposerFace {
  const { spaceId, reference } = options
  const seam = (): ConversationInputLike | undefined => {
    const conversation = options.conversation()
    return conversation !== undefined && conversation !== null ? conversation.input : undefined
  }
  const input = (): SessionInputLike | undefined => {
    const resolver = seam()
    const binding = reference.binding
    if (typeof resolver?.for !== 'function' || !isBinding(binding) || binding.sessionId !== reference.sessionId) {
      return undefined
    }
    try {
      return resolver.for(binding.ctx)
    } catch {
      return undefined
    }
  }
  const binding = (): SessionBindingLike | undefined => {
    const candidate = reference.binding
    if (!isBinding(candidate) || candidate.sessionId !== reference.sessionId) return undefined
    return candidate
  }

  return {
    spaceId,

    available(): boolean {
      return typeof seam()?.requestDraftInitialization === 'function' && binding() !== undefined
    },

    draft(): ComposerDraftView | null {
      return draftViewOf(input())
    },

    subscribe(listener: () => void): () => void {
      const subscribe = input()?.state?.subscribe
      if (typeof subscribe !== 'function') return () => {}
      const unsubscribe = subscribe(listener)
      return typeof unsubscribe === 'function' ? unsubscribe as () => void : () => {}
    },

    append(block: string): ComposerResult {
      const resolver = seam()
      if (resolver === undefined || typeof resolver.requestDraftInitialization !== 'function') {
        return { ok: false, reason: NO_SEAM }
      }
      const retained = binding()
      if (retained === undefined) return { ok: false, reason: CREATED_ONLY }
      if (block.trim() === '') return { ok: false, reason: '没有可追加的上下文。' }
      let result: 'applied' | 'preserved' | 'blocked'
      try {
        // `append` keeps the learner's own text and adds the block as new
        // paragraphs; it never sends and never replaces the draft.
        result = resolver.requestDraftInitialization(retained, { prompt: block, whenDraftExists: 'append' })
      } catch (error) {
        return { ok: false, reason: `未能追加到原生草稿：${messageOf(error)}` }
      }
      if (result === 'applied') {
        try { input()?.focus?.() } catch { /* Focus is optional and never proves the append. */ }
        return { ok: true }
      }
      if (result === 'preserved') return { ok: false, reason: '宿主保留了原草稿，没有追加；请检查老师输入框后重试。' }
      if (result === 'blocked') return { ok: false, reason: '老师会话正在发送或已关闭，草稿未改动；请等这一轮结束后再试。' }
      return { ok: false, reason: '宿主返回了未知结果，未确认追加；请检查老师输入框。' }
    },

    remove(block: string, knownBlocks: readonly string[] = []): ComposerResult {
      const target = input()
      if (target === undefined) return { ok: false, reason: '无法读取老师输入框的当前草稿，未移除。' }
      const view = draftViewOf(target)
      if (view === null) return { ok: false, reason: '无法读取老师输入框的当前草稿，未移除。' }
      if (view.claimed) {
        return { ok: false, reason: '草稿里还有命令 chip；整体改写会丢掉它，请先取消命令或手动删除这段上下文。' }
      }
      if (view.phase !== 'plain') return { ok: false, reason: SENDING }
      if (view.occurrences > 0) {
        return { ok: false, reason: '草稿里已有引用标签；整体改写会丢掉它们，请手动删除这段上下文。' }
      }
      const removal = removeContextBlock(view.draft, block)
      if (removal.status === 'missing') {
        return { ok: false, reason: '草稿里已经找不到这段上下文（可能已发送或被手动编辑）。' }
      }
      if (removal.status === 'ambiguous') {
        return { ok: false, reason: '草稿里有多个相同的上下文块，无法确定移除哪一个；请手动删除。' }
      }
      // Native quotes are absent from the public `occurrences` state and the
      // Host exposes no local deletion; `setDraft` clears the editor root, which
      // would flatten a quote into ordinary text. Every native quote projects as
      // Markdown blockquote text, so any blockquote line we cannot account for
      // means structural loss cannot be ruled out.
      //
      // Other context blocks this page appended are accounted for: deduct each
      // unchanged, unique known block before looking for unknown blockquotes.
      // They are only deducted from this analysis string, never from the draft.
      let analysis = removal.draft
      for (const known of knownBlocks) {
        if (known === '' || known === block) continue
        const at = analysis.indexOf(known)
        if (at < 0) continue
        if (analysis.indexOf(known, at + known.length) >= 0) {
          return { ok: false, reason: '草稿里有重复的上下文块，无法确认其余内容未被改动；请手动删除这段上下文。' }
        }
        analysis = analysis.slice(0, at) + analysis.slice(at + known.length)
      }
      if (analysis.includes('> ')) {
        return {
          ok: false,
          reason: '草稿里还有引用样式的内容（可能是原生引用块）；宿主没有公开的局部删除接口，整体改写会破坏引用结构。请手动删除这段上下文。',
        }
      }
      if (typeof target.setDraft !== 'function') {
        return { ok: false, reason: '宿主没有提供改写草稿的接缝，未移除。' }
      }
      try {
        target.setDraft(removal.draft)
      } catch (error) {
        return { ok: false, reason: `移除失败：${messageOf(error)}` }
      }
      const after = draftViewOf(target)
      if (after === null || after.draft !== removal.draft) {
        return { ok: false, reason: '移除后草稿与预期不一致，请检查老师输入框。' }
      }
      return { ok: true }
    },
  }
}
