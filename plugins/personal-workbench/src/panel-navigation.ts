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


/** Yield the center column to native menu/session navigation without changing native seats. */
export function bridgeNativeNavigation(layout: import('@deepseek-ai/dsh-client-ui-layout/client').ILayout, workbench: import('./workbench.ts').Workbench, navigation: PanelNavigation) {
  let release: (() => void) | undefined
  const sync = () => {
    const visible = workbench.getSnapshot().visible || navigation.getSnapshot().panel !== null
    if (!visible) { release?.(); release = undefined; return }
    if (release) return
    layout.selectPanel(null)
    const signal = layout.beginNavigation()
    const leave = () => { workbench.closeWorkspace(); navigation.close() }
    signal.addEventListener('abort', leave, { once: true })
    release = () => signal.removeEventListener('abort', leave)
  }
  const removeWorkspace = workbench.subscribe(sync), removeManagement = navigation.subscribe(sync)
  sync()
  return () => { release?.(); removeWorkspace(); removeManagement() }
}
