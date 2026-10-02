import { useSyncExternalStore } from 'react'
import { LayoutGrid, ArrowUpRight } from 'lucide-react'
import type { Context } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { BetterSidebarService, TabComponentProps, SidebarState, SessionScope } from 'dsh-better-sidebar/client/service'
import type { Workbench } from './workbench.ts'

const tabId = 'personal-workbench.catalog'
type Status = 'sidebarUnsupported' | null
type SplitNode = SidebarState['bottomSplits']
class AdapterStatus {
  private status: Status = null
  private listeners = new Set<() => void>()
  readonly getSnapshot = () => this.status
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  set(value: Status) { this.status = value; for (const listener of this.listeners) listener() }
}

function compatible(service: BetterSidebarService): boolean {
  return service.version === '0.24.1' && Array.isArray(service.features)
    && ['tabLifecycle', 'stateSubscription', 'targetedOpen'].every(feature => service.features.includes(feature))
    && ['registerTab', 'openTab', 'closeTab', 'getSnapshot', 'subscribeState', 'isTabEnabled']
      .every(key => typeof service[key as keyof BetterSidebarService] === 'function')
}

function Catalog({ ctx, workbench, enabled }: { ctx: Context; workbench: Workbench; enabled: () => boolean }) {
  const state = useSyncExternalStore(workbench.subscribe, workbench.getSnapshot, workbench.getSnapshot)
  useSyncExternalStore(listener => ctx.locale.subscribe(listener), () => ctx.locale.getSnapshot())
  const t = ctx.locale.bind('personal-workbench')
  const apps = state.definitions.filter(app => !state.apps[app.id]?.hidden).sort((a, b) =>
    Number(state.apps[b.id]?.favorite ?? false) - Number(state.apps[a.id]?.favorite ?? false)
    || (state.apps[a.id]?.order ?? 0) - (state.apps[b.id]?.order ?? 0) || a.name.localeCompare(b.name))
  return <section aria-label={t('applications')} style={{ padding: 12, minWidth: 0, color: 'var(--dsw-alias-text-primary)' }}>
    <button type="button" title={t('workspace')} onClick={() => { if (enabled()) ctx.personalWorkbench.openWorkspace() }}
      style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32 }}>
      <LayoutGrid size={18} aria-hidden="true" />{t('workspace')}
    </button>
    {!apps.length && <p role="status">{t('noApps')}</p>}
    <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>{apps.map(app => {
      const missing = app.dependencies?.filter(row => !row.available) ?? []
      return <li key={app.id} style={{ borderBottom: '1px solid var(--dsw-alias-border-default)', padding: '6px 0' }}>
        <button type="button" onClick={() => {
          if (enabled() && workbench.getSnapshot().definitions.some(row => row.id === app.id)) ctx.personalWorkbench.openApp(app.id)
        }} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 32, textAlign: 'left' }}>
          <ArrowUpRight size={16} aria-hidden="true" /><span style={{ overflowWrap: 'anywhere' }}>{app.name}</span>
        </button>
        {!!missing.length && <p role="status">{t('dependencyUnavailable')}: {missing.map(row => row.reason ?? row.id).join(', ')}</p>}
      </li>
    })}</ul>
  </section>
}

function Unsupported({ useBetterSidebarAdapter, t }: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'personal-workbench'>
  & InjectFace<{ hooks: { betterSidebarAdapter: AdapterStatus } }>) {
  const status = useBetterSidebarAdapter(value => value)
  return status ? <span role="status" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{t(status)}</span> : null
}

/** Install a bottom-tab catalog using the existing workbench owner. No optional runtime import.
 * @param ctx - owning client context; child effects retire with service loss or plugin unload.
 * @param workbench - this plugin's shared registry and presentation owner.
 */
export function installOptionalBetterSidebar(ctx: Context, workbench: Workbench): void {
  const status = new AdapterStatus()
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'personal-workbench.sidebar-status', locale: 'personal-workbench',
    inject: () => ({ hooks: { betterSidebarAdapter: status } }),
  }, Unsupported))
  ctx.inject(['betterSidebar'], child => {
    const service = child.betterSidebar
    if (!compatible(service)) {
      status.set('sidebarUnsupported')
      child.effect(() => () => status.set(null))
      return
    }
    child.effect(() => {
      let active = true
      const scopes = new Map<string, { scope: SessionScope; ids: Set<string> }>()
      const remember = (scope: SessionScope, id: string) => {
        let row = scopes.get(scope.sessionId)
        if (!row) { row = { scope, ids: new Set() }; scopes.set(scope.sessionId, row) }
        row.ids.add(id)
      }
      const observe = () => {
        const { sessionId, state } = service.getSnapshot()
        if (!sessionId || !state) return
        const walk = (node: SplitNode) => {
          if (node.kind === 'split') node.children.forEach(walk)
          else for (const tab of node.tabs) if (tab.type === tabId) remember({ sessionId }, tab.id)
        }
        walk(state.bottomSplits)
      }
      const enabled = () => active && service.isTabEnabled(tabId)
      const removeTab = service.registerTab({
        id: tabId, single: true, title: () => child.locale.bind('personal-workbench')('workspace'),
        description: () => child.locale.bind('personal-workbench')('sidebarCatalog'),
        icon: size => <LayoutGrid size={size} aria-hidden="true" />,
        onOpen: (tab, scope) => remember(scope, tab.id),
        onActivate: (tab, scope) => remember(scope, tab.id),
        component: ({ visible }: TabComponentProps) => visible && enabled()
          ? <Catalog ctx={child} workbench={workbench} enabled={enabled} /> : null,
      })
      let unsubscribe: () => void
      try { unsubscribe = service.subscribeState(observe) }
      catch (error) { removeTab(); throw error }
      try { observe() }
      catch (error) { unsubscribe(); removeTab(); throw error }
      return () => {
        active = false
        unsubscribe()
        try { for (const { scope, ids } of scopes.values()) for (const id of ids) service.closeTab(id, scope) }
        finally { scopes.clear(); removeTab() }
      }
    }, 'personal-workbench: optional Better Sidebar catalog')
  })
}
