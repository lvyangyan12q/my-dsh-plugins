/**
 * TeX math recognition for the classroom's small Markdown reader.
 *
 * This module only decides where a formula starts and ends and returns the TeX
 * source unchanged. Rendering is a separate, host-provided concern (KaTeX via
 * the public `MarkdownText`), so no HTML string is produced here. Code spans and
 * fenced code are consumed by the caller before math is considered, and every
 * unterminated or ambiguous `$` stays literal text.
 */

/** One recognised formula: TeX source, display/inline mode, and end offset. */
export interface InlineMathMatch {
  tex: string
  display: boolean
  /** Offset just after the closing delimiter. */
  end: number
}

/** One recognised display block: TeX source and the next line to parse. */
export interface DisplayMathBlock {
  tex: string
  next: number
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) backslashes += 1
  return backslashes % 2 === 1
}

/**
 * Recognise `$…$` or `$$…$$` starting at `start`, using the conservative
 * delimiter rules that keep prices and unclosed typing literal:
 *
 * - the opening `$` must be followed by a non-space, and by a non-`$` for inline;
 * - the closing `$` must be preceded by a non-space and not escaped;
 * - inline math may not be followed by a digit (pandoc's currency guard);
 * - empty formulas are not math.
 *
 * @param text - One line of inline Markdown.
 * @param start - Index of the opening `$`.
 * @returns The match, or null when this `$` is ordinary text.
 */
export function matchInlineMath(text: string, start: number): InlineMathMatch | null {
  if (text[start] !== '$' || isEscaped(text, start)) return null

  if (text.startsWith('$$', start)) {
    let close = start + 2
    while (close < text.length) {
      const found = text.indexOf('$$', close)
      if (found === -1) return null
      if (!isEscaped(text, found)) {
        const tex = text.slice(start + 2, found).trim()
        return tex === '' ? null : { tex, display: true, end: found + 2 }
      }
      close = found + 2
    }
    return null
  }

  const first = text[start + 1]
  if (first === undefined || first === '$' || /\s/.test(first)) return null

  let cursor = start + 1
  while (cursor < text.length) {
    const close = text.indexOf('$', cursor)
    if (close === -1) return null
    if (!isEscaped(text, close)) {
      const raw = text.slice(start + 1, close)
      if (raw === '' || /\s$/.test(raw)) return null
      const after = text[close + 1]
      // `$5$2` reads as a price/quantity pair, not TeX followed by a digit.
      if (after !== undefined && /\d/.test(after)) return null
      return { tex: raw.trim(), display: false, end: close + 1 }
    }
    cursor = close + 1
  }
  return null
}

/**
 * Recognise a display math block starting at `lines[index]`:
 *
 * ```md
 * $$
 * \frac{1}{2}
 * $$
 * ```
 *
 * or `$$ \frac{1}{2} $$` on one line. A `$$` line without a closing line is
 * not a block, so a half-typed fence cannot swallow the rest of the lecture.
 *
 * @param lines - Normalized Markdown lines.
 * @param index - Candidate first line.
 * @returns The block, or null when this line is not a complete display formula.
 */
export function matchDisplayMathBlock(lines: readonly string[], index: number): DisplayMathBlock | null {
  const line = lines[index]
  if (line === undefined) return null
  const trimmed = line.trim()
  if (!trimmed.startsWith('$$')) return null

  const oneLine = trimmed.slice(2)
  if (oneLine.trim() !== '') {
    const ended = oneLine.trimEnd()
    if (!ended.endsWith('$$')) return null
    const tex = ended.slice(0, -2).trim()
    return tex === '' ? null : { tex, next: index + 1 }
  }

  const body: string[] = []
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    if (lines[cursor].trim() === '$$') {
      const tex = body.join('\n').trim()
      return tex === '' ? null : { tex, next: cursor + 1 }
    }
    body.push(lines[cursor])
  }
  return null
}

/**
 * The exact Markdown handed to the host's trusted TeX renderer. Only the TeX
 * source sits between the delimiters; neighbouring user text and raw HTML are
 * never part of this string.
 *
 * @param tex - Recognised TeX source.
 * @param display - Display (`$$…$$`) versus inline (`$…$`) math.
 * @returns A one-formula Markdown document.
 */
export function mathMarkdown(tex: string, display: boolean): string {
  return display ? `$$\n${tex}\n$$` : `$${tex}$`
}
