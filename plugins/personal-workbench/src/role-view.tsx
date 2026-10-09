import type { UiWorkspace } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { useEffect, useState } from 'react'
import { RefreshCw, UserPlus } from 'lucide-react'
import type { Context } from '@deepseek-ai/cordis'
import type { PropsRuntime, FactoryComponentPropsOf, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { RoleBindingKey, RoleViewState } from './role-binding-api.ts'
import { renderNativeSession } from './native-session-view.tsx'
import { RoleAttachment } from './role-attachment.tsx'
import { RoleClients, roleKey } from './role-client.ts'

const EMPTY: RoleViewState = { binding: null, error: null, busy: false, window: { phase: 'closed' } }
function Mounted({ reference, bindingKey, mountRole, children }: { reference: SessionReference; bindingKey: RoleBindingKey; mountRole: FactoryComponentPropsOf<'personal-workbench.role-conversation'>['mountRole']; children: React.ReactNode }) {
  useEffect(() => mountRole(bindingKey, reference), [mountRole, bindingKey, reference])
  return children
}

type RoleViewProps = FactoryComponentPropsOf<'personal-workbench.role-conversation'>
export function RoleConversation({ bindingKey, active, label, expectedPresetId, SessionProvider, renderSlot, useSessionStatus, useRoles, commands, mountRole, openHistory, renderFactorySlot, t }: RoleViewProps) {
  const state = useRoles(value => value.get(roleKey(bindingKey))) ?? EMPTY
  const [attachment, setAttachment] = useState<{ expectedSessionId: SessionId | null } | null>(null)
  const window = state.window
  const presetChanged = !!(expectedPresetId && state.binding && state.binding.presetId !== expectedPresetId)
  const status = useSessionStatus(value => state.binding ? value.get(state.binding.sessionId) : undefined)
  useEffect(() => { if (active && !state.binding && !state.error && !state.busy) void commands.open(bindingKey).catch(() => {}) }, [active, bindingKey, commands])
  const retry = () => { const binding = state.binding; void (binding ? commands.retry(bindingKey, binding.sessionId) : commands.open(bindingKey)).catch(() => {}) }
  const replace = () => { const binding = state.binding; if (binding && globalThis.confirm('保留原会话并新建角色会话？')) void commands.replace(bindingKey, binding.sessionId).catch(() => {}) }
  return <section data-pwb-role-key={roleKey(bindingKey)} aria-label="持续角色会话" style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, height: '100%', background: 'var(--dsw-alias-bg-base, #fff)' }}>
    <header style={{ position: 'relative', zIndex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '6px 10px', borderBottom: '1px solid #ddd', fontSize: 12 }}>
      <strong>{label ?? bindingKey.subject ?? bindingKey.roleId}</strong><span style={{ flex: 1 }} />
      {status?.running && <span role="status">运行中</span>}{status?.pendingInteraction && <span role="status">待处理：{status.pendingInteraction.kind}</span>}{status?.completionUnread && <span role="status">未读完成</span>}
      {!state.binding && !state.error && window.phase !== 'error' && <button data-pwb-button data-variant="primary" disabled={state.busy} onClick={() => { void commands.ensure(bindingKey).catch(() => {}) }}>创建{label ?? '角色会话'}</button>}
      {(state.error || window.phase === 'error' || state.binding?.phase === 'intent') && <button data-pwb-button disabled={state.busy} onClick={retry}><RefreshCw size={14} /> 重试</button>}
      {commands.attach && <button data-pwb-button disabled={state.busy} onClick={() => setAttachment({ expectedSessionId: state.binding?.sessionId ?? null })}>{t('roleAttach')}</button>}
      {state.binding && <details style={{ position: 'relative' }}><summary aria-label="角色会话更多操作" style={{ cursor: 'pointer' }}>更多</summary><div style={{ position: 'absolute', right: 0, top: 24, zIndex: 2, minWidth: 180, padding: 10, background: 'var(--dsw-alias-bg-base, #fff)', border: '1px solid #ddd', borderRadius: 6 }}>
        <p style={{ overflowWrap: 'anywhere', margin: '0 0 8px' }}>会话：{state.binding.sessionId}</p>
        <button data-pwb-button disabled={state.busy} onClick={replace}><UserPlus size={14} /> 新建角色会话</button>
        {!!state.binding.previousSessionIds.length && <div role="group" aria-label={t('roleHistory')} style={{maxHeight:180,overflow:'auto',display:'flex',flexDirection:'column',gap:6,marginTop:10}}>{[...state.binding.previousSessionIds].reverse().map(id=><button key={id} data-pwb-button type="button" disabled={state.busy||!openHistory} aria-label={t('roleOpenHistory')+': '+id} title={!openHistory?t('roleHistoryUnavailable'):undefined} style={{whiteSpace:'normal',overflowWrap:'anywhere',textAlign:'left'}} onClick={()=>openHistory?.(id)}>{t('roleOpenHistory')} · {id}</button>)}</div>}
      </div></details>}
    </header>
    {attachment && renderFactorySlot('personal-workbench.role-attachment', { bindingKey, expectedSessionId: attachment.expectedSessionId, close: () => setAttachment(null) })}
    {presetChanged && <p role="alert">{t('rolePresetChanged')}</p>}
    {state.busy && <p role="status">正在连接角色会话…</p>}
    {state.error && <p role="alert">{state.error}</p>}
    {window.phase === 'error' && <p role="alert">角色会话不可访问。请同 ID 重试或显式新建。</p>}
    {!presetChanged && window.phase === 'closed' && !state.busy && !state.error && <p>{state.binding?.phase === 'intent' ? '角色创建尚未完成，请同 ID 重试。' : '点击创建，开始与角色对话。'}</p>}
    {!presetChanged && window.phase === 'open' && <div style={{ position: 'relative', zIndex: 0, flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}><Mounted reference={window.reference} bindingKey={bindingKey} mountRole={mountRole}><SessionProvider session={window.reference} empty={() => <p role="alert">角色会话不可访问。请同 ID 重试。</p>}>
      {renderSlot('personal-workbench.role-native', {})}
    </SessionProvider></Mounted></div>}
  </section>
}
function RoleNative({ renderFactorySlot, useSession }: PropsRuntime<'personal-workbench.role-native'> & PropsRenderFactories) {
  const failure = useSession(value => value.lastAgentError ?? value.openError?.message ?? value.promptError?.error.message)
  return renderNativeSession({ renderFactorySlot, failure, unavailable: <p role="alert">原生会话组件不可用。</p> })
}
/** Optional native surface. Registration does not read metadata or acquire a Session. */
export function installRoleClient(ctx: Context, onOpenHistory?: () => void) {
  ctx.inject(['uiConversation'], child => {
    const owner = new RoleClients(child)
    child.effect(() => () => owner.dispose(), 'personal-workbench: teacher owner')
    child.effect(() => child.reflect.provide('personalWorkbenchRoles', owner), 'personal-workbench: roles service')
    child.slots.registerFactory({ name: 'personal-workbench.role-attachment', scope: 'root', locale: 'personal-workbench', inject: () => ({ commands: owner }) }, RoleAttachment)
    child.slots.registerFactory({ name: 'personal-workbench.role-conversation', scope: 'root', locale: 'personal-workbench', children: { 'personal-workbench.role-native': { kind: 'single', scope: 'session' } },
      inject: () => ({ hooks: { roles: owner }, commands: owner, mountRole: (key, reference) => owner.owner(key).teacher.mount(reference), openHistory: child.get?.('uiWorkspace') ? (id: SessionId) => { (child.get('uiWorkspace') as UiWorkspace).openSession(id); onOpenHistory?.() } : undefined }),
    }, RoleConversation)
    child.slots.inject('personal-workbench.role-native', () => child.slots.register({ name: 'personal-workbench.role-native' }, RoleNative))
  })
}
