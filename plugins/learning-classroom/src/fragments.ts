import { headingKey } from './links.ts'

/** A resolved real heading/block location inside a rendered Markdown body. */
export interface LinkFragment {
  heading?: string | null
  blockId?: string | null
}

function inlinePlain(text: string): string {
  return text.replace(/\*\*|__|`|~~|\*|_/g, '')
}

function reveal(element: HTMLElement): void {
  if (typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center' })
  }
  if (!element.hasAttribute('tabindex')) element.setAttribute('tabindex', '-1')
  try {
    element.focus({ preventScroll: true })
  } catch {
    // jsdom and older engines may not implement focus options; scrolling still happened.
  }
}

/**
 * Move to the real heading or existing block inside an already rendered body.
 * A link whose fragment cannot be found is reported as false: opening the file
 * alone must not be presented as exact anchor navigation.
 */
export function scrollToFragment(root: HTMLElement | null, fragment: LinkFragment): boolean {
  if (root === null) return false
  if (fragment.heading !== undefined && fragment.heading !== null && fragment.heading.trim() !== '') {
    const wanted = headingKey(fragment.heading)
    const plain = headingKey(inlinePlain(fragment.heading))
    const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .filter(element => element instanceof HTMLElement) as HTMLElement[]
    const found = headings.find(element => {
      const text = element.textContent?.trim() ?? ''
      return headingKey(text) === wanted || headingKey(inlinePlain(text)) === plain
    })
    if (found !== undefined) {
      reveal(found)
      return true
    }
  }
  if (fragment.blockId !== undefined && fragment.blockId !== null && fragment.blockId.trim() !== '') {
    const marker = `^${fragment.blockId.trim()}`.toLowerCase()
    const candidates = Array.from(root.querySelectorAll('p, li, blockquote, td, th, pre, h1, h2, h3, h4, h5, h6'))
      .filter(element => element instanceof HTMLElement) as HTMLElement[]
    const found = candidates.find(element => (element.textContent ?? '').trimEnd().toLowerCase().endsWith(marker))
    if (found !== undefined) {
      reveal(found)
      return true
    }
  }
  return false
}
