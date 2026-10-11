import type { Context } from '@deepseek-ai/cordis'
import type { BetterSidebarService, SidebarSnapshot, SidebarState, TabDescriptor, SessionScope } from 'dsh-better-sidebar/client/service'

/** Test provider limited to the public methods the adapter consumes. */
export class SidebarFixture implements Pick<BetterSidebarService,
  'version' | 'features' | 'registerTab' | 'openTab' | 'closeTab' | 'getSnapshot' | 'subscribeState' | 'isTabEnabled'> {
  version = '0.24.1'
  features = ['tabLifecycle', 'stateSubscription', 'targetedOpen']
  descriptors = new Map<string, TabDescriptor>()
  states = new Map<string, SidebarState>()
  listeners = new Set<() => void>()
  sessionId = 'main'
  registrations = 0
  removals = 0
  closed: string[] = []
  prefs: SidebarSnapshot['prefs'] = {
    autoOpenSubagent: false, autoOpenJobs: false, tasksViewMode: 'tree', mobileNoAutoOpen: true, mobileDefaultTree: true,
    agentOpenTools: false, editorExplorer: true, titleBarScheme: 'web', titleBarPresetId: '', customCss: '',
    titleBarCompat: false, titleBarStripPx: 40, htmlViewerNoSandbox: false, htmlViewerDefaultUnsafe: false,
    tabsEnabled: {}, viewersEnabled: {}, pluginSettings: {},
  }
  registerTab: BetterSidebarService['registerTab'] = descriptor => {
    if (this.descriptors.has(descriptor.id)) throw new Error('Duplicate tab descriptor')
    this.registrations++
    this.descriptors.set(descriptor.id, descriptor)
    let active = true
    return () => { if (active) { active = false; this.removals++; this.descriptors.delete(descriptor.id) } }
  }
  isTabEnabled: BetterSidebarService['isTabEnabled'] = id => this.prefs.tabsEnabled[id] !== false
  getSnapshot: BetterSidebarService['getSnapshot'] = () => ({ sessionId: this.sessionId, state: this.states.get(this.sessionId), prefs: this.prefs })
  subscribeState: BetterSidebarService['subscribeState'] = listener => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  emit() { for (const listener of this.listeners) listener() }
  state(id: string): SidebarState {
    let state = this.states.get(id)
    if (!state) {
      state = { activePane: 'pane', nextBrowser: 0, expanded: [], revealed: [], bottomOpen: false, bottomHeight: 220,
        bottomSplits: { kind: 'leaf', id: 'pane', tabs: [], active: null } }
      this.states.set(id, state)
    }
    return state
  }
  openTab: BetterSidebarService['openTab'] = (seed, scope = { sessionId: this.sessionId }) => {
    const descriptor = this.descriptors.get(seed.type)
    if (!descriptor || !this.isTabEnabled(seed.type)) return
    if (seed.path || seed.url || seed.target) throw new Error('Expected a plain bottom custom tab')
    const state = this.state(scope.sessionId)
    const leaf = state.bottomSplits
    if (leaf.kind !== 'leaf') throw new Error('Fixture expects one pane')
    let tab = descriptor.single ? leaf.tabs.find(row => row.type === seed.type) : undefined
    if (!tab) {
      tab = { id: seed.id ?? seed.type, type: seed.type, title: typeof descriptor.title === 'function' ? descriptor.title() : descriptor.title }
      leaf.tabs.push(tab)
      descriptor.onOpen?.(tab, scope)
    } else descriptor.onActivate?.(tab, scope)
    leaf.active = tab.id
    state.bottomOpen = true
    this.emit()
  }
  closeTab: BetterSidebarService['closeTab'] = (id, scope = { sessionId: this.sessionId }) => {
    const state = this.states.get(scope.sessionId)
    if (!state) return
    const walk = (node: SidebarState['bottomSplits']) => {
      if (node.kind === 'split') { node.children.forEach(walk); return }
      const tab = node.tabs.find(row => row.id === id)
      if (!tab) return
      node.tabs = node.tabs.filter(row => row.id !== id)
      this.descriptors.get(tab.type)?.onClose?.(tab, scope)
      this.closed.push(`${scope.sessionId}:${id}`)
    }
    walk(state.bottomSplits)
    this.emit()
  }
}

/** Provide the public fixture through real Cordis; service loss must dispose injected children. */
export function provideSidebar(ctx: Context, fixture: SidebarFixture) {
  return ctx.plugin({ apply: child => { child.effect(() => child.reflect.provide('betterSidebar', fixture)) } })
}
