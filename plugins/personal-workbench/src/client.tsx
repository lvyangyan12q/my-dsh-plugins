import { installDisplayModules } from './display-view.tsx'
import { installTasks } from './task-view.tsx'
import { installRecipeClient } from './recipe-client.tsx'
import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { useEffect, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-plugin-manager/client'
import { TeacherWindow, parseAssociation } from './teacher-window.ts'
import { en, zh } from './locale.ts'
import type {} from './workbench-api.ts'
import { Workbench } from './workbench.ts'
import { installOptionalBetterSidebar } from './better-sidebar.tsx'
import { Workspace, WorkspaceLauncher, ManagementPanel } from './workbench-view.tsx'
import type { WorkspaceInjected } from './workbench-view.tsx'
import { PanelNavigation, bridgeNativeNavigation } from './panel-navigation.ts'
import { installRoleClient } from './role-view.tsx'
export type { RoleBindingKey, RoleBinding, PersonalWorkbenchRoles, TeachingEvidence } from './role-binding-api.ts'
export type { ManagementCatalog, ManagedRole, ManagedSkill, SkillAssignment, ManagementRequest } from './management-api.ts'

export type { PersonalWorkbench, WorkbenchAppDefinition, WorkbenchAppPage, WorkbenchAppProps,
  WorkbenchAppOwner, WorkbenchAppId, WorkbenchInstanceId, WorkbenchIcon } from './workbench-api.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { 'personal-workbench.teacher': { kind: 'single'; scope: 'session' } }
  interface LocaleNamespaceMap { 'personal-workbench': keyof typeof en }
}

interface WindowInjected {
  hooks: { teacherWindow: TeacherWindow }
  open: TeacherWindow['open']
  close: TeacherWindow['close']
  mount: TeacherWindow['mount']
  retry: TeacherWindow['retry']
}
type WindowProps = PropsRuntime<'shell.overlay'> & PropsRenderSlots<'personal-workbench.teacher'>
  & PropsLocale<'personal-workbench'> & InjectFace<WindowInjected>

function MountedTeacher({ reference, mount, children }: {
  reference: SessionReference; mount: TeacherWindow['mount']; children: React.ReactNode
}) {
  useEffect(() => mount(reference), [mount, reference])
  return children
}

function Window(props: WindowProps) {
  const { useTeacherWindow, SessionProvider, renderSlot, close, open, mount, retry, t } = props
  const state = useTeacherWindow(value => value)
  const dialog = useRef<HTMLDialogElement>(null)
  const visible = state.phase !== 'closed'
  useEffect(() => {
    if (!visible) return
    const before = document.activeElement
    dialog.current?.focus()
    return () => { if (before instanceof HTMLElement && before.isConnected) before.focus() }
  }, [visible])
  if (!visible) return null
  return (
    <dialog open ref={dialog} tabIndex={-1} aria-label={t('title')}
      onKeyDown={event => { if (event.target === dialog.current && event.key === 'Escape' && !event.defaultPrevented && !event.nativeEvent.isComposing) { event.preventDefault(); close() } }}
      style={{ position: 'fixed', inset: 'max(36px, 5vh) 5vw 5vh', margin: 0, width: 'auto', height: 'auto', maxWidth: 'none', maxHeight: 'none', padding: 0,
        display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, pointerEvents: 'auto', zIndex: 1,
        background: 'var(--dsw-alias-bg-base)', color: 'var(--dsw-alias-text-primary)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 8, flex: 'none' }}>
        <span>{t('title')}</span>
        <button type="button" onClick={close} title={t('close')} aria-label={t('close')}>×</button>
      </header>
      {state.phase === 'loading' && <p role="status">{t('loading')}</p>}
      {state.phase === 'error' && <div role="alert"><p>{t(state.reason)}</p><button type="button" onClick={() => { void open() }}>{t('retry')}</button></div>}
      {state.phase === 'open' && (
        <MountedTeacher reference={state.reference} mount={mount}>
          <SessionProvider session={state.reference} empty={() => <div role="alert"><p>{t('session')}</p><button type="button" onClick={() => { void retry(state.reference.sessionId) }}>{t('retry')}</button></div>}>
            {renderSlot('personal-workbench.teacher', {})}
          </SessionProvider>
        </MountedTeacher>
      )}
    </dialog>
  )
}

function NativeTeacher({ useSession, renderFactorySlot, t, retry }: PropsRuntime<'personal-workbench.teacher'> & PropsRenderFactories & PropsLocale<'personal-workbench'> & { retry: () => Promise<void> }) {
  const session = useSession(s => s)
  if (session.removed || session.openState !== 'open') return <div role="alert"><p>{t('session')}</p><button type="button" onClick={() => { void retry() }}>{t('retry')}</button></div>
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, {
    fallback: <p role="alert">{t('unavailable')}</p>,
  })
}

export const inject = ['slots', 'sessions', 'workspaces', 'uiSession', 'uiConversation', 'locale']

/** Register the shared application workspace and the independent native teacher proof.
 * @param ctx - client plugin context; all registrations unwind with its fiber.
 */
export function apply(ctx: Context): void {
  const workbench = new Workbench({
    getItem: key => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
  }, async () => {
    const response=await fetch('/api/personal-workbench/apps',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'catalog'})})
    if(!response.ok) throw new Error('Application availability unavailable')
    const data=await response.json() as {version:number;states:import('./app-lifecycle-api.ts').AppLifecycleState[]}
    if(data.version!==1 || !Array.isArray(data.states)) throw new Error('Invalid application availability')
    return data.states
  })
  const setAppEnabled=async(appId:string,enabled:boolean)=>{
    const expectedRevision=workbench.getSnapshot().lifecycle[appId]?.revision??0
    const response=await fetch('/api/personal-workbench/apps',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({action:'set-enabled',appId,enabled,expectedRevision})})
    const data=await response.json() as {state?:import('./app-lifecycle-api.ts').AppLifecycleState;error?:string}
    if(!response.ok || !data.state) throw new Error(data.error??'Application availability update failed')
    workbench.applyLifecycle([...Object.values(workbench.getSnapshot().lifecycle).filter(row=>row.appId!==appId),data.state])
  }
  ctx.effect(() => installDisplayModules(), 'public display modules')
  const refreshRecipes = installRecipeClient(ctx, workbench)
  const navigation = new PanelNavigation()
  ctx.effect(() => () => navigation.dispose(), 'independent management navigation')
  ctx.inject(['layout'], child => child.effect(() => bridgeNativeNavigation(child.layout, workbench, navigation), 'native menu navigation priority'))
  ctx.effect(() => workbench.subscribe(() => { if (workbench.getSnapshot().visible) navigation.close() }), 'root panel exclusivity')
  const openManagement = (panel: 'agents' | 'skills') => { workbench.closeWorkspace(); navigation.open(panel) }
  ctx.effect(() => () => { workbench.dispose() }, 'personal-workbench: registry lifetime')
  ctx.effect(() => ctx.reflect.provide('personalWorkbench', workbench), 'personal-workbench: public service')
  const teacher = new TeacherWindow(ctx.sessions, async signal => {
    const response = await fetch('/api/personal-workbench/teacher', { signal, credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error('Teacher association unavailable')
    return parseAssociation(await response.json())
  }, ctx.workspaces.list)
  ctx.effect(() => () => { teacher.dispose() }, 'personal-workbench: local teacher reference')
  ctx.effect(() => ctx.locale.register('personal-workbench', { en, zh }), 'personal-workbench: locale')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'personal-workbench', locale: 'personal-workbench',
    children: { 'personal-workbench.teacher': { kind: 'single', scope: 'session' } },
    inject: (): WindowInjected => ({ hooks: { teacherWindow: teacher }, open: teacher.open, close: teacher.close, mount: teacher.mount, retry: teacher.retry }),
  }, Window))
  ctx.slots.inject('personal-workbench.teacher', () => ctx.slots.register({
    name: 'personal-workbench.teacher', locale: 'personal-workbench',
    inject: (sessionId: SessionId) => ({ retry: () => teacher.retry(sessionId) }),
  }, NativeTeacher))

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'personal-workbench.workspace', locale: 'personal-workbench',
    children: { 'personal-workbench.app': { kind: 'keyed', scope: 'root' } },
    inject: (): WorkspaceInjected => ({ hooks: { workbench }, openWorkspace: workbench.openWorkspace,
      closeWorkspace: workbench.closeWorkspace, openApp: workbench.openApp, focusWindow: workbench.focus,
      setMode: workbench.setMode, selectPage: workbench.selectPage, setGeometry: workbench.setGeometry,
      setPreference: workbench.setPreference, setAppEnabled, refreshRecipes, refreshApps: workbench.loadLifecycle, management: { openBundle: ctx.get('pluginNavigation')?.openBundle, openSession: ctx.get('uiWorkspace') ? (id: string) => { (ctx.get('uiWorkspace') as UiWorkspace).openSession(id as SessionId); navigation.close(); workbench.closeWorkspace() } : undefined } }),
  }, Workspace))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'personal-workbench.workspace', locale: 'personal-workbench',
    inject: () => ({ hooks: { workbench }, openWorkspace: workbench.openWorkspace, openApp: workbench.openApp, openAgents: () => openManagement('agents'), openSkills: () => openManagement('skills') }),
  }, WorkspaceLauncher))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'personal-workbench.management', locale: 'personal-workbench',
    inject: () => ({ hooks: { navigation, workbench }, close: navigation.close, management: { openBundle: ctx.get('pluginNavigation')?.openBundle, openSession: ctx.get('uiWorkspace') ? (id: string) => { (ctx.get('uiWorkspace') as UiWorkspace).openSession(id as SessionId); navigation.close(); workbench.closeWorkspace() } : undefined } }),
  }, ManagementPanel))
  installOptionalBetterSidebar(ctx, workbench)
  installRoleClient(ctx)
  installTasks(ctx)
}

export { registerRecipeModuleRenderer, RecipePage } from './recipe-view.tsx'
export type { RecipeModuleProps } from './recipe-view.tsx'
export type { AppRecipe, RecipeRecord, RecipeModule } from './recipe-api.ts'

export { registerDisplaySource, listDisplaySources, registerRecipeTemplate } from './display-api.ts'
export type { DisplayData, DisplayRecord, DisplaySource, DisplayScope, RecipeTemplate } from './display-api.ts'
export { DisplayStore } from './display-store.ts'
export { DisplayModule, DisplayModules } from './display-view.tsx'
export { RecipeEditor } from './recipe-editor.tsx'
export { PreparedTaskEditor } from './task-view.tsx'
export type { PersonalWorkbenchTasks, PreparedTask, TaskContext, TaskState } from './task-api.ts'
