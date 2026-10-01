import { useEffect, useRef, useState } from 'react'
import { BookOpen, GraduationCap, Briefcase, Notebook, LayoutGrid, X, Minus, Maximize2, Minimize2, Star, Eye, EyeOff, ArrowUp, ArrowDown, Search } from 'lucide-react'
import type { InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkbenchAppDefinition, WorkbenchIcon } from './workbench-api.ts'
import type { Workbench } from './workbench.ts'
import { constrainGeometry, windowKey } from './workbench.ts'
import { workspaceStyles } from './workbench-styles.ts'
import { ManagementCatalogView } from './management-view.tsx'
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

/** Compact catalog launcher on the official sidebar footer seat. */
export function WorkspaceLauncher({ openWorkspace, t, wide }: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'personal-workbench'>
  & { openWorkspace: Workbench['openWorkspace'] }) {
  return <button type="button" title={t('workspace')} aria-label={t('workspace')} onClick={openWorkspace}
    style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 32, padding: 6, border: 0, background: 'transparent', color: 'inherit', fontSize: 13 }}>
    <LayoutGrid size={18} aria-hidden="true" />{wide && <span>{t('workspace')}</span>}
  </button>
}

/** Workspace view; all live registry data comes through the renderer-made hook. */
export function Workspace(props: WorkspaceProps) {
  const { useWorkbench, openApp, closeWorkspace, focusWindow, setMode, selectPage, setGeometry, setPreference, renderSlot, t, management } = props
  const state = useWorkbench(value => value)
  const [catalogTab, setCatalogTab] = useState<'applications' | 'agents' | 'skills'>('applications')
  const [query, setQuery] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [bounds, setBounds] = useState({ width: 800, height: 600 })
  const root = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const launchers = useRef(new Map<string, HTMLButtonElement>())
  const frames = useRef(new Map<string, HTMLDivElement>())
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (!state.visible) return
    const before = document.activeElement
    root.current?.focus()
    return () => { if (before instanceof HTMLElement && before.isConnected) before.focus() }
  }, [state.visible])
  useEffect(() => {
    if (!state.visible || !stage.current) return
    const element = stage.current
    const measure = () => setBounds({ width: element.clientWidth, height: element.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [state.visible])
  useEffect(() => {
    if (!state.visible) return
    if (returnFocus.current?.isConnected) { returnFocus.current.focus(); returnFocus.current = null }
    else if (state.focused) frames.current.get(state.focused)?.focus()
    else root.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus()
  }, [state.visible, state.focused, state.focusRevision])
  const apps = state.definitions.filter(app => (showHidden || !state.apps[app.id]?.hidden)
    && `${app.name} ${app.source}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) =>
      Number(state.apps[b.id]?.favorite ?? false) - Number(state.apps[a.id]?.favorite ?? false)
      || (state.apps[a.id]?.order ?? 0) - (state.apps[b.id]?.order ?? 0) || a.name.localeCompare(b.name))
  const windows = state.windows.filter(row => row.mode !== 'closed' && state.definitions.some(app => app.id === row.appId))
  const retainedWindows = state.windows.filter(row => state.definitions.some(app => app.id === row.appId))
  const focused = windows.find(row => windowKey(row.appId, row.instanceId) === state.focused && row.mode !== 'minimized')
    ?? windows.findLast(row => row.mode !== 'minimized')
  const focusedKey = focused ? windowKey(focused.appId, focused.instanceId) : null
  const closeWindow = (key: string, app: WorkbenchAppDefinition, mode: 'closed' | 'minimized') => {
    returnFocus.current = launchers.current.get(app.id) ?? null
    setMode(key, mode)
  }
  return <div className="pwb-workspace" hidden={!state.visible} ref={root} role="dialog" aria-label={t('workspace')} tabIndex={-1}
    onKeyDown={event => {
      if (event.defaultPrevented || event.nativeEvent.isComposing) return
      if (event.key === 'F6' && event.ctrlKey) {
        const visible = windows.filter(row => row.mode !== 'minimized')
        const index = visible.findIndex(row => windowKey(row.appId, row.instanceId) === focusedKey)
        const next = visible[(index + (event.shiftKey ? visible.length - 1 : 1)) % visible.length]
        if (next) { event.preventDefault(); focusWindow(windowKey(next.appId, next.instanceId)) }
      }
      if (event.key === 'Escape' && event.target === root.current) { event.preventDefault(); closeWorkspace() }
    }}>
    <style>{workspaceStyles}</style>
    <header className="pwb-top"><LayoutGrid size={18} aria-hidden="true" /><strong>{t('workspace')}</strong>
      <button type="button" title={t('closeWorkspace')} aria-label={t('closeWorkspace')} onClick={closeWorkspace}><X size={18} /></button>
    </header>
    {state.storageFailed && <p className="pwb-notice" role="status">{t('storageFailed')}</p>}
    <div className="pwb-body" data-catalog={catalogTab}>
      <aside className="pwb-catalog" aria-label={t('applications')}>
        <nav className="pwb-catalog-tabs" aria-label={t('catalogTabs')}>
          {(['applications', 'agents', 'skills'] as const).map(tab => <button key={tab} type="button" aria-pressed={catalogTab === tab} onClick={() => setCatalogTab(tab)}>{t(tab)}</button>)}
        </nav>
        <label className="pwb-search"><Search size={16} aria-hidden="true" /><input type="search" aria-label={t(catalogTab === 'applications' ? 'searchApps' : 'searchCatalog')} placeholder={t(catalogTab === 'applications' ? 'searchApps' : 'searchCatalog')} value={query} onChange={event => setQuery(event.target.value)} /></label>
        {catalogTab === 'applications' && <label className="pwb-hidden"><input type="checkbox" checked={showHidden} onChange={event => setShowHidden(event.target.checked)} />{t('showHidden')}</label>}
        <div className="pwb-list" hidden={catalogTab !== 'applications'}>
          {apps.map(app => {
            const preference = state.apps[app.id]
            const unavailable = app.dependencies?.filter(row => !row.available)
            return <section className="pwb-app" key={app.id}>
              <button className="pwb-open" type="button" ref={element => { if (element) launchers.current.set(app.id, element); else launchers.current.delete(app.id) }}
                onClick={() => openApp(app.id)} title={app.name}><AppIcon icon={app.icon} /><span>{app.name}</span></button>
              <div className="pwb-meta">{app.source} · {app.version}</div>
              {!!unavailable?.length && <p className="pwb-dependencies" role="status">{unavailable.map(row => `${row.id}: ${row.reason ?? t('dependencyUnavailable')}`).join('; ')}</p>}
              <div className="pwb-app-tools">
                <button type="button" title={t('favorite')} aria-label={`${t('favorite')}: ${app.name}`} aria-pressed={preference?.favorite ?? false} onClick={() => setPreference(app.id, { favorite: !preference?.favorite })}><Star size={15} /></button>
                <button type="button" title={t(preference?.hidden ? 'showApp' : 'hideApp')} aria-label={`${t(preference?.hidden ? 'showApp' : 'hideApp')}: ${app.name}`} onClick={() => setPreference(app.id, { hidden: !preference?.hidden })}>{preference?.hidden ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                <button type="button" title={t('moveUp')} aria-label={`${t('moveUp')}: ${app.name}`} onClick={() => setPreference(app.id, { order: Math.min(0, ...state.definitions.map(value => state.apps[value.id]?.order ?? 0)) - 1 })}><ArrowUp size={15} /></button>
                <button type="button" title={t('moveDown')} aria-label={`${t('moveDown')}: ${app.name}`} onClick={() => setPreference(app.id, { order: Math.max(0, ...state.definitions.map(value => state.apps[value.id]?.order ?? 0)) + 1 })}><ArrowDown size={15} /></button>
              </div>
            </section>
          })}
          {!apps.length && <p className="pwb-empty" role="status">{t(state.definitions.length ? 'noMatches' : 'noApps')}</p>}
        </div>
        {catalogTab !== 'applications' && <ManagementCatalogView tab={catalogTab} active={state.visible} apps={state.definitions} query={query} commands={management ?? {}} t={t} />}
      </aside>
      <main className="pwb-workarea" hidden={catalogTab !== 'applications'}>
        <nav className="pwb-taskbar" aria-label={t('openWindows')}>
          {windows.map(row => {
            const app = state.definitions.find(value => value.id === row.appId)!
            const key = windowKey(row.appId, row.instanceId)
            return <button key={key} type="button" title={`${app.name} · ${row.instanceId}`} aria-pressed={focusedKey === key}
              onClick={() => openApp(row.appId, row.instanceId)}><AppIcon icon={app.icon} /><span>{app.name}{row.instanceId !== 'default' && ` · ${row.instanceId}`}</span>{row.mode === 'minimized' && <Minus size={14} aria-label={t('minimized')} />}</button>
          })}
        </nav>
        <div className="pwb-stage" ref={stage}>
          {retainedWindows.map(row => {
            const app = state.definitions.find(value => value.id === row.appId)!
            const key = windowKey(row.appId, row.instanceId)
            const active = state.visible && focusedKey === key && row.mode !== 'minimized' && row.mode !== 'closed'
            const geometry = row.mode === 'maximized' ? { x: 0, y: 0, width: bounds.width, height: bounds.height } : constrainGeometry(row, bounds.width, bounds.height)
            return <div key={key} ref={element => { if (element) frames.current.set(key, element); else frames.current.delete(key) }}
              role="region" aria-label={`${app.name} · ${row.instanceId}`} tabIndex={-1} hidden={!active} className="pwb-window"
              style={{ left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }}>
              <header className="pwb-window-header">
                <button className="pwb-move" type="button" title={t('moveWindow')} aria-label={`${t('moveWindow')}: ${app.name}`}
                  disabled={row.mode === 'maximized' || bounds.width < 640}
                  onKeyDown={event => {
                    const directions: Record<string, [number, number]> = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }
                    const direction = directions[event.key]
                    if (direction) { event.preventDefault(); setGeometry(key, constrainGeometry({ ...geometry, x: geometry.x + direction[0], y: geometry.y + direction[1] }, bounds.width, bounds.height)) }
                  }}
                  onPointerDown={event => {
                    event.currentTarget.setPointerCapture(event.pointerId)
                    event.currentTarget.dataset.start = JSON.stringify([event.clientX, event.clientY, geometry.x, geometry.y])
                  }}
                  onPointerMove={event => {
                    const saved = event.currentTarget.dataset.start
                    if (!saved || !event.currentTarget.hasPointerCapture(event.pointerId)) return
                    const [x, y, startX, startY]: number[] = JSON.parse(saved)
                    setGeometry(key, constrainGeometry({ ...geometry, x: startX + event.clientX - x, y: startY + event.clientY - y }, bounds.width, bounds.height))
                  }} onPointerUp={event => { delete event.currentTarget.dataset.start; event.currentTarget.releasePointerCapture(event.pointerId) }}><AppIcon icon={app.icon} /><span>{app.name}</span></button>
                <button type="button" title={t('minimize')} aria-label={`${t('minimize')}: ${app.name}`} onClick={() => closeWindow(key, app, 'minimized')}><Minus size={17} /></button>
                <button type="button" title={t(row.mode === 'maximized' ? 'restore' : 'maximize')} aria-label={`${t(row.mode === 'maximized' ? 'restore' : 'maximize')}: ${app.name}`} onClick={() => setMode(key, row.mode === 'maximized' ? 'normal' : 'maximized')}>{row.mode === 'maximized' ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</button>
                <button type="button" title={t('close')} aria-label={`${t('close')}: ${app.name}`} onClick={() => closeWindow(key, app, 'closed')}><X size={17} /></button>
              </header>
              <div className="pwb-pages" role="tablist" aria-label={t('pages')}>{app.pages.map(page => <button key={page.id} type="button" role="tab" aria-selected={row.pageId === page.id} onClick={() => selectPage(key, page.id)}>{page.label}</button>)}</div>
              <div className="pwb-content">{renderSlot('personal-workbench.app', { appId: row.appId, instanceId: row.instanceId, pageId: row.pageId, active,
                selectPage: pageId => selectPage(key, pageId), close: () => closeWindow(key, app, 'closed') }, { entryKey: row.appId, fallback: <p role="alert">{t('appViewUnavailable')}</p> })}</div>
              {row.mode !== 'maximized' && bounds.width >= 640 && <label className="pwb-resize">{t('windowWidth')}<input type="range" min={320} max={Math.max(320, bounds.width - 24)} value={geometry.width} aria-label={`${t('windowWidth')}: ${app.name}`} onChange={event => setGeometry(key, constrainGeometry({ ...geometry, width: Number(event.target.value) }, bounds.width, bounds.height))} />
                {t('windowHeight')}<input type="range" min={240} max={Math.max(240, bounds.height - 24)} value={geometry.height} aria-label={`${t('windowHeight')}: ${app.name}`} onChange={event => setGeometry(key, constrainGeometry({ ...geometry, height: Number(event.target.value) }, bounds.width, bounds.height))} /></label>}
            </div>
          })}
        </div>
      </main>
    </div>
  </div>
}
