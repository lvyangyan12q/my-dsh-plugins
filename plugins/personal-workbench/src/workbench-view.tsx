import { compareApplications } from './app-order.ts'
import {sidebarCoexistenceStyles} from './sidebar-coexistence-styles.ts'
import { RecipeEditor } from './recipe-editor.tsx'
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
  setAppEnabled?: (appId: string, enabled: boolean) => Promise<void>
  refreshRecipes?: () => Promise<void>
  refreshApps?: () => Promise<void>
  management?: ManagementCommands
}
type WorkspaceProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'personal-workbench.app'>
  & PropsLocale<'personal-workbench'> & InjectFace<WorkspaceInjected>
const icons = { 'book-open': BookOpen, 'graduation-cap': GraduationCap, briefcase: Briefcase, notebook: Notebook, 'layout-grid': LayoutGrid }
function AppIcon({ icon }: { icon: WorkbenchIcon }) { const Icon = icons[icon]; return <Icon size={18} aria-hidden="true" /> }

/** Full-width navigation follows the native Workspace browser in the sidebar. */
export function WorkspaceLauncher({ openWorkspace, openApp, openAgents, openSkills, useWorkbench, t, wide }: PropsRuntime<'sidebar.sections'> & PropsLocale<'personal-workbench'>
  & InjectFace<{ hooks: { workbench: Workbench } }> & { openWorkspace: Workbench['openWorkspace']; openApp: Workbench['openApp']; openAgents: () => void; openSkills: () => void }) {
  const state = useWorkbench(value => value)
  const [expanded, setExpanded] = useState(true)
  const apps = state.definitions.filter(app => !state.apps[app.id]?.hidden && state.lifecycleReady && state.lifecycle[app.id]?.enabled !== false).sort(compareApplications(state.apps))
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, width: '100%', minWidth: 0,
    minHeight: 40, padding: wide ? '8px 10px' : '8px 0', justifyContent: wide ? 'flex-start' : 'center',
    border: 0, borderRadius: 8, background: 'transparent', color: 'inherit', fontSize: 14, textAlign: 'left', cursor: 'pointer' }
  const label: React.CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  return <><style>{sidebarCoexistenceStyles}</style><nav className="pwb-sidebar-navigation" aria-label={t('catalogTabs')} style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: 0,
    gap: 3, paddingTop: 8, paddingBottom: 8, borderTop: '1px solid var(--dsw-alias-border-default)' }}>
    <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
      <button data-pwb-button type="button" title={t('workspace')} aria-label={t('workspace')} onClick={() => openWorkspace()} style={row}>
        <LayoutGrid size={18} style={{ flexShrink: 0 }} aria-hidden="true" />{wide && <span style={label}>{t('workspace')}<small className="pwb-sidebar-origin">{t('sidebarPlatformOrigin')}</small></span>}
      </button>
      {wide && <button data-pwb-button type="button" aria-label={t('applications')} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
        style={{ flexShrink: 0, border: 0, background: 'transparent', color: 'inherit', padding: 8, cursor: 'pointer' }}>
        <ChevronDown size={16} style={{ transform: expanded ? undefined : 'rotate(-90deg)' }} aria-hidden="true" />
      </button>}
    </div>
    {wide && expanded && <ul aria-label={t('applications')} style={{ listStyle: 'none', padding: '0 0 4px 19px', margin: 0,
      borderLeft: '1px solid var(--dsw-alias-border-default)', marginLeft: 18 }}>
      {apps.map(app => <li key={app.id}><button data-pwb-button type="button" title={app.name} aria-label={app.name} onClick={() => openApp(app.id)}
        style={{ ...row, minHeight: 36, fontSize: 13 }}><AppIcon icon={app.icon} /><span style={label}>{app.name}</span></button></li>)}
    </ul>}
    <button data-pwb-button type="button" title={t('agents')} aria-label={t('agents')} onClick={openAgents} style={row}>
      <Bot size={18} style={{ flexShrink: 0 }} aria-hidden="true" />{wide && <span style={label}>{t('agents')}</span>}
    </button>
    <button data-pwb-button type="button" title={t('skills')} aria-label={t('skills')} onClick={openSkills} style={row}>
      <Sparkles size={18} style={{ flexShrink: 0 }} aria-hidden="true" />{wide && <span style={label}>{t('skills')}</span>}
    </button>
  </nav></>
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
export function Workspace({ useWorkbench, openApp, closeWorkspace, focusWindow, setMode, selectPage, setPreference, setAppEnabled, refreshApps, refreshRecipes, management, renderSlot, t }: WorkspaceProps) {
  const state = useWorkbench(value => value)
  useEffect(() => { void refreshApps?.(); void refreshRecipes?.() }, [refreshApps, refreshRecipes])
  const [query, setQuery] = useState('')
  const [pendingApp,setPendingApp]=useState<string|null>(null)
  const [availabilityError,setAvailabilityError]=useState<string|null>(null)
  const refreshApplicationStatus=async()=>{setAvailabilityError(null);try{await Promise.all([refreshApps?.(),refreshRecipes?.()])}catch(error){setAvailabilityError(error instanceof Error?error.message:String(error))}}
  const [showHidden, setShowHidden] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const bounds = useCenterColumn(root)
  const frames = useRef(new Map<string, HTMLDivElement>())
  const retained = state.windows.filter(row => state.definitions.some(app => app.id === row.appId))
  const opened = retained.filter(row => state.lifecycleReady && state.lifecycle[row.appId]?.enabled !== false && row.mode !== 'closed' && row.mode !== 'minimized')
  const focused = opened.find(row => windowKey(row.appId, row.instanceId) === state.focused)
  const app = focused && state.definitions.find(row => row.id === focused.appId)
  useEffect(() => {
    if (!state.visible) return
    const before = document.activeElement
    if (focused) frames.current.get(windowKey(focused.appId, focused.instanceId))?.focus()
    else root.current?.focus()
    return () => { if (before instanceof HTMLElement && before.isConnected) before.focus() }
  }, [state.visible, state.focusRevision, state.focused])
  const orderedApps = [...state.definitions].sort(compareApplications(state.apps))
  const apps = orderedApps.filter(row => (showHidden || !state.apps[row.id]?.hidden)
    && row.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  const sameGroup = (row: WorkbenchAppDefinition) => apps.filter(candidate => !!state.apps[candidate.id]?.favorite === !!state.apps[row.id]?.favorite)
  const moveApp = (row: WorkbenchAppDefinition, direction: -1 | 1) => {
    const visible = sameGroup(row), index = visible.findIndex(candidate => candidate.id === row.id)
    const neighbor = visible[index + direction]
    if (!neighbor) return
    const group = orderedApps.filter(candidate => !!state.apps[candidate.id]?.favorite === !!state.apps[row.id]?.favorite)
    const from = group.findIndex(candidate => candidate.id === row.id), to = group.findIndex(candidate => candidate.id === neighbor.id)
    ;[group[from], group[to]] = [group[to], group[from]]
    group.forEach((candidate, order) => setPreference(candidate.id, { order }))
  }
  return <div ref={root} className="pwb-workspace pwb-project-shell" data-window-mode={focused?.mode ?? 'normal'} style={bounds} hidden={!state.visible} role="region" aria-label={app?.name ?? t('workspace')} tabIndex={-1}
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
      {focused && <button data-pwb-button type="button" aria-label={t(focused.mode === 'maximized' ? 'restore' : 'maximize') + ': ' + app!.name} title={t(focused.mode === 'maximized' ? 'restore' : 'maximize')} onClick={() => setMode(windowKey(focused.appId, focused.instanceId), focused.mode === 'maximized' ? 'normal' : 'maximized')}>{focused.mode === 'maximized' ? <Minimize2 size={18} aria-hidden="true" /> : <Maximize2 size={18} aria-hidden="true" />}</button>}
      {focused && <button data-pwb-button type="button" aria-label={t('minimize') + ': ' + app!.name} title={t('minimize')} onClick={() => setMode(windowKey(focused.appId, focused.instanceId), 'minimized')}><Minus size={18} aria-hidden="true" /></button>}
      <button data-pwb-button type="button" aria-label={t('closeWorkspace')} title={t('closeWorkspace')} onClick={closeWorkspace}><X size={18} /></button>
    </header>
    {state.lifecycleError && <div role="alert">{t(state.lifecycleError.includes('Application disabled') ? 'appDisabledNotice' : 'appAvailabilityUnavailable')}<button data-pwb-button type="button" onClick={()=>{void refreshApplicationStatus()}}>{t('refreshApps')}</button></div>}
    {!state.lifecycleReady && !state.lifecycleError && <p role="status">{t('appsLoading')}</p>}
    {availabilityError && <p role="alert">{t(availabilityError.includes('changed; refresh') ? 'appAvailabilityConflict' : 'appUpdateFailed')}</p>}
    {state.storageFailed && <p role="status" className="pwb-notice">{t('storageFailed')}</p>}
    <section className="pwb-app-home" hidden={!!focused} aria-label={t('applications')}>
      {retained.some(row => row.mode === 'minimized' && state.lifecycleReady && state.lifecycle[row.appId]?.enabled !== false) && <nav aria-label={t('minimized')} style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:16}}>{retained.filter(row => row.mode === 'minimized' && state.lifecycleReady && state.lifecycle[row.appId]?.enabled !== false).map(row => {
        const definition = state.definitions.find(app => app.id === row.appId)!
        return <button data-pwb-button type="button" key={windowKey(row.appId,row.instanceId)} aria-label={t('restore') + ': ' + definition.name + ' · ' + row.instanceId} onClick={() => openApp(row.appId,row.instanceId)}><AppIcon icon={definition.icon} />{t('restore')}: {definition.name} · {row.instanceId}</button>
      })}</nav>}
      {refreshApps && <button data-pwb-button type="button" onClick={()=>{void refreshApplicationStatus()}}>{t('refreshApps')}</button>}
      {refreshRecipes && <RecipeEditor t={t} refresh={refreshRecipes} onOpenSession={management?.openSession} />}
      <label className="pwb-search"><Search size={16} /><input type="search" aria-label={t('searchApps')} placeholder={t('searchApps')} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <label className="pwb-hidden"><input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} />{t('showHidden')}</label>
      <div className="pwb-app-grid">{apps.map(row => <section key={row.id} className="pwb-app">
        <button data-pwb-button type="button" className="pwb-open" disabled={!state.lifecycleReady || state.lifecycle[row.id]?.enabled===false} onClick={() => openApp(row.id)}><AppIcon icon={row.icon} /><span>{row.name}</span></button>
        <div className="pwb-meta">{row.source} · {row.version} · {t(state.lifecycle[row.id]?.enabled===false?'appDisabled':'appEnabled')}</div>
        <details><summary>{t('appConfiguration')}</summary><p>{t('appIdentity')}: {row.id}</p><p>{t('pages')}: {row.pages.map(page=>page.label).join(', ')}</p><p>{t('appRoles')}: {row.roles?.map(role=>role.name).join(', ')||t('appNone')}</p><p>{t('appDependencies')}: {row.dependencies?.map(dep=>dep.id+(dep.available?'':' — '+dep.reason)).join(', ')||t('appNone')}</p></details>
        {setAppEnabled && <button data-pwb-button type="button" disabled={!state.lifecycleReady || pendingApp!==null} onClick={async()=>{
          setPendingApp(row.id);setAvailabilityError(null)
          try {await setAppEnabled(row.id,state.lifecycle[row.id]?.enabled===false)} catch(error) {setAvailabilityError(error instanceof Error?error.message:'Application availability update failed')} finally {setPendingApp(null)}
        }}>{t(state.lifecycle[row.id]?.enabled===false?'enableApp':'disableApp')}: {row.name}</button>}
        <div className="pwb-app-tools"><button data-pwb-button type="button" aria-label={t('favorite') + ': ' + row.name} aria-pressed={state.apps[row.id]?.favorite ?? false} onClick={() => setPreference(row.id, { favorite: !state.apps[row.id]?.favorite })}><Star size={15} /></button>
          <button data-pwb-button type="button" aria-label={t(state.apps[row.id]?.hidden ? 'showApp' : 'hideApp') + ': ' + row.name} onClick={() => setPreference(row.id, { hidden: !state.apps[row.id]?.hidden })}><EyeOff size={15} /></button>
          <button data-pwb-button type="button" aria-label={t('moveUp') + ': ' + row.name} title={t('moveUp')} disabled={sameGroup(row)[0]?.id === row.id} onClick={() => moveApp(row, -1)}><ArrowUp size={15} /></button>
          <button data-pwb-button type="button" aria-label={t('moveDown') + ': ' + row.name} title={t('moveDown')} disabled={sameGroup(row).at(-1)?.id === row.id} onClick={() => moveApp(row, 1)}><ArrowDown size={15} /></button></div>
      </section>)}</div>
      {!apps.length && <p role="status" className="pwb-empty">{t(state.definitions.length ? 'noMatches' : 'noApps')}</p>}
    </section>
    {retained.map(row => {
      const definition = state.definitions.find(value => value.id === row.appId)!
      const key = windowKey(row.appId, row.instanceId)
      const active = state.lifecycleReady && state.lifecycle[row.appId]?.enabled !== false && state.visible && state.focused === key && row.mode !== 'closed' && row.mode !== 'minimized'
      return <div key={key} ref={element => { if (element) frames.current.set(key, element); else frames.current.delete(key) }} role="region" aria-label={definition.name + ' · ' + row.instanceId} tabIndex={-1} hidden={!active} className="pwb-project">
        <nav className="pwb-pages" hidden={row.mode === 'maximized'} role="tablist" aria-label={t('pages')}>{definition.pages.map(page => <button data-pwb-button key={page.id} type="button" role="tab" aria-selected={row.pageId === page.id} onClick={() => selectPage(key, page.id)}>{page.label}</button>)}</nav>
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
    <header className="pwb-top"><strong>{panel ? t(panel) : t('catalogTabs')}</strong><button data-pwb-button type="button" aria-label={t('close')} onClick={close}><X size={18} /></button></header>
    {(['agents','skills'] as const).map(tab => <div key={tab} hidden={panel !== tab} className="pwb-management-page">
      <label className="pwb-search"><Search size={16} /><input type="search" aria-label={t('searchCatalog')} placeholder={t('searchCatalog')} value={queries[tab]} onChange={e => setQueries(value => ({ ...value, [tab]: e.target.value }))} /></label>
      <ManagementCatalogView tab={tab} active={panel === tab} apps={apps} query={queries[tab]} commands={management ?? {}} t={t} />
    </div>)}
  </div>
}
