import type { DisplayData, DisplayRecord, DisplayScope, DisplaySource } from './display-api.ts'

export interface DisplaySnapshot { phase: 'loading' | 'ready' | 'error'; data: DisplayData; filters: Record<string, string>; search: string; selectedId?: string; error?: string }
const empty = (): DisplayData => ({ records: [], filters: [], stats: [] })
function validData(data: DisplayData) {
  if (!data || !Array.isArray(data.records) || !Array.isArray(data.filters) || !Array.isArray(data.stats) || data.records.length > 10000) return false
  const scalar = (value: unknown) => value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)
  return data.records.every(record => record && typeof record.id === 'string' && record.id.length > 0 && typeof record.title === 'string' && (record.subtitle === undefined || typeof record.subtitle === 'string') && record.fields && typeof record.fields === 'object' && !Array.isArray(record.fields) && Object.values(record.fields).every(scalar)) &&
    new Set(data.records.map(record => record.id)).size === data.records.length &&
    data.filters.every(filter => filter && typeof filter.field === 'string' && typeof filter.label === 'string') &&
    data.stats.every(stat => stat && typeof stat.id === 'string' && typeof stat.label === 'string' && ['count', 'sum', 'average'].includes(stat.operation) && (stat.operation === 'count' || typeof stat.field === 'string'))
}
/** One owner per app instance and declared connection, shared across pages. No Session dependency. */
export class DisplayStore {
  private snapshot: DisplaySnapshot = { phase: 'loading', data: empty(), filters: {}, search: '' }
  private listeners = new Set<() => void>()
  private controller?: AbortController
  private disposed = false
  constructor(private source: DisplaySource, private scope: DisplayScope) {}
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(value: Partial<DisplaySnapshot>) { this.snapshot = { ...this.snapshot, ...value }; for (const listener of this.listeners) listener() }
  filteredRecords = (): DisplayRecord[] => this.snapshot.data.records.filter(record =>
    (!this.snapshot.search || [record.title, record.subtitle ?? '', ...Object.values(record.fields)].join(' ').toLocaleLowerCase().includes(this.snapshot.search.toLocaleLowerCase())) &&
    Object.entries(this.snapshot.filters).every(([field, value]) => !value || String(record.fields[field] ?? '') === value))
  setFilter = (field: string, value: string) => {
    if (!this.snapshot.data.filters.some(filter => filter.field === field)) return
    this.update({ filters: { ...this.snapshot.filters, [field]: value } }); this.reconcileSelection()
  }
  setSearch = (search: string) => { this.update({ search }); this.reconcileSelection() }
  clearSelection = () => this.update({ selectedId: undefined })
  select = (selectedId: string) => { if (this.filteredRecords().some(record => record.id === selectedId)) this.update({ selectedId }) }
  private reconcileSelection() { if (this.snapshot.selectedId && !this.filteredRecords().some(record => record.id === this.snapshot.selectedId)) this.update({ selectedId: undefined }) }
  reload = async () => {
    if (this.disposed) return
    this.controller?.abort(); const controller = new AbortController(); this.controller = controller
    this.update({ phase: 'loading', error: undefined })
    try {
      const data = await this.source.load({ ...this.scope, signal: controller.signal })
      if (controller.signal.aborted || this.disposed) return
      if (!validData(data)) throw new Error('Invalid display data')
      this.update({ phase: 'ready', data }); this.reconcileSelection()
    } catch (error) { if (!controller.signal.aborted && !this.disposed) this.update({ phase: 'error', error: error instanceof Error ? error.message : String(error) }) }
  }
  dispose() { this.disposed = true; this.controller?.abort(); this.listeners.clear() }
}
