import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Stable plugin-owned identifier; use a namespaced value such as `kaogong`. */
export type WorkbenchAppId = string & { readonly __workbenchAppId: unique symbol }
/** Stable application-owned instance key. The first release defaults to `default`. */
export type WorkbenchInstanceId = string & { readonly __workbenchInstanceId: unique symbol }
/** Bundled Lucide glyph names supported by the workspace. */
export type WorkbenchIcon = 'book-open' | 'graduation-cap' | 'briefcase' | 'notebook' | 'layout-grid'
/** One application-owned page. Labels are resolved by the registering plugin. */
export interface WorkbenchAppPage { readonly id: string; readonly label: string }
/** Installed capabilities only. No executable code, credentials or Session identities. */
export interface WorkbenchAppDefinition {
  readonly id: WorkbenchAppId
  readonly version: string
  readonly name: string
  readonly icon: WorkbenchIcon
  readonly source: string
  readonly pages: readonly WorkbenchAppPage[]
  readonly defaultLayout: { readonly width: number; readonly height: number; readonly pageId: string }
  readonly roles?: readonly { readonly id: string; readonly name: string }[]
  readonly dependencies?: readonly { readonly id: string; readonly available: boolean; readonly reason?: string }[]
}
/** Serializable view state supplied to the registered application slot. */
export interface WorkbenchAppOwner {
  readonly appId: WorkbenchAppId
  readonly instanceId: WorkbenchInstanceId
  readonly pageId: string
  /** False while the workspace/window is closed, minimized or behind another app. Views remain mounted until registration disposal; never treat this as cancellation. */
  readonly active: boolean
  /** Select a declared page, persisting only its ID. @param pageId - declared page ID. */
  selectPage(pageId: string): void
  /** Close this UI occurrence without cancelling, archiving or deleting a Session. */
  close(): void
}
/** Compose this with the app's own injected/locale/render shares. */
export type WorkbenchAppProps = PropsRuntime<'personal-workbench.app'>

/** Optional client integration; behavior is reached through Cordis, never a value import. */
export interface PersonalWorkbench {
  /** Register installed metadata. Duplicate IDs throw; disposal retires its windows.
   * @param definition - current installed application definition.
   * @returns idempotent registration disposer; wrap in the registering plugin's effect.
   */
  registerApp(definition: WorkbenchAppDefinition): () => void
  /** Open or focus one instance. Missing registrations throw; performs no model calls.
   * @param appId - registered application ID.
   * @param instanceId - stable application-owned ID, defaults to `default`.
   */
  openApp(appId: WorkbenchAppId, instanceId?: WorkbenchInstanceId): void
  /** Open the shared catalog without changing DSH's main Session selection. */
  openWorkspace(): void
}

declare module '@deepseek-ai/cordis' {
  interface Context { personalWorkbench: PersonalWorkbench }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Registered by app ID; no ambient Session is inherited. */
    'personal-workbench.app': { kind: 'keyed'; scope: 'root'; owner: WorkbenchAppOwner }
  }
}
