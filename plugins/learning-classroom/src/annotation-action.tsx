import { useRef, useState, type ReactNode } from 'react'
import { boundExcerpt } from './annotations.ts'
import { lectureSelection } from './annotation-selection.ts'
import type { LectureReadView } from './contract.ts'
import type { AnnotationSourceInput } from './annotation-flow.ts'

export interface AnnotationActionProps {
  doc: LectureReadView
  /** Host-backed append flow; when absent, no annotation affordance is shown. */
  onAnnotate?: (request: AnnotationSourceInput) => Promise<{ ok: boolean; message: string }>
  /** The rendered lecture body; selection is only accepted inside it. */
  children: ReactNode
}

const styles = `
.lc-annotation{display:flex;flex-direction:column;gap:8px;min-width:0}
.lc-annotation-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.lc-annotation-actions button{padding:4px 10px;border:1px solid var(--dsh-border,#d8dee4);border-radius:6px;background:var(--dsh-surface,#fff);color:inherit;cursor:pointer;font-size:12px}
.lc-annotation-actions button:disabled{opacity:.5;cursor:default}
.lc-annotation-actions p{margin:0;font-size:12px;color:var(--dsh-text-secondary,#59636e);overflow-wrap:anywhere}
.lc-annotation-body{display:flex;flex-direction:column;gap:10px;min-width:0}
`

/**
 * “追加到笔记” only uses a selection that is entirely inside the rendered
 * lecture body. The excerpt is saved as plain text, and the Host resolves the
 * real file/heading source before anything reaches the note.
 */
export function AnnotationAction({ doc, onAnnotate, children }: AnnotationActionProps) {
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const busy = useRef(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  if (onAnnotate === undefined || doc.kind !== 'markdown') {
    return <>{children}</>
  }

  const annotate = async (): Promise<void> => {
    if (busy.current) return
    const selection = lectureSelection(bodyRef.current)
    if (selection === null) {
      setNotice('')
      setError('先在讲义正文里选中要记录的原文；不会自动追加整篇讲义，也不会读取笔记或老师区文字。')
      return
    }
    const bounded = boundExcerpt(selection.text)
    if (bounded.text === '') {
      setNotice('')
      setError('选中的内容没有可保存的纯文本，未追加。')
      return
    }
    busy.current = true
    try {
      const result = await onAnnotate({
        path: doc.path,
        title: doc.title,
        excerpt: bounded.text,
        truncated: bounded.truncated,
        heading: selection.heading,
      })
      if (result.ok) {
        setError('')
        setNotice(result.message)
      } else {
        setNotice('')
        setError(result.message)
      }
    } finally {
      busy.current = false
    }
  }

  return (
    <div className="lc-annotation">
      <style>{styles}</style>
      <div className="lc-annotation-actions" aria-label="讲义批注">
        <button type="button" className="lc-secondary" onClick={() => { void annotate() }}>
          追加到笔记
        </button>
        <p>选中讲义正文中的原文后追加到当前笔记末尾；已有笔记逐字保留，冲突时按既有保存保护处理。</p>
        {notice !== '' && <p role="status">{notice}</p>}
        {error !== '' && <p role="alert">{error}</p>}
      </div>
      <div className="lc-annotation-body" ref={bodyRef}>{children}</div>
    </div>
  )
}
