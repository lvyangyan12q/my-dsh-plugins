import { currentSessionOf } from './sessionCompat'

export type AnnotationInsertion = { insert(text: string): void }
type InputActions = {
  captureInsertion(): { start: number; end: number; draftRev: number }
  insertText(text: string, span: { start: number; end: number; draftRev: number }): boolean
}

/** Holds only public mounted input faces; never creates another editor. */
export function createAnnotationInput(bridge: any) {
  const owners = new Map<string, { actions: InputActions; binding: any }>()
  let disposed = false
  const retry = (reason: string): never => { throw new Error(reason + '；标注要求已保留，请返回原会话并重新开始标注。') }
  return {
    mount(sessionId: string, actions: InputActions) {
      const owner = { actions, binding: bridge.sessions.binding(sessionId) }
      if (!disposed) owners.set(sessionId, owner)
      return () => { if (owners.get(sessionId) === owner) owners.delete(sessionId) }
    },
    capture(): AnnotationInsertion {
      const id = currentSessionOf(bridge.sessions.list.getSnapshot())
      const owner = owners.get(id)
      if (disposed || !owner || !owner.binding || owner.binding.sessionId !== id
        || bridge.sessions.binding(id) !== owner.binding) return retry('原生输入槽或会话代已不可用')
      const input = bridge.conversation.input.for(bridge.sessions.scope(id))
      const captured = owner.actions.captureInsertion()
      if (!Number.isInteger(captured.end) || captured.end < 0 || !Number.isInteger(captured.draftRev)
        || input.state.getSnapshot().draftRev !== captured.draftRev) return retry('原生光标捕获已过期')
      const span = { start: captured.end, end: captured.end, draftRev: captured.draftRev }
      let attempted = false
      return { insert(text: string) {
        if (attempted) return retry('此位置已经尝试插入，不能重复执行')
        if (disposed || owners.get(id) !== owner) return retry('原生输入槽已关闭或重建')
        if (currentSessionOf(bridge.sessions.list.getSnapshot()) !== id
          || bridge.sessions.binding(id) !== owner.binding) return retry('原生会话或会话代已变化')
        const state = input.state.getSnapshot()
        if (state.draftRev !== span.draftRev || !['plain', 'claimed'].includes(state.phase)) return retry('原生草稿已变化或正在提交')
        // Once the public mutation is called, even an exception cannot retry it.
        attempted = true
        let inserted = false
        try { inserted = owner.actions.insertText(text, span) === true }
        catch { return retry('原生输入执行结果不明，请先检查草稿') }
        if (!inserted) return retry('原生输入拒绝插入')
        try { input.focus() } catch {}
      } }
    },
    dispose() { disposed = true; owners.clear() },
  }
}

/** Append annotations without sending or replacing existing reference chips. */
export function appendHostInput(bridge: any, text: string, doc: Document = document): boolean {
  try {
    const resolver = bridge?.conversation?.input
    if (typeof resolver?.for === 'function') {
      const snapshot = bridge.sessions?.list?.getSnapshot?.()
      const id = currentSessionOf(snapshot)
      const scope = id ? bridge.sessions?.scope?.(id) : null
      if (!scope) return false
      const input = resolver.for(scope)
      const state = input?.state?.getSnapshot?.()
      if (!state || typeof state.draft !== 'string' || !Number.isInteger(state.draftRev)
        || !['plain', 'claimed'].includes(state.phase) || !Array.isArray(state.occurrences)) return false
      if (typeof resolver.requestDraftInitialization === 'function') {
        // rc.3 owns the full semantic document. InputState expands quote and
        // command chips too, so its reference-only occurrences cannot recover
        // an insertion span. Let the public owner append to the exact retained
        // generation, preserving chips and attachments without flattening.
        const binding = bridge.sessions?.binding?.(id)
        if (!binding || binding.sessionId !== id) return false
        const inserted = resolver.requestDraftInitialization(binding, {
          prompt: text, whenDraftExists: 'append',
        }) === 'applied'
        // Never retry a blocked/preserved/unknown result using another path.
        if (inserted) { try { input.focus?.() } catch {} }
        return inserted
      }
      // DSH 0.1's current-based list uses display-text coordinates. DSH 0.2's
      // mainView list uses one U+FFFC unit per chip in insertion coordinates.
      const compactReferences = typeof snapshot?.current !== 'string'
      let end = state.draft.length
      let previousEnd = 0
      for (const item of state.occurrences) {
        if (!Number.isInteger(item.offset) || !Number.isInteger(item.length)
          || item.length < 0 || item.offset < previousEnd
          || item.offset + item.length > state.draft.length) return false
        previousEnd = item.offset + item.length
        if (compactReferences) end += 1 - item.length
      }
      const span = { start: end, end, draftRev: state.draftRev }
      const addition = (state.draft.trim() ? '\n\n' : '') + text
      // Public action face provides revision/phase guards and an undo boundary.
      // The scoped event is the public compatibility path when actions are absent.
      const inserted = typeof input.actions?.insertText === 'function'
        ? input.actions.insertText(addition, span) === true
        : scope.bail?.('slash/input-insert-text', { text: addition, span }) === true
      if (inserted) { try { input.focus?.() } catch {} }
      return inserted
    }
    // Legacy DSH 0.1 textarea. Never select an arbitrary textarea: it may be
    // the annotation editor itself or an open Worktable file editor.
    const ta = doc.querySelector<HTMLTextAreaElement>('textarea[data-phase]')
    if (!ta || ta.disabled || ta.readOnly || ta.closest('.dsh-wt_annotUi')) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    const next = ta.value && ta.value.trim() ? ta.value + '\n\n' + text : text
    if (setter) setter.call(ta, next)
    else ta.value = next
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    try {
      ta.focus()
      ta.dispatchEvent(new Event('change', { bubbles: true }))
      ta.setSelectionRange(ta.value.length, ta.value.length)
    } catch {}
    return true
  } catch { return false }
}
