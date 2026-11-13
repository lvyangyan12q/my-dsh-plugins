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

/**
 * Extra text around the framing markers. Exclusion is by character span, never
 * by whole line: the marker/body ranges are cut exactly, and the two frame
 * headings are removed only when they sit immediately before their start marker
 * (the layout compose emits). User text on the same line as any marker, emoji
 * included, keeps its bytes; a malformed layout simply leaves the headings in
 * `extra` rather than deleting neighbouring text.
 */
function extraAroundMarkers(
  normalized: string,
  summaryMatch: RegExpExecArray,
  nextMatch: RegExpExecArray | null,
): string {
  const excluded: Array<[number, number]> = [
    [summaryMatch.index, summaryMatch.index + summaryMatch[0].length],
  ]
  if (nextMatch !== null) excluded.push([nextMatch.index, nextMatch.index + nextMatch[0].length])

  const frameBefore = (end: number, frame: string): void => {
    const start = end - frame.length
    if (start >= 0 && normalized.slice(start, end) === frame) excluded.push([start, end])
  }
  frameBefore(summaryMatch.index, `# ${summaryTitle}\n\n## ${summarySectionTitle}\n\n`)
  if (nextMatch !== null) frameBefore(nextMatch.index, `## ${nextStepSectionTitle}\n\n`)

  excluded.sort((left, right) => left[0] - right[0])
  let result = ''
  let cursor = 0
  for (const [start, end] of excluded) {
    if (start > cursor) result += normalized.slice(cursor, start)
    cursor = Math.max(cursor, end)
  }
  result += normalized.slice(cursor)
  return result.trim()
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
