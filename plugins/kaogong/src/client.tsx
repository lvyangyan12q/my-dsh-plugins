import { useState } from 'react'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { KaogongView } from './kaogong-view.tsx'

export { KaogongView } from './kaogong-view.tsx'
export type { KaogongViewProps } from './kaogong-view.tsx'

type FooterProps = PropsRuntime<'sidebar.footer.action'>

export function KaogongDashboard({ wide, ctx }: FooterProps & { ctx: ClientContext }) {
  const [open, setOpen] = useState(false)
  const [teacherHandoff, setTeacherHandoff] = useState<{ prompt: string; copied: boolean } | null>(null)
  const openTeacher = async (prompt: string) => {
    ctx.uiWorkspace.startSession()
    setOpen(false)
    setTeacherHandoff({ prompt, copied: false })
    try {
      await navigator.clipboard.writeText(prompt)
      setTeacherHandoff(current => current?.prompt === prompt ? { prompt, copied: true } : current)
    } catch {
      // Keep the prompt available even when clipboard permission is denied.
    }
  }

  return (
    <>
      <button
        type="button"
        title="打开考公学习看板"
        aria-label="打开考公学习看板"
        onClick={() => { setOpen(true) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: wide ? 'flex-start' : 'center', gap: 8,
          width: '100%', minHeight: 36, padding: wide ? '7px 10px' : 0, border: 0, borderRadius: 9,
          background: 'transparent', color: colors.ink, cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}
      >
        <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: 6, background: colors.blueSoft, color: colors.blue, fontSize: 12, fontWeight: 700 }}>考</span>
        {wide && <span>考公学习</span>}
      </button>
      {!open && teacherHandoff && (
        <div role="status" style={{ padding: 10, maxWidth: '100%', overflowWrap: 'anywhere', fontSize: 12, color: colors.ink }}>
          <div>{teacherHandoff.copied ? '教学提示已复制，请在新对话粘贴发送。' : '未能自动复制，请选取下方教学提示。'}</div>
          {!teacherHandoff.copied && <textarea aria-label="教学提示" readOnly value={teacherHandoff.prompt} onFocus={event => event.currentTarget.select()} rows={4} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8 }} />}
          <button type="button" onClick={() => { setTeacherHandoff(null) }} style={smallButton}>关闭提示</button>
        </div>
      )}
      <div hidden={!open} role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined} aria-label="考公学习看板" style={{ position: 'fixed', inset: 0, zIndex: 1000, overflow: 'auto', background: '#f8fafc', color: colors.ink, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <KaogongView active={open} onClose={() => setOpen(false)} onOpenTeacher={openTeacher} />
      </div>
    </>
  )
}

const colors = { ink: '#202124', blue: '#2563eb', blueSoft: '#eff6ff' }
const smallButton = { height: 28, padding: '0 8px', border: '1px solid #bfdbfe', borderRadius: 6, background: colors.blueSoft, color: colors.blue, cursor: 'pointer', fontSize: 12 }
export const inject = ['slots', 'uiWorkspace']

export function apply(ctx: ClientContext): void {
  const Dashboard = (props: FooterProps) => <KaogongDashboard {...props} ctx={ctx} />
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action',
    id: 'kaogong-dashboard',
    order: 10,
    label: '考公学习看板',
  }, Dashboard))
}
