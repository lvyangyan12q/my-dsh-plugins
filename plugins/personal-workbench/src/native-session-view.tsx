import type { ReactNode } from 'react'
import type { PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots'

/** Compose the public native conversation body under the caller's existing SessionProvider.
 * The native title/lineage/actions header is owned by the resident conversation and is not a
 * public factory seat; embedding it would require the removed `conversation.session.chrome`
 * patch. Only the public `conversation.content` body is rendered here. When the full native
 * header is required, open the same Session through native navigation instead.
 */
export function renderNativeSession({ renderFactorySlot, failure, unavailable }: PropsRenderFactories & { failure?: string; unavailable: ReactNode }) {
  const content = renderFactorySlot('conversation.content', { variant: 'embedded', phase: 'active', hero: false }, { fallback: unavailable })
  // The body is a bounded flex seat: long messages cannot push the native
  // composer below a clipped application pane or independent study window.
  return <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, minWidth: 0, overflow: 'hidden' }}>
    {failure && <p role="alert" style={{ flexShrink: 0, maxHeight: '25%', overflow: 'auto', overflowWrap: 'anywhere', margin: 0, padding: '8px 10px' }}>{failure}</p>}
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }}>{content}</div>
  </div>
}
