/**
 * 讲义选区边界：只有完全位于讲义正文 DOM 内的选区才算“选段”。这样从讲义
 * 拖到笔记或老师对话时，不会把隐私内容误当成讲义原文追加进笔记。
 */
export interface LectureSelection {
  /** 纯文本原文（selection.toString()），未做 Markdown 解释。 */
  text: string
  /** 选区之前最近的真实标题文本；没有真实标题时为 null。 */
  heading: string | null
}

const documentPositionFollowing = 4

function inside(root: HTMLElement, node: Node | null): boolean {
  if (node === null) return false
  return node === root || root.contains(node)
}

function headingBefore(root: HTMLElement, start: Node): string | null {
  let heading: string | null = null
  for (const element of Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6'))) {
    if (element.contains(start)) {
      heading = element.textContent?.trim() || null
      break
    }
    if ((element.compareDocumentPosition(start) & documentPositionFollowing) !== 0) {
      heading = element.textContent?.trim() || null
    }
  }
  return heading
}

/**
 * Read the learner's current selection only when it is entirely inside `root`.
 * Anchor and focus are checked separately so a selection dragged in either
 * direction, or one whose range merely intersects the lecture, is refused.
 */
export function lectureSelection(root: HTMLElement | null): LectureSelection | null {
  if (root === null || typeof window === 'undefined') return null
  const selection = window.getSelection?.() ?? null
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  if (!inside(root, range.startContainer) || !inside(root, range.endContainer)) return null
  if (!inside(root, range.commonAncestorContainer)) return null
  if (!inside(root, selection.anchorNode) || !inside(root, selection.focusNode)) return null

  const text = selection.toString().trim()
  if (text === '') return null
  return { text, heading: headingBefore(root, range.startContainer) }
}
