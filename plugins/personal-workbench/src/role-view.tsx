import { useEffect, useSyncExternalStore } from 'react'
import { RefreshCw, UserPlus } from 'lucide-react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime, FactoryComponentPropsOf, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { RoleBindingKey } from './role-binding-api.ts'
import { RoleClient } from './role-client.ts'

function Mounted({ reference, owner, children }: { reference: SessionReference; owner: RoleClient; children: React.ReactNode }) {
  useEffect(() => owner.teacher.mount(reference), [owner, reference])
  return children
}
type RoleViewProps = FactoryComponentPropsOf<'personal-workbench.role-conversation'> & { owner: RoleClient }
export function RoleConversation({ owner, bindingKey, active, SessionProvider, renderSlot }: RoleViewProps) {
  const state = useSyncExternalStore(owner.subscribe, owner.getSnapshot)
  const window = useSyncExternalStore(owner.teacher.subscribe, owner.teacher.getSnapshot)
  const supported = bindingKey.appId === 'kaogong' && bindingKey.instanceId === 'default' && bindingKey.roleId === 'teacher' && bindingKey.subject === undefined
  useEffect(() => { if (supported && active && !state.binding && !state.error && !state.busy) void owner.open(bindingKey).catch(() => {}) }, [active, bindingKey, owner, supported])
  if (!supported) return <p role="alert">当前角色课堂不可用。</p>
  const retry = () => { const binding = owner.getSnapshot().binding; void (binding ? owner.retry(bindingKey, binding.sessionId) : owner.open(bindingKey)).catch(() => {}) }
  const replace = () => { const binding = owner.getSnapshot().binding; if (binding && globalThis.confirm('保留原会话并新建老师？')) void owner.replace(bindingKey, binding.sessionId).catch(() => {}) }
  return <section aria-label="固定老师" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%', background: 'var(--dsw-alias-bg-base, #fff)' }}>
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #ddd', fontSize: 12 }}>
      <strong>固定老师</strong><span style={{ overflowWrap: 'anywhere', flex: 1 }}>{state.binding?.sessionId ?? '尚未创建'}</span>
      <button title="同 ID 重试" aria-label="同 ID 重试" disabled={state.busy} onClick={retry}><RefreshCw size={16} /></button>
      <button title="显式新建老师" aria-label="显式新建老师" disabled={!state.binding || state.busy} onClick={replace}><UserPlus size={16} /></button>
    </header>
    {state.busy && <p role="status">正在连接老师…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {window.phase === 'error' && <p role="alert">老师会话不可访问。请同 ID 重试或显式新建。</p>}
    {window.phase === 'closed' && !state.busy && !state.error && <p>{state.binding?.phase === 'intent' ? '老师创建尚未完成，请同 ID 重试。' : '选择课堂目标后开始教学。'}</p>}
    {window.phase === 'open' && <div style={{ flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}><Mounted reference={window.reference} owner={owner}><SessionProvider session={window.reference} empty={() => <p role="alert">老师会话不可访问。请同 ID 重试。</p>}>
      {renderSlot('personal-workbench.role-native', {})}
    </SessionProvider></Mounted></div>}
  </section>
}
function RoleNative({ renderFactorySlot }: PropsRuntime<'personal-workbench.role-native'> & PropsRenderFactories) {
  return renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { fallback: <p role="alert">原生会话组件不可用。</p> })
}
/** Optional native surface. Registration does not read metadata or acquire a Session. */
export function installRoleClient(ctx: Context) {
  ctx.inject(['conversation'], child => {
    const owner = new RoleClient(child)
    child.effect(() => () => owner.dispose(), 'personal-workbench: teacher owner')
    child.effect(() => child.reflect.provide('personalWorkbenchRoles', owner), 'personal-workbench: roles service')
    const View = (props: FactoryComponentPropsOf<'personal-workbench.role-conversation'>) => <RoleConversation {...props} owner={owner} />
    child.slots.registerFactory({ name: 'personal-workbench.role-conversation', scope: 'root', children: { 'personal-workbench.role-native': { kind: 'single', scope: 'session' } } }, View)
    child.slots.inject('personal-workbench.role-native', () => child.slots.register({ name: 'personal-workbench.role-native' }, RoleNative))
  })
}
