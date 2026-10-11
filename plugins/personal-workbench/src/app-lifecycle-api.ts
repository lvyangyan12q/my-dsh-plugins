import type {} from '@deepseek-ai/cordis'
export interface AppLifecycleState { readonly appId: string; readonly enabled: boolean; readonly revision: number }
export interface AppLifecycleCatalog { readonly version: 1; readonly states: readonly AppLifecycleState[] }
export type AppLifecycleRequest = { action: 'catalog' } | { action: 'set-enabled'; appId: string; enabled: boolean; expectedRevision: number }
export interface PersonalWorkbenchApps {
 read(appId: string): AppLifecycleState
 list(): AppLifecycleCatalog
 setEnabled(appId: string, enabled: boolean, expectedRevision: number): Promise<AppLifecycleState>
}
declare module '@deepseek-ai/cordis' { interface Context { personalWorkbenchApps: PersonalWorkbenchApps } }
