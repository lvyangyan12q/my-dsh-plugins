import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'

const storageKey = 'personal-workbench/catalog-retirement/v1'
const catalogKind = 'personal-workbench.catalog'
type NativeSidebar = Pick<Context['sidebarRight'], 'openTabs' | 'mounted' | 'closeIn'>
type RetiredTab = Pick<ReturnType<NativeSidebar['openTabs']['getSnapshot']>[number], 'sessionId' | 'tabId'>
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>

/** Own retirement markers only; native saved layouts remain the controller's authority. */
export class CatalogRetirement {
  private pending: RetiredTab[] = []
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
        if (record.version !== 1 || Object.keys(record).length !== 2 || !Array.isArray(record.tabs) || record.tabs.length > 256) throw new Error('Invalid retirement record')
        for (const tab of record.tabs) {
          if (!tab || typeof tab !== 'object' || Array.isArray(tab) || Object.keys(tab).length !== 2
            || typeof tab.sessionId !== 'string' || !tab.sessionId || tab.sessionId.length > 512
            || typeof tab.tabId !== 'string' || !tab.tabId || tab.tabId.length > 512) throw new Error('Invalid retirement identity')
        }
        this.pending = record.tabs
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
  retire(): void {
    for (const tab of this.native?.openTabs.getSnapshot() ?? []) {
      if (tab.kind !== catalogKind || this.pending.some(row => row.sessionId === tab.sessionId && row.tabId === tab.tabId)) continue
      if (this.pending.length < 256 && tab.sessionId.length <= 512 && tab.tabId.length <= 512) this.pending.push({ sessionId: tab.sessionId, tabId: tab.tabId })
      else this.storageUnavailable = true
    }
    this.persist()
    this.retry()
  }
  private persist(): void {
    try {
      const raw = JSON.stringify({ version: 1, tabs: this.pending })
      if (raw.length > 131072) throw new Error('Oversized retirement record')
      this.storage.setItem(storageKey, raw)
    }
    catch { this.storageUnavailable = true }
  }
  readonly retry = (): void => {
    if (this.cleaning || !this.native) return
    this.cleaning = true
    try {
      for (const row of this.pending) {
        const tab = this.native.openTabs.getSnapshot().find(tab => tab.sessionId === row.sessionId && tab.tabId === row.tabId)
        // Stale ids must never close a tab now owned by another provider.
        if (tab?.kind !== catalogKind) continue
        try { this.native.closeIn(tab.sessionId, tab.tabId) }
        catch { /* Close handlers may refuse removal. Keep the marker and retry on a public change. */ }
      }
      const remaining = this.native.openTabs.getSnapshot()
      this.pending = this.pending.filter(row => remaining.some(tab => tab.kind === catalogKind && tab.sessionId === row.sessionId && tab.tabId === row.tabId))
      this.persist()
      this.report(this.pending.length > 0 || this.storageUnavailable)
    } finally { this.cleaning = false }
  }
}
