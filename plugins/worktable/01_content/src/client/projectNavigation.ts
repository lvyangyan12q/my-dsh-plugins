/** DSH UI navigation ownership. No business state or native Session creation. */
export function createProjectNavigation(env: {
  getLayout(): any
  hasAnchor(): boolean
  reveal(id: string): any
  waitForAnchor(signal?: AbortSignal): Promise<boolean>
  report(error: Error): void
}) {
  let generation = 0
  let disposed = false
  let pending: AbortController | undefined
  const cancel = () => { generation++; pending?.abort(); pending = undefined }
  return {
    close({ restore, previousSessionId }: { restore: boolean; previousSessionId?: string | null }) {
      cancel()
      if (restore && previousSessionId && !disposed) {
        try { void Promise.resolve(env.reveal(previousSessionId)).catch(env.report) } catch (error) { env.report(error as Error) }
      }
    },
    async open(existingSessionId: string | null | undefined, mount: () => void): Promise<boolean> {
      cancel()
      if (disposed) return false
      const mine = generation
      const owner = pending = new AbortController()
      let signal = owner.signal
      const valid = () => !disposed && mine === generation && !signal.aborted
      try {
        const layout = env.getLayout()
        const globalPanel = layout?.panelInfo?.getSnapshot?.()?.activePanelId
        if (!env.hasAnchor() || globalPanel != null) {
          if (!existingSessionId) throw new Error('没有可用的原生会话。请先从原生会话列表选择已有对话，再打开项目。')
          const revealed = env.reveal(existingSessionId)
          // reveal itself selects the conversation and aborts older native navigation.
          // Claim the following anchor wait only after that synchronous transition.
          const nativeSignal = layout?.beginNavigation?.()
          if (nativeSignal) {
            if (nativeSignal.aborted) return false
            nativeSignal.addEventListener('abort', () => owner.abort(), { once: true, signal: owner.signal })
          }
          await revealed
          if (!valid()) return false
          if (!await env.waitForAnchor(signal) || !valid()) {
            if (valid()) throw new Error('原生对话视图尚未就绪，请重新打开项目；原会话和布局已保留。')
            return false
          }
        }
        if (!valid()) return false
        mount()
        return true
      } catch (error) {
        if (valid()) env.report(error instanceof Error ? error : new Error(String(error)))
        return false
      } finally {
        if (pending === owner) { owner.abort(); pending = undefined }
      }
    },
    dispose() { disposed = true; cancel() },
  }
}

/** Wait for the native renderer, with cleanup on every outcome. */
export function waitForConversationAnchor(hasAnchor: () => boolean, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false)
  if (hasAnchor()) return Promise.resolve(true)
  return new Promise(resolve => {
    let settled = false
    const finish = (ready: boolean) => {
      if (settled) return
      settled = true
      observer.disconnect()
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve(ready)
    }
    const abort = () => finish(false)
    const observer = new MutationObserver(() => { if (hasAnchor()) finish(true) })
    const timer = setTimeout(() => finish(false), 2500)
    signal?.addEventListener('abort', abort, { once: true })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-phase'] })
    if (signal?.aborted) finish(false)
    else if (hasAnchor()) finish(true)
  })
}
