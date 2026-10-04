import type { ReactNode } from 'react'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'

/** Compose native navigation and body under the caller's existing SessionProvider.
 * All title, lineage, actions and Chat/Trajectory state remain owned by DSH.
 */
export function renderNativeSession({ renderFactorySlot, failure, unavailable }: PropsRenderFactories & { failure?: string; unavailable: ReactNode }) {
  const content = renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { fallback: unavailable })
  // Both surfaces are bounded flex seats: long messages cannot push the native
  // composer below a clipped application pane or independent study window.
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
    <div style={{ flexShrink: 0, minWidth: 0 }}>{renderFactorySlot('conversation.session.chrome', { hideChrome: false }, { fallback: <p role="alert">原生会话标题栏不可用，请检查 DSH 会话组件版本。</p> })}</div>
    {failure && <p role="alert" style={{ flexShrink: 0, maxHeight: '25%', overflow: 'auto', overflowWrap: 'anywhere', margin: 0, padding: '8px 10px' }}>{failure}</p>}
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>{content}</div>
  </div>
}
