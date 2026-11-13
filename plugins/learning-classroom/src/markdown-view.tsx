import { Fragment, type ReactNode } from 'react'
import { parseInline, type Block, type InlineToken } from './markdown.ts'
import { HostMath, type MathRenderer } from './math-render.tsx'

/**
 * The one safe Markdown renderer shared by lecture reading and note preview.
 *
 * It consumes the typed block model and produces React elements only; raw HTML
 * stays text. Block ids produced by the parser stay on the real heading,
 * paragraph, quote or list item, and links/wikilinks are delegated through the
 * owner's callbacks so the lecture reader and the note preview can keep their
 * distinct navigation behavior.
 */
export interface MarkdownBlocksProps {
  blocks: Block[]
  /** Table wrapper class; the lecture and note panes style overflow separately. */
  tableClassName?: string
  /** Lecture: open a relative course link inside the classroom. */
  onOpenHref?: (href: string) => boolean
  /** Notes: open an Obsidian wikilink target. */
  onOpenWikilink?: (target: string) => void
  /** Tests and alternate hosts may inject a renderer; production uses KaTeX. */
  mathRenderer?: MathRenderer
}

const headingTags = ['h3', 'h4', 'h5', 'h6', 'h6', 'h6'] as const

/**
 * Styles for the shared math/paragraph vocabulary. Both panes embed this string
 * in their own `<style>` block so a formula keeps the sentence's inline flow
 * while display math stays a block.
 */
export const markdownMathStyles = `
.lc-md-p{margin:0}
.lc-math-inline{display:inline}
.lc-math-inline > div{display:inline}
.lc-math-inline > div > p{display:inline;margin:0}
.lc-math-inline .katex{font-size:1em}
.lc-math-inline-display{display:inline-block;max-width:100%;vertical-align:middle;overflow:auto}
.lc-math-block{margin:8px 0;overflow:auto}
.lc-math-block .katex-display{margin:0}
.lc-math-fallback{display:inline-flex;flex-wrap:wrap;align-items:baseline;gap:6px;color:#9a6700}
.lc-math-fallback code{white-space:pre-wrap;word-break:break-word}
.lc-math-degraded-note{font-size:12px;color:var(--dsh-text-secondary,#59636e)}
`

function MathNode({ tex, display, renderer }: { tex: string; display: boolean; renderer?: MathRenderer }): ReactNode {
  const Renderer = renderer ?? HostMath
  return <Renderer tex={tex} display={display} />
}

function InlineText({
  tokens,
  onOpenHref,
  onOpenWikilink,
  mathRenderer,
}: {
  tokens: InlineToken[]
  onOpenHref?: (href: string) => boolean
  onOpenWikilink?: (target: string) => void
  mathRenderer?: MathRenderer
}): ReactNode {
  return (
    <>
      {tokens.map((token, index) => {
        switch (token.type) {
          case 'code': return <code key={index}>{token.text}</code>
          case 'strong': return <strong key={index}>{token.text}</strong>
          case 'em': return <em key={index}>{token.text}</em>
          case 'link': return (
            <a
              key={index}
              href={token.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={event => {
                if (onOpenHref?.(token.href) === true) event.preventDefault()
              }}
            >{token.text}</a>
          )
          case 'math': return (
            <span
              key={index}
              className={token.display ? 'lc-math-inline lc-math-inline-display' : 'lc-math-inline'}
              data-math-tex={token.tex}
              data-math-display={token.display ? 'true' : undefined}
            >
              <MathNode tex={token.tex} display={token.display} renderer={mathRenderer} />
            </span>
          )
          case 'wikilink': return onOpenWikilink === undefined
            ? <span key={index} className="lc-wikilink-static" title={`双链：${token.target}`}>{token.text}</span>
            : (
              <button
                key={index}
                type="button"
                className="lc-wikilink"
                data-wikilink={token.target}
                title={`打开双链：${token.target}`}
                onClick={() => onOpenWikilink(token.target)}
              >{token.text}</button>
            )
          case 'text': return <Fragment key={index}>{token.text}</Fragment>
        }
      })}
    </>
  )
}

function BlockView({
  block,
  tableClassName = 'lc-md-table',
  onOpenHref,
  onOpenWikilink,
  mathRenderer,
}: {
  block: Block
  tableClassName?: string
  onOpenHref?: (href: string) => boolean
  onOpenWikilink?: (target: string) => void
  mathRenderer?: MathRenderer
}): ReactNode {
  const inline = (text: string): ReactNode => (
    <InlineText
      tokens={parseInline(text)}
      onOpenHref={onOpenHref}
      onOpenWikilink={onOpenWikilink}
      mathRenderer={mathRenderer}
    />
  )

  switch (block.type) {
    case 'heading': {
      const Tag = headingTags[Math.min(Math.max(block.level, 1), 6) - 1]
      return <Tag data-block-id={block.blockId}>{inline(block.text)}</Tag>
    }
    case 'paragraph': {
      const tokens = parseInline(block.text)
      const hasMath = tokens.some(token => token.type === 'math')
      const content = (
        <InlineText
          tokens={tokens}
          onOpenHref={onOpenHref}
          onOpenWikilink={onOpenWikilink}
          mathRenderer={mathRenderer}
        />
      )
      // A paragraph that contains math hosts the host renderer's block element.
      // Using a div keeps the HTML content model valid while CSS makes the math
      // run inline, so `$x$` stays in the sentence instead of becoming a line.
      return hasMath
        ? <div className="lc-md-p" data-block-id={block.blockId}>{content}</div>
        : <p data-block-id={block.blockId}>{content}</p>
    }
    case 'list': {
      const items = block.items.map((item, index) => (
        <li key={index} data-block-id={block.itemBlockIds?.[index]}>{inline(item)}</li>
      ))
      return block.ordered
        ? <ol data-block-id={block.blockId}>{items}</ol>
        : <ul data-block-id={block.blockId}>{items}</ul>
    }
    case 'table':
      return (
        <div className={tableClassName}>
          <table>
            <thead>
              <tr>{block.header.map((cell, index) => <th key={index}>{inline(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{inline(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'code':
      return <pre><code className={block.lang === '' ? undefined : `language-${block.lang}`}>{block.code}</code></pre>
    case 'math':
      return (
        <div className="lc-math-block" data-block-id={block.blockId}>
          <MathNode tex={block.tex} display={block.display} renderer={mathRenderer} />
        </div>
      )
    case 'quote':
      return <blockquote data-block-id={block.blockId}>{inline(block.text)}</blockquote>
    case 'rule':
      return <hr />
  }
}

/** Render a typed block model with the shared safe element vocabulary. */
export function MarkdownBlocks(props: MarkdownBlocksProps): ReactNode {
  return (
    <>
      {props.blocks.map((block, index) => (
        <BlockView
          key={index}
          block={block}
          tableClassName={props.tableClassName}
          onOpenHref={props.onOpenHref}
          onOpenWikilink={props.onOpenWikilink}
          mathRenderer={props.mathRenderer}
        />
      ))}
    </>
  )
}

export type { MathRenderer, MathRendererProps } from './math-render.tsx'

/**
 * Plain text for a selection that contains rendered formulas. KaTeX's DOM has
 * both a visual arm and a MathML arm, so `Range.toString()` can duplicate or
 * mangle a formula; replacing each math wrapper with its original TeX keeps the
 * learner's excerpt faithful to the Markdown source (`$…$` / `$$…$$`).
 *
 * @param range - A selection range from the rendered document.
 * @returns Plain text with each formula restored to its TeX delimiters.
 */
export function selectionTextWithMath(range: Range): string {
  const expanded = range.cloneRange()
  const start = range.startContainer.nodeType === 1
    ? range.startContainer as Element
    : range.startContainer.parentElement
  const end = range.endContainer.nodeType === 1
    ? range.endContainer as Element
    : range.endContainer.parentElement
  const startMath = start?.closest('[data-math-tex]')
  const endMath = end?.closest('[data-math-tex]')
  if (startMath !== null && startMath !== undefined) expanded.setStartBefore(startMath)
  if (endMath !== null && endMath !== undefined) expanded.setEndAfter(endMath)

  const holder = document.createElement('div')
  holder.append(expanded.cloneContents())
  for (const math of Array.from(holder.querySelectorAll('[data-math-tex]'))) {
    const tex = math.getAttribute('data-math-tex') ?? ''
    const display = math.getAttribute('data-math-display') === 'true'
    math.replaceWith(document.createTextNode(display ? `$$${tex}$$` : `$${tex}$`))
  }
  return holder.textContent ?? ''
}
