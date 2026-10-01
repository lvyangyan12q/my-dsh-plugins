import { useEffect, useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { PersonalWorkbench, WorkbenchAppDefinition, WorkbenchAppId, WorkbenchInstanceId, WorkbenchAppProps } from '@deepseek-ai/dsh-personal-workbench/client'
import { KaogongClassroom } from './classroom.tsx'
import type { KaogongViewProps } from './kaogong-view.tsx'
import { KaogongStateContext, KaogongViewState, useBusinessState } from './view-state.tsx'

export { KaogongView } from './kaogong-view.tsx'
export type { KaogongViewProps, KaogongTeachingRequest, PracticeContext, PracticeResult } from './kaogong-view.tsx'
export { KaogongStateContext, KaogongViewState, useBusinessState } from './view-state.tsx'

type FooterProps = SidebarFooterActionOwnerProps & Partial<PropsRenderFactories>

/** Installed Kaogong pages reuse the existing Host data without migration. */
export const kaogongApp: WorkbenchAppDefinition = {
  id: 'kaogong' as WorkbenchAppId, version: '0.1.0', name: '考公学习', icon: 'graduation-cap',
  source: '@deepseek-ai/dsh-tool-kaogong',
  pages: [{ id: 'classroom', label: '课堂' }, { id: 'practice', label: '练习' }, { id: 'errors', label: '错题' }, { id: 'materials', label: '讲义' }, { id: 'plan', label: '计划' }],
  defaultLayout: { width: 1040, height: 760, pageId: 'classroom' },
}
const defaultInstance = 'default' as WorkbenchInstanceId

/** One state owner is shared by the official entry and optional keyed app view. */
export function KaogongDashboard(props: FooterProps & { ctx: ClientContext; state?: KaogongViewState }) {
  const [local] = useState(() => new KaogongViewState())
  return <KaogongStateContext.Provider value={props.state ?? local}><DashboardContent {...props} /></KaogongStateContext.Provider>
}

function DashboardContent({ wide, renderFactorySlot }: FooterProps & { ctx: ClientContext }) {
  const [integration] = useBusinessState('integration', null)
  const [open, setOpen] = useBusinessState('open', false)

  return (
    <>
      <button
        type="button"
        title="打开考公学习看板"
        aria-label="打开考公学习看板"
        onClick={() => { if (integration) integration.service.openApp(kaogongApp.id, defaultInstance); else setOpen(true) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', gap: 8,
          width: '100%', minHeight: 36, padding: wide ? '7px 10px' : 0, border: 0, borderRadius: 9,
          background: 'transparent', color: colors.ink, cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}
      >
        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, background: colors.blueSoft, color: colors.blue, fontSize: 12, fontWeight: 700 }}>考</span>
        {wide && <span>考公学习</span>}
      </button>
      {!integration && <div hidden={!open} role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-label="考公学习看板" style={{ position: 'fixed', inset: 0, zIndex: 1000, overflow: 'auto', background: '#f8fafc', color: colors.ink, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <KaogongClassroom active={open} onClose={() => setOpen(false)} renderFactorySlot={renderFactorySlot} />
      </div>}
    </>
  )
}

const colors = { ink: '#202124', blue: '#2563eb', blueSoft: '#eff6ff' }
export const inject = ['slots', 'uiWorkspace']

export function apply(ctx: ClientContext): void {
  const state = new KaogongViewState()
  ctx.inject(['personalWorkbenchRoles'], child => {
    const roles = state.cell('roles', null)
    child.effect(() => { roles.set(child.personalWorkbenchRoles); return () => roles.set(null) }, 'kaogong: optional teacher service')
  })
  const Dashboard = (props: FooterProps) => <KaogongDashboard {...props} ctx={ctx} state={state} />
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'kaogong-dashboard',
    order: 10,
    label: '考公学习看板',
  }, Dashboard))
  ctx.inject(['personalWorkbench', 'slots'], child => {
    child.slots.inject('personal-workbench.app', () => {
      const View = (props: WorkbenchAppProps & PropsRenderFactories) => <KaogongStateContext.Provider value={state}><KaogongWorkbenchContent {...props} ctx={ctx} /></KaogongStateContext.Provider>
      const removeView = child.slots.register({ name: 'personal-workbench.app', key: kaogongApp.id }, View)
      let removeApp: () => void
      try { removeApp = child.personalWorkbench.registerApp(kaogongApp) }
      catch (error) { removeView(); throw error }
      const integration = state.cell('integration', null)
      try {
        integration.set({ service: child.personalWorkbench })
        if (state.cell('open', false).value) child.personalWorkbench.openApp(kaogongApp.id, defaultInstance)
      } catch (error) {
        removeApp()
        removeView()
        integration.set(null)
        throw error
      }
      return () => {
        try { removeApp() }
        finally { removeView(); integration.set(null) }
      }
    })
  })
}

/** Page adapter under the existing state provider; an explicit teaching callback owns any role acquisition. */
export function KaogongWorkbenchContent({ instanceId, pageId, active, selectPage, close, onOpenTeacher, renderFactorySlot }: WorkbenchAppProps & Partial<PropsRenderFactories> & { ctx: ClientContext; onOpenTeacher?: KaogongViewProps['onOpenTeacher'] }) {
  const [, setOpen] = useBusinessState('open', false)
  useEffect(() => { if (instanceId === defaultInstance) setOpen(active) }, [active, instanceId, setOpen])
  if (instanceId !== defaultInstance) return <p role="alert">考公当前仅支持默认学习实例。</p>
  return <KaogongClassroom active={active} pageId={pageId} onSelectPage={selectPage} onClose={close} onOpenTeacher={onOpenTeacher} renderFactorySlot={renderFactorySlot} />
}
