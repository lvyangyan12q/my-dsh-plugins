/** Root management navigation is independent from application windows and preferences. */
export class PanelNavigation {
  private snapshot: { panel: 'agents' | 'skills' | null } = { panel: null }
  private listeners = new Set<() => void>()
  readonly getSnapshot = () => this.snapshot
  readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  readonly open = (panel: 'agents' | 'skills') => { this.snapshot = { panel }; for (const listener of this.listeners) listener() }
  readonly close = () => { if (!this.snapshot.panel) return; this.snapshot = { panel: null }; for (const listener of this.listeners) listener() }
  dispose() { this.listeners.clear(); this.snapshot = { panel: null } }
}


/**
 * Bind the Workbench registry to the native public main panel. The Workbench
 * occupies a first-class `main` keyed panel (the `sidebar.panellist` icon
 * selects it); the native panel selection is the single source of truth for
 * whether the workbench is shown. `visible` is persisted by the plugin and
 * re-selected on boot, because the native layout does not persist
 * `activePanelId`. Management overlays keep yielding to native navigation.
 */
export function bindWorkbenchPanel(layout: import('@deepseek-ai/dsh-client-ui-layout/client').ILayout, workbench: import('./workbench.ts').Workbench, navigation: PanelNavigation, panelId: import('@deepseek-ai/dsh-client-ui-layout/client').MainPanelId) {
  let release: (() => void) | undefined
  let syncing = false
  // Whether the workbench panel has ever actually become the active native
  // panel. A boot-time `visible` with an unregistered key must not be mistaken
  // for the user leaving the panel.
  let everActive = false
  // Workbench visibility drives the native panel: opening the workbench (an app,
  // the sidebar icon, another plugin) selects the panel; closing it deselects.
  const syncFromWorkbench = () => {
    if (syncing) return
    syncing = true
    try {
      const visible = workbench.getSnapshot().visible
      const active = layout.panelInfo.getSnapshot().activePanelId
      // `selectPanel` throws for an unregistered key; registration order against
      // the layout service is not fixed, so a boot-time miss is retried through
      // the returned `resync` once the workbench panel is registered.
      if (visible && active !== panelId) { try { layout.selectPanel(panelId) } catch (_error) { /* not registered yet */ } }
      else if (!visible && active === panelId) layout.selectPanel(null)
      if (layout.panelInfo.getSnapshot().activePanelId === panelId) everActive = true
    } finally { syncing = false }
  }
  // Native panel selection drives the persisted visibility. The native layout
  // does not persist `activePanelId`, so a persisted `visible` re-selects the
  // panel on boot via `syncFromWorkbench`.
  const syncFromPanel = () => {
    if (syncing) return
    syncing = true
    try {
      const active = layout.panelInfo.getSnapshot().activePanelId === panelId
      const visible = workbench.getSnapshot().visible
      if (active) { everActive = true; if (!visible) workbench.setVisible(true) }
      else if (everActive && visible) workbench.setVisible(false)
    } finally { syncing = false }
  }
  const syncOverlays = () => {
    // Only the management overlays float above the native frame; native menu and
    // Session navigation dismisses them. The workbench panel itself is dismissed
    // by the panel selection change above, so it needs no abort listener.
    const open = navigation.getSnapshot().panel !== null
    if (!open) { release?.(); release = undefined; return }
    if (release) return
    const signal = layout.beginNavigation()
    const leave = () => navigation.close()
    signal.addEventListener('abort', leave, { once: true })
    release = () => signal.removeEventListener('abort', leave)
  }
  const offWorkbench = workbench.subscribe(syncFromWorkbench)
  const offPanels = layout.panelInfo.subscribe(syncFromPanel)
  const offNavigation = navigation.subscribe(syncOverlays)
  syncFromWorkbench()
  syncFromPanel()
  syncOverlays()
  return { dispose: () => { release?.(); offWorkbench(); offPanels(); offNavigation() }, resync: syncFromWorkbench }
}
