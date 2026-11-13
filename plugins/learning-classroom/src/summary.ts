/**
 * The learner's explicit end-of-session note: a short summary plus the next
 * step. Both are ordinary Markdown in one knowledge file, so Obsidian and the
 * classroom read the same bytes. Nothing here models mastery, review schedules
 * or a recommendation system; it is a readable note the learner chose to save.
 *
 * The two sections are delimited by paired HTML comments whose nonce is chosen
 * not to occur in the text. HTML comments render as nothing in Obsidian, while
 * any Markdown headings, lists or code fences inside a section stay verbatim —
 * a user's own `## 标题` is never a structural boundary.
 *
 * Anything outside the two sections is not discarded: it is returned as `extra`
 * and re-emitted verbatim by the next compose, so a learner's appendix (or a
 * hand-written file that does not use our framing) survives later saves. A file
 * without markers is read with the older heading rule; other headings inside a
 * section are kept as section text rather than truncating it.
 */
export const summaryFileName = '学习小结.md'

/** Per-section authoring cap; the Host enforces it before composing or writing. */
export const maxSummaryBytes = 64 * 1024
/** File cap, including the two sections, their markers and preserved extra text. */
export const maxSummaryFileBytes = maxSummaryBytes * 2 + 8 * 1024

export const summaryTitle = '学习小结'
export const summarySectionTitle = '本次小结'
export const nextStepSectionTitle = '下一步'

export interface SummaryContent {
  summary: string
  nextStep: string
  /** Non-section Markdown found in the file, preserved verbatim on the next save. */
  extra?: string
}

const summaryKind = 'learning-classroom:summary'
const nextKind = 'learning-classroom:next'

function startMarker(kind: string, nonce: string): string {
  return `<!-- ${kind}:${nonce} -->`
}

function endMarker(kind: string, nonce: string): string {
  return `<!-- /${kind}:${nonce} -->`
}

/** FNV-1a over UTF-16 code units; only used to pick a marker nonce. */
function fnv1a(text: string, seed: number): string {
  let hash = seed >>> 0
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** A nonce never present in either section's text, so markers are unambiguous. */
function sectionNonce(summary: string, nextStep: string): string {
  const text = `${summary}\u0000${nextStep}`
  const base = `${fnv1a(text, 0x811c9dc5)}${fnv1a(text, 0x9e3779b9)}`
  for (let counter = 0; counter < 10_000; counter += 1) {
    const nonce = counter === 0 ? base.slice(0, 12) : `${base.slice(0, 8)}-${counter}`
    const markers = [
      startMarker(summaryKind, nonce),
      endMarker(summaryKind, nonce),
      startMarker(nextKind, nonce),
      endMarker(nextKind, nonce),
    ]
    if (markers.every(marker => !summary.includes(marker) && !nextStep.includes(marker))) return nonce
  }
  // The loop can only be exhausted by pathological input; the hash prefix is
  // already unique enough that this fallback is practically unreachable.
  return base.slice(0, 12)
}

/** Render the two sections as one readable Markdown file with explicit framing. */
export function composeSummary(input: SummaryContent): string {
  const summary = input.summary.trim()
  const nextStep = input.nextStep.trim()
  const extra = (input.extra ?? '').trim()
  const nonce = sectionNonce(summary, nextStep)
  const lines = [
    `# ${summaryTitle}`,
    '',
    `## ${summarySectionTitle}`,
    '',
    startMarker(summaryKind, nonce),
    summary,
    endMarker(summaryKind, nonce),
    '',
    `## ${nextStepSectionTitle}`,
    '',
    startMarker(nextKind, nonce),
    nextStep,
    endMarker(nextKind, nonce),
  ]
  if (extra !== '') lines.push('', extra)
  lines.push('')
  return lines.join('\n')
}

function lineIndexOf(text: string, offset: number): number {
  let line = 0
  const end = Math.max(0, Math.min(offset, text.length))
  for (let index = 0; index < end; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1
  }
  return line
}

/**
 * Extra text around the framing markers. Exclusion is positional: only the
 * exact marker lines and the five-line frame that compose emits
 * (`# 学习小结`, blank, `## 本次小结`, blank, marker) are removed. Everything
 * else — a user's prefix heading with the same name, a marker-looking comment,
 * appended sections — keeps its bytes.
 */
function extraAroundMarkers(
  normalized: string,
  summaryMatch: RegExpExecArray,
  nextMatch: RegExpExecArray | null,
): string {
  const lines = normalized.split('\n')
  const excluded = new Set<number>()
  const excludeRange = (match: RegExpExecArray): void => {
    const start = lineIndexOf(normalized, match.index)
    const end = lineIndexOf(normalized, match.index + match[0].length - 1)
    for (let index = start; index <= end; index += 1) excluded.add(index)
  }
  excludeRange(summaryMatch)
  if (nextMatch !== null) excludeRange(nextMatch)

  const summaryStart = lineIndexOf(normalized, summaryMatch.index)
  if (lines[summaryStart - 1]?.trim() === ''
    && lines[summaryStart - 2]?.trim() === `## ${summarySectionTitle}`
    && lines[summaryStart - 3]?.trim() === ''
    && lines[summaryStart - 4]?.trim() === `# ${summaryTitle}`) {
    excluded.add(summaryStart - 2)
    excluded.add(summaryStart - 4)
  }
  if (nextMatch !== null) {
    const nextStart = lineIndexOf(normalized, nextMatch.index)
    if (lines[nextStart - 1]?.trim() === ''
      && lines[nextStart - 2]?.trim() === `## ${nextStepSectionTitle}`
      && lines[nextStart - 3]?.trim() === '') {
      excluded.add(nextStart - 2)
    }
  }

  return lines.filter((_, index) => !excluded.has(index)).join('\n').trim()
}

/** Legacy files have no markers; only a leading framework title is ours. */
function extraFromLegacyPrefix(text: string): string {
  const lines = text.split('\n')
  const firstContent = lines.findIndex(line => line.trim() !== '')
  if (firstContent >= 0 && lines[firstContent].trim() === `# ${summaryTitle}`) lines.splice(firstContent, 1)
  return lines.join('\n').trim()
}

function sectionPattern(kind: string, nonce: string): RegExp {
  const safe = nonce.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<!-- ${kind}:${safe} -->\\r?\\n([\\s\\S]*?)\\r?\\n<!-- /${kind}:${safe} -->`)
}

function anySummaryMarkerPattern(): RegExp {
  return /<!-- learning-classroom:summary:([A-Za-z0-9-]+) -->\r?\n([\s\S]*?)\r?\n<!-- \/learning-classroom:summary:\1 -->/
}

/**
 * Read the two sections back plus any text the plugin does not own. A
 * marker-framed file round-trips arbitrary Markdown and keeps appended text in
 * `extra`; a hand-written file without markers falls back to the known headings
 * (other headings stay inside their section instead of truncating it).
 */
export function parseSummary(content: string): SummaryContent {
  const normalized = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const summaryMatch = anySummaryMarkerPattern().exec(normalized)
  if (summaryMatch !== null) {
    const nonce = summaryMatch[1]
    const nextMatch = sectionPattern(nextKind, nonce).exec(normalized)
    return {
      summary: (summaryMatch[2] ?? '').trim(),
      nextStep: (nextMatch?.[1] ?? '').trim(),
      extra: extraAroundMarkers(normalized, summaryMatch, nextMatch),
    }
  }

  const lines = normalized.split('\n')
  const summaryHeading = `## ${summarySectionTitle}`
  const nextStepHeading = `## ${nextStepSectionTitle}`
  const indices = lines
    .map((line, index) => ({ trimmed: line.trim(), index }))
    .filter(row => row.trimmed === summaryHeading || row.trimmed === nextStepHeading)
  if (indices.length === 0) return { summary: normalized.trim(), nextStep: '', extra: '' }

  const sections: Array<{ kind: 'summary' | 'nextStep'; start: number; end: number }> = indices.map((row, position) => ({
    kind: row.trimmed === summaryHeading ? 'summary' : 'nextStep',
    start: row.index + 1,
    end: position + 1 < indices.length ? indices[position + 1].index : lines.length,
  }))
  const summaryLines: string[] = []
  const nextStepLines: string[] = []
  for (const section of sections) {
    const target = section.kind === 'summary' ? summaryLines : nextStepLines
    target.push(...lines.slice(section.start, section.end))
  }
  const firstStart = indices[0].index
  const before = lines.slice(0, firstStart).join('\n')
  return {
    summary: summaryLines.join('\n').trim(),
    nextStep: nextStepLines.join('\n').trim(),
    extra: extraFromLegacyPrefix(before),
  }
}
