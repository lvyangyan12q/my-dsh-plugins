import { useEffect, useRef, type ReactNode } from 'react'

/** An embedded conversation does not own a still-active application control.
 * Only standard focus events are used: native editor markup and commands stay private.
 */
export function EmbeddedSessionFocus({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const owner = useRef<HTMLElement | null>(
    typeof document !== 'undefined' && typeof HTMLElement !== 'undefined' && document.activeElement instanceof HTMLElement && document.activeElement.tabIndex >= 0
      ? document.activeElement : null,
  )
  useEffect(() => {
    const document = root.current?.ownerDocument
    if (!document) return
    // Explicit pointer interaction anywhere, or keyboard navigation away from
    // the selector, transfers focus ownership. Mount-time focus has neither.
    const pointer = () => { owner.current = null }
    const keyboard = (event: KeyboardEvent) => { if (event.key === 'Tab') owner.current = null }
    document.addEventListener('pointerdown', pointer, true)
    document.addEventListener('keydown', keyboard, true)
    return () => {
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('keydown', keyboard, true)
    }
  }, [])
  return <div ref={root} style={{ position: 'relative', zIndex: 0, flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' }} onFocusCapture={() => {
    const control = owner.current
    if (!control?.isConnected || root.current?.contains(control)) { owner.current = null; return }
    control.focus({ preventScroll: true })
  }}>{children}</div>
}
