import { Fragment, type ReactNode } from 'react'
import { parseInline, parseMarkdown, type Block } from './markdown.ts'

/**
 * Preview of the note body. It renders the same typed block model used for
 * lectures with React elements only, so note HTML never reaches the DOM and an
 * unrecognized construct stays literal, readable text.
 */const previewStyles = `
.lc-note-preview{display:flex;flex-direction:column;gap:10px;min-height:220px;padding:10px 12px;border:1px solid var(--dsh-border,#d8dee4);border-radius:8px;background:var(--dsh-surface,#fff);line-height:1.75;font-size:14px;overflow:auto}
.lc-note-preview h3,.lc-note-preview h4,.lc-note-preview h5,.lc-note-preview h6{margin:8px 0 0;line-height:1.4}
.lc-note-preview p,.lc-note-preview ul,.lc-note-preview ol,.lc-note-preview blockquote,.lc-note-preview pre,.lc-note-preview table{margin:0}
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
`

function InlineText({ text, onOpenLink }: { text: string; onOpenLink?: (target: string) => void }) {
  return (
    <>
      {parseInline(text).map((token, index) => {
        switch (token.type) {
          case 'code': return <code key={index}>{token.text}</code>
          case 'strong': return <strong key={index}>{token.text}</strong>
          case 'em': return <em key={index}>{token.text}</em>
          case 'link': return <a key={index} href={token.href} target="_blank" rel="noreferrer noopener">{token.text}</a>
          case 'wikilink': return onOpenLink === undefined
            ? <span key={index} className="lc-wikilink-static" title={token.target}>{token.text}</span>
            : (
              <button
                key={index}
                type="button"
                className="lc-wikilink"
                data-wikilink={token.target}
                title={`打开双链：${token.target}`}
                onClick={() => onOpenLink(token.target)}
              >{token.text}</button>
            )
          case 'text': return <Fragment key={index}>{token.text}</Fragment>
        }
      })}
    </>
  )
}

const headingTags = ['h3', 'h4', 'h5', 'h6', 'h6', 'h6'] as const

function BlockView({ block, onOpenLink }: { block: Block; onOpenLink?: (target: string) => void }): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = headingTags[Math.min(Math.max(block.level, 1), 6) - 1]
      return <Tag><InlineText text={block.text} onOpenLink={onOpenLink} /></Tag>
    }
    case 'paragraph':
      return <p><InlineText text={block.text} onOpenLink={onOpenLink} /></p>
    case 'list': {
      const items = block.items.map((item, index) => <li key={index}><InlineText text={item} onOpenLink={onOpenLink} /></li>)
      return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
    }
    case 'table':
      return (
        <div className="lc-note-table">
          <table>
            <thead>
              <tr>{block.header.map((cell, index) => <th key={index}><InlineText text={cell} onOpenLink={onOpenLink} /></th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}><InlineText text={cell} onOpenLink={onOpenLink} /></td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'code':
      return <pre><code className={block.lang === '' ? undefined : `language-${block.lang}`}>{block.code}</code></pre>
    case 'quote':
      return <blockquote><InlineText text={block.text} onOpenLink={onOpenLink} /></blockquote>
    case 'rule':
      return <hr />
  }
}

export function NotePreview({ content, onOpenLink }: { content: string; onOpenLink?: (target: string) => void }) {
  const blocks = parseMarkdown(content)
  return (
    <section className="lc-note-preview" aria-label="笔记预览">
      <style>{previewStyles}</style>
      {blocks.length === 0
        ? <p className="lc-hint">还没有正文。</p>
        : blocks.map((block, index) => <BlockView key={index} block={block} onOpenLink={onOpenLink} />)}
    </section>
  )
}
