import { useEffect, useRef, useState } from 'react'
import { BookOpen, GraduationCap, Briefcase, Notebook, LayoutGrid, Bot, Sparkles, ChevronDown, X, Minus, Maximize2, Minimize2, Star, Eye, EyeOff, ArrowUp, ArrowDown, Search } from 'lucide-react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchAppDefinition, WorkbenchIcon } from './workbench-api.ts'
import type { Workbench } from './workbench.ts'
import { windowKey } from './workbench.ts'
import { workspaceStyles } from './workbench-styles.ts'
import { ManagementCatalogView } from './management-view.tsx'
import type { PanelNavigation } from './panel-navigation.ts'
import type { ManagementCommands } from './management-view.tsx'

export interface WorkspaceInjected {
  hooks: { workbench: Workbench }
  openWorkspace: Workbench['openWorkspace']
  closeWorkspace: Workbench['closeWorkspace']
  openApp: Workbench['openApp']
  focusWindow: Workbench['focus']
  setMode: Workbench['setMode']
  selectPage: Workbench['selectPage']
  setGeometry: Workbench['setGeometry']
  setPreference: Workbench['setPreference']
  management?: ManagementCommands
}
type WorkspaceProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'personal-workbench.app'>
  & PropsLocale<'personal-workbench'> & InjectFace<WorkspaceInjected>
const icons = { 'book-open': BookOpen, 'graduation-cap': GraduationCap, briefcase: Briefcase, notebook: Notebook, 'layout-grid': LayoutGrid }
function AppIcon({ icon }: { icon: WorkbenchIcon }) { const Icon = icons[icon]; return <Icon size={18} aria-hidden="true" /> }

/** Full-width navigation follows the native Workspace browser in the sidebar. */
export function WorkspaceLauncher({ openWorkspace, openApp, openAgents, openSkills, useWorkbench, t, wide }: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'personal-workbench'>
  & InjectFace<{ hooks: { workbench: Workbench } }> & { openWorkspace: Workbench['openWorkspace']; openApp: Workbench['openApp']; openAgents: () => void; openSkills: () => void }) {
  const state = useWorkbench(value => value)
  const [expanded, setExpanded] = useState(true)
  const apps = state.definitions.filter(app => !state.apps[app.id]?.hidden).sort((a, b) =>
    Number(state.apps[b.id]?.favorite ?? false) - Number(state.apps[a.id]?.favorite ?? false)
    || (state.apps[a.id]?.order ?? 0) - (state.apps[b.id]?.order ?? 0) || a.name.localeCompare(b.name))
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0,
    minHeight: 40, padding: wide ? '8px 10px' : '8px 0', justifyContent: wide ? 'flex-start' : 'center',
    border: 0, borderRadius: 8, background: 'transparent', color: 'inherit', fontSize: 14, textAlign: 'left', cursor: 'pointer' }
  const label: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  return <nav aria-label={t('catalogTabs')} style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0,
    gap: 3, paddingTop: 8, paddingBottom: 8, borderTop: '1px solid var(--dsw-alias-border-default)' }}>
    <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      <button type="button" title={t('workspace')} aria-label={t('workspace')} onClick={() => openWorkspace()} style={row}>
        <LayoutGrid size={18} style={{ flexShrink: 0 }} aria-hidden="true" />{wide && <span style={label}>{t('workspace')}</span>}
      </button>
      {wide && <button type="button" aria-label={t('applications')} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
        style={{ flexShrink: 0, border: 0, background: 'transparent', color: 'inherit', padding: 8, cursor: 'pointer' }}>
        <ChevronDown size={16} style={{ transform: expanded ? undefined : 'rotate(-90deg)' }} aria-hidden="true" />
      </button>}
    </div>
    {wide && expanded && <ul aria-label={t('applications')} style={{ listStyle: 'none', padding: '0 0 4px 19px', margin: 0,
      borderLeft: '1px solid var(--dsw-alias-border-default)', marginLeft: 18 }}>
      {apps.map(app => <li key={app.id}><button type="button" title={app.name} aria-label={app.name} onClick={() => openApp(app.id)}
        style={{ ...row, minHeight: 36, fontSize: 13 }}><AppIcon icon={app.icon} /><span style={label}>{app.name}</span></button></li>)}
    </ul>}
    <button type="button" title={t('agents')} aria-label={t('agents')} onClick={openAgents} style={row}>
      <Bot size={18} style={{ flexShrink: 0 }} aria-hidden="true" />{wide && <span style={label}>{t('agents')}</span>}
    </button>
    <button type="button" title={t('skills')} aria-label={t('skills')} onClick={openSkills} style={row}>
      <Sparkles size={18} style={{ flexShrink: 0 }} aria-hidden="true" />{wide && <span style={label}>{t('skills')}</span>}
    </button>
  </nav>
}


/** Anchor plugin panels to the native center column, keeping both sidebars usable. */
function useCenterColumn(ref: React.RefObject<HTMLDivElement>) {
  const [bounds, setBounds] = useState<React.CSSProperties>({ inset: 0 })
  useEffect(() => {
    const overlay = ref.current?.closest('[data-shell-overlay]')
    const frame = overlay?.parentElement
    const center = frame?.children[1]
    if (!(center instanceof HTMLElement) || !frame) return
    const measure = () => {
      const box = center.getBoundingClientRect(), parent = frame.getBoundingClientRect()
      setBounds({ left: box.left - parent.left, top: box.top - parent.top, width: box.width, height: box.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(center); observer.observe(frame)
    return () => observer.disconnect()
  }, [])
  return bounds
}

/** Project workspace: direct content, one title and page navigation; owners stay mounted. */
export function Workspace({ useWorkbench, openApp, closeWorkspace, focusWindow, setMode, selectPage, setPreference, renderSlot, t }: WorkspaceProps) {
  const state = useWorkbench(value => value)
  const [query, setQuery] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const bounds = useCenterColumn(root)
  const frames = useRef(new Map<string, HTMLDivElement>())
  const retained = state.windows.filter(row => state.definitions.some(app => app.id === row.appId))
  const opened = retained.filter(row => row.mode !== 'closed' && row.mode !== 'minimized')
  const focused = opened.find(row => windowKey(row.appId, row.instanceId) === state.focused)
  const app = focused && state.definitions.find(row => row.id === focused.appId)
  useEffect(() => {
    if (!state.visible) return
    const before = document.activeElement
    if (focused) frames.current.get(windowKey(focused.appId, focused.instanceId))?.focus()
    else root.current?.focus()
    return () => { if (before instanceof HTMLElement && before.isConnected) before.focus() }
  }, [state.visible, state.focusRevision])
  const apps = state.definitions.filter(row => (showHidden || !state.apps[row.id]?.hidden)
    && row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <div ref={root} className="pwb-workspace pwb-project-shell" style={bounds} hidden={!state.visible} role="region" aria-label={app?.name ?? t('workspace')} tabIndex={-1}
    onKeyDown={event => {
      if (event.defaultPrevented || event.nativeEvent.isComposing) return
      if (event.key === 'Escape' && event.target === root.current) { event.preventDefault(); closeWorkspace() }
      if (event.key === 'F6' && event.ctrlKey && opened.length) {
        const index = opened.findIndex(row => windowKey(row.appId, row.instanceId) === state.focused)
        const next = opened[(index + (event.shiftKey ? opened.length - 1 : 1)) % opened.length]
        event.preventDefault(); focusWindow(windowKey(next.appId, next.instanceId))
      }
    }}>
    <style>{workspaceStyles}</style>
    <header className="pwb-top"><LayoutGrid size={18} aria-hidden="true" /><strong>{app?.name ?? t('workspace')}</strong>
      <button type="button" aria-label={t('closeWorkspace')} title={t('closeWorkspace')} onClick={closeWorkspace}><X size={18} /></button>
    </header>
    {state.storageFailed && <p role="status" className="pwb-notice">{t('storageFailed')}</p>}
    <section className="pwb-app-home" hidden={!!focused} aria-label={t('applications')}>
      <label className="pwb-search"><Search size={16} /><input type="search" aria-label={t('searchApps')} placeholder={t('searchApps')} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="pwb-hidden"><input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />{t('showHidden')}</label>
      <div className="pwb-app-grid">{apps.map(row => <section key={row.id} className="pwb-app">
        <button type="button" className="pwb-open" onClick={() => openApp(row.id)}><AppIcon icon={row.icon} /><span>{row.name}</span></button>
        <div className="pwb-meta">{row.source} · {row.version}</div>
        <div className="pwb-app-tools"><button type="button" aria-label={t('favorite') + ': ' + row.name} aria-pressed={state.apps[row.id]?.favorite ?? false} onClick={() => setPreference(row.id, { favorite: !state.apps[row.id]?.favorite })}><Star size={15} /></button>
          <button type="button" aria-label={t(state.apps[row.id]?.hidden ? 'showApp' : 'hideApp') + ': ' + row.name} onClick={() => setPreference(row.id, { hidden: !state.apps[row.id]?.hidden })}><EyeOff size={15} /></button></div>
      </section>)}</div>
      {!apps.length && <p role="status" className="pwb-empty">{t(state.definitions.length ? 'noMatches' : 'noApps')}</p>}
    </section>
    {retained.map(row => {
      const definition = state.definitions.find(value => value.id === row.appId)!
      const key = windowKey(row.appId, row.instanceId)
      const active = state.visible && state.focused === key && row.mode !== 'closed' && row.mode !== 'minimized'
      return <div key={key} ref={element => { if (element) frames.current.set(key, element); else frames.current.delete(key) }} role="region" aria-label={definition.name + ' · ' + row.instanceId} tabIndex={-1} hidden={!active} className="pwb-project">
        <nav className="pwb-pages" role="tablist" aria-label={t('pages')}>{definition.pages.map(page => <button key={page.id} type="button" role="tab" aria-selected={row.pageId === page.id} onClick={() => selectPage(key, page.id)}>{page.label}</button>)}</nav>
        <div className="pwb-content">{renderSlot('personal-workbench.app', { appId: row.appId, instanceId: row.instanceId, pageId: row.pageId, active, selectPage: pageId => selectPage(key, pageId), close: () => { setMode(key, 'closed'); closeWorkspace() } }, { entryKey: row.appId, fallback: <p role="alert">{t('appViewUnavailable')}</p> })}</div>
      </div>
    })}
  </div>
}

type ManagementProps = PropsRuntime<'shell.overlay'> & PropsLocale<'personal-workbench'> & InjectFace<{ hooks: { navigation: PanelNavigation; workbench: Workbench }; close: () => void; management?: ManagementCommands }>
/** Independent root management panels, unrelated to an application window lifecycle. */
export function ManagementPanel({ useNavigation, useWorkbench, close, management, t }: ManagementProps) {
  const panel = useNavigation(value => value.panel)
  const apps = useWorkbench(value => value.definitions)
  const [queries, setQueries] = useState({ agents: '', skills: '' })
  const root = useRef<HTMLDivElement>(null)
  const bounds = useCenterColumn(root)
  useEffect(() => { if (!panel) return; const before = document.activeElement; root.current?.focus(); return () => { if (before instanceof HTMLElement && before.isConnected) before.focus() } }, [panel])
  return <div ref={root} className="pwb-workspace pwb-project-shell pwb-independent-management" style={bounds} role="region" aria-label={panel ? t(panel) : t('catalogTabs')} tabIndex={-1} hidden={!panel}
    onKeyDown={e => { if (e.key === 'Escape' && e.target === root.current) close() }}>
    <style>{workspaceStyles}</style>
    <header className="pwb-top"><strong>{panel ? t(panel) : t('catalogTabs')}</strong><button type="button" aria-label={t('close')} onClick={close}><X size={18} /></button></header>
    {(['agents','skills'] as const).map(tab => <div key={tab} hidden={panel !== tab} className="pwb-management-page">
      <label className="pwb-search"><Search size={16} /><input type="search" aria-label={t('searchCatalog')} placeholder={t('searchCatalog')} value={queries[tab]} onChange={e => setQueries(value => ({ ...value, [tab]: e.target.value }))} /></label>
      <ManagementCatalogView tab={tab} active={panel === tab} apps={apps} query={queries[tab]} commands={management ?? {}} t={t} />
    </div>)}
  </div>
}
