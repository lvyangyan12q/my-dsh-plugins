import { useEffect, useRef } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { TeacherWindow, parseAssociation } from './teacher-window.ts'
import { en, zh } from './locale.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { 'personal-workbench.teacher': { kind: 'single'; scope: 'session' } }
  interface LocaleNamespaceMap { 'personal-workbench': keyof typeof en }
}

interface WindowInjected {
  hooks: { teacherWindow: TeacherWindow }
  open: TeacherWindow['open']
  close: TeacherWindow['close']
  mount: TeacherWindow['mount']
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
  const { useTeacherWindow, SessionProvider, renderSlot, close, open, mount, t } = props
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
          <SessionProvider session={state.reference} empty={() => <p role="alert">{t('session')}</p>}>
            {renderSlot('personal-workbench.teacher', {})}
          </SessionProvider>
        </MountedTeacher>
      )}
    </dialog>
  )
}

function NativeTeacher({ useSession, renderFactorySlot, t }: PropsRuntime<'personal-workbench.teacher'> & PropsRenderFactories & PropsLocale<'personal-workbench'>) {
  const session = useSession(s => s)
  if (session.openState !== 'open') return <p role="alert">{t('session')}</p>
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, {
    fallback: <p role="alert">{t('unavailable')}</p>,
  })
}

function Launcher({ open, t }: PropsRuntime<'sidebar.footer.action'> & PropsLocale<'personal-workbench'> & { open: TeacherWindow['open'] }) {
  return <button type="button" onClick={() => { void open() }} title={t('open')} aria-label={t('open')}>T</button>
}

export const inject = ['slots', 'sessions', 'uiSession', 'uiConversation', 'locale']

/** Add one launcher and one explicit-session overlay through native slots. */
export function apply(ctx: Context): void {
  const teacher = new TeacherWindow(ctx.sessions, async signal => {
    const response = await fetch('/api/personal-workbench/teacher', { signal, credentials: 'same-origin', cache: 'no-store' })
    if (!response.ok) throw new Error('Teacher association unavailable')
    return parseAssociation(await response.json())
  })
  ctx.effect(() => () => { teacher.dispose() }, 'personal-workbench: local teacher reference')
  ctx.effect(() => ctx.locale.register('personal-workbench', { en, zh }), 'personal-workbench: locale')
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'personal-workbench', locale: 'personal-workbench',
    children: { 'personal-workbench.teacher': { kind: 'single', scope: 'session' } },
    inject: (): WindowInjected => ({ hooks: { teacherWindow: teacher }, open: teacher.open, close: teacher.close, mount: teacher.mount }),
  }, Window))
  ctx.slots.inject('personal-workbench.teacher', () => ctx.slots.register({
    name: 'personal-workbench.teacher', locale: 'personal-workbench',
  }, NativeTeacher))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'personal-workbench', locale: 'personal-workbench',
    inject: () => ({ open: teacher.open }),
  }, Launcher))
}
