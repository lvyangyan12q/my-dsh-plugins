import { parseMarkdown } from './markdown.ts'
import { markdownMathStyles, MarkdownBlocks, type MathRenderer } from './markdown-view.tsx'

/**
 * Preview of the note body. It renders the same typed block model and the same
 * safe element vocabulary as the lecture reader; note HTML never reaches the
 * DOM, unrecognized constructs stay literal text, and recognised TeX is handed
 * to the host's KaTeX-backed renderer.
 */
const previewStyles = `
.lc-note-preview{display:flex;flex-direction:column;gap:10px;min-height:220px;padding:10px 12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:var(--dsh-surface,#fff);line-height:1.75;font-size:14px;overflow:auto}
.lc-note-preview h3,.lc-note-preview h4,.lc-note-preview h5,.lc-note-preview h6{margin:8px 0 0;line-height:1.4}
.lc-note-preview p,.lc-note-preview .lc-md-p,.lc-note-preview ul,.lc-note-preview ol,.lc-note-preview blockquote,.lc-note-preview pre,.lc-note-preview table{margin:0}
.lc-note-preview ul,.lc-note-preview ol{padding-left:22px}
.lc-note-preview blockquote{padding:4px 12px;border-left:3px solid var(--dsh-border,#d8dee4);color:var(--dsh-text-secondary,#59636e)}
.lc-note-preview pre{padding:10px 12px;border-radius:6px;background:#f6f8fa;overflow:auto}
.lc-note-preview code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}
.lc-note-preview :not(pre) > code{padding:1px 4px;border-radius:4px;background:#f6f8fa}
.lc-note-preview table{border-collapse:collapse;font-size:13px}
.lc-note-preview th,.lc-note-preview td{padding:6px 10px;border:1px solid var(--dsh-border,#d8dee4);text-align:left}
.lc-note-preview th{background:#f6f8fa}
.lc-note-preview hr{width:100%;border:0;border-top:1px solid var(--dsh-border,#d8dee4)}
.lc-wikilink{padding:0;border:0;background:none;color:var(--dsh-accent,#0969da);font:inherit;cursor:pointer;text-decoration:underline}
.lc-wikilink-static{color:var(--dsh-accent,#0969da)}
${markdownMathStyles}
`

export function NotePreview({
  content,
  onOpenLink,
  mathRenderer,
}: {
  content: string
  onOpenLink?: (target: string) => void
  /** Allows tests or an alternate host to inject the math renderer. */
  mathRenderer?: MathRenderer
}) {
  const blocks = parseMarkdown(content)
  return (
    <section className="lc-note-preview" aria-label="笔记预览">
      <style>{previewStyles}</style>
      {blocks.length === 0
        ? <p className="lc-hint">还没有正文。</p>
        : (
          <MarkdownBlocks
            blocks={blocks}
            tableClassName="lc-note-table"
            onOpenWikilink={onOpenLink}
            mathRenderer={mathRenderer}
          />
        )}
    </section>
  )
}
