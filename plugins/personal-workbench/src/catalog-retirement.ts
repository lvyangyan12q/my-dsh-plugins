import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

const storageKey = 'personal-workbench/catalog-retirement/v1'
const catalogKind = 'personal-workbench.catalog'
interface RetirementResult {
  readonly outcome: 'complete' | 'partial' | 'not-found' | 'persistence-unavailable' | 'service-unavailable' | 'in-progress'
  readonly records: readonly { readonly sessionId: string; readonly tabId?: string; readonly outcome: string }[]
}
// An additive public capability: the published rc.2 face does not yet promise it.
type NativeSidebar = Pick<Context['sidebarRight'], 'openTabs' | 'mounted' | 'closeIn'> & {
  readonly retirementVersion?: number
  readonly retireTabsByKind?: (kind: string) => RetirementResult
}
type RetiredTab = Pick<ReturnType<NativeSidebar['openTabs']['getSnapshot']>[number], 'sessionId' | 'tabId'>
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

/** Own retirement markers only; native saved layouts remain the controller's authority. */
export class CatalogRetirement {
  private pending: RetiredTab[] = []
  private requested = false
  private providerActive = false
  private native?: NativeSidebar
  private cleaning = false
  private storageUnavailable = false
  constructor(private readonly storage: Storage, private readonly report: (pending: boolean) => void) {
    try {
      const raw = storage.getItem(storageKey)
      if (raw !== null) {
        if (raw.length > 131072) throw new Error('Oversized retirement record')
        const value: unknown = JSON.parse(raw)
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid retirement record')
        const record = value as Record<string, unknown>
        if ((record.version !== 1 && record.version !== 2)
          || Object.keys(record).length !== (record.version === 1 ? 2 : 3)
          || (record.version === 2 && typeof record.requested !== 'boolean')
          || !Array.isArray(record.tabs) || record.tabs.length > 256) throw new Error('Invalid retirement record')
        for (const tab of record.tabs) {
          if (!tab || typeof tab !== 'object' || Array.isArray(tab) || Object.keys(tab).length !== 2
            || typeof tab.sessionId !== 'string' || !tab.sessionId || tab.sessionId.length > 512
            || typeof tab.tabId !== 'string' || !tab.tabId || tab.tabId.length > 512) throw new Error('Invalid retirement identity')
        }
        this.pending = record.tabs
        this.requested = record.version === 2 ? record.requested === true : this.pending.length > 0
      }
    } catch { this.storageUnavailable = true }
  }
  attach(native: NativeSidebar): () => void {
    this.native = native
    const unsubscribeInventory = native.openTabs.subscribe(this.retry)
    const unsubscribeMounted = native.mounted.subscribe(this.retry)
    this.retry()
    return () => {
      unsubscribeInventory()
      unsubscribeMounted()
      if (this.native === native) this.native = undefined
    }
  }
  /** A new registration may create fresh occurrences; do not run a previous kind-wide retry against them. */
  resume(): void { this.providerActive = true }
  retire(): void {
    this.providerActive = false
    this.requested = true
    for (const tab of this.native?.openTabs.getSnapshot() ?? []) {
      if (tab.kind !== catalogKind || this.pending.some(row => row.sessionId === tab.sessionId && row.tabId === tab.tabId)) continue
      if (this.pending.length < 256 && tab.sessionId.length <= 512 && tab.tabId.length <= 512) this.pending.push({ sessionId: tab.sessionId, tabId: tab.tabId })
      else this.storageUnavailable = true
    }
    this.persist()
    this.retry()
    if (!this.native) this.report(true)
  }
  private persist(): void {
    try {
      const raw = JSON.stringify({ version: 2, requested: this.requested, tabs: this.pending })
      if (raw.length > 131072) throw new Error('Oversized retirement record')
      this.storage.setItem(storageKey, raw)
      if (this.storage.getItem(storageKey) !== raw) throw new Error('Retirement marker read-back failed')
      this.storageUnavailable = false
    }
    catch { this.storageUnavailable = true }
  }
  readonly retry = (): void => {
    if (this.cleaning || !this.native) return
    this.cleaning = true
    try {
      if (this.requested && this.native.retirementVersion === 1 && typeof this.native.retireTabsByKind === 'function') {
        if (this.providerActive) { this.report(true); return }
        try {
          const result = this.native.retireTabsByKind(catalogKind)
          if (result.outcome === 'complete' || result.outcome === 'not-found') {
            this.pending = []
            this.requested = false
          }
        } catch { /* A failed public command never proves durable removal. */ }
        this.persist()
        this.report(this.requested || this.storageUnavailable)
        return
      }
      for (const row of this.pending) {
        const tab = this.native.openTabs.getSnapshot().find(tab => tab.sessionId === row.sessionId && tab.tabId === row.tabId)
        // Stale ids must never close a tab now owned by another provider.
        if (tab?.kind !== catalogKind) continue
        try { this.native.closeIn(tab.sessionId, tab.tabId) }
        catch { /* Close handlers may refuse removal. Keep the marker and retry on a public change. */ }
      }
      const remaining = this.native.openTabs.getSnapshot()
      this.pending = this.pending.filter(row => remaining.some(tab => tab.kind === catalogKind && tab.sessionId === row.sessionId && tab.tabId === row.tabId))
      // Adopted-only close cannot certify dormant persistence or undo retirement.
      this.persist()
      this.report(this.requested || this.pending.length > 0 || this.storageUnavailable)
    } finally { this.cleaning = false }
  }
}
