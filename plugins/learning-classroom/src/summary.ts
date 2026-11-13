/**
 * The learner's explicit end-of-session note: a short summary plus the next
 * step. Both are ordinary Markdown in one knowledge file, so Obsidian and the
 * classroom read the same bytes. Nothing here models mastery, review schedules
 * or a recommendation system; it is a readable note the learner chose to save.
 *
 * The two sections are delimited by paired HTML comments whose nonce is chosen
 * not to occur in the text. HTML comments render as nothing in Obsidian, while
 * any Markdown headings, lists or code fences inside a section stay verbatim —
 * a user's own `## 标题` is never a structural boundary. A hand-written file
 * without markers is still read by the older heading rule.
 */
export const summaryFileName = '学习小结.md'

/** Per-section authoring cap; the Host enforces it before composing or writing. */
export const maxSummaryBytes = 64 * 1024
/** File cap, including the two sections and their structural markers. */
export const maxSummaryFileBytes = maxSummaryBytes * 2 + 8 * 1024

export const summaryTitle = '学习小结'
export const summarySectionTitle = '本次小结'
export const nextStepSectionTitle = '下一步'

export interface SummaryContent {
  summary: string
  nextStep: string
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
  const nonce = sectionNonce(summary, nextStep)
  return [
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
    '',
  ].join('\n')
}

function sectionPattern(kind: string): RegExp {
  return new RegExp(
    `<!-- ${kind}:([A-Za-z0-9-]+) -->\\r?\\n([\\s\\S]*?)\\r?\\n<!-- /${kind}:\\1 -->`,
  )
}

/**
 * Read the two sections back. Marker-framed files round-trip arbitrary
 * Markdown. A hand-written file without markers falls back to the known
 * headings, and a file with neither is treated as one summary rather than
 * being rejected.
 */
export function parseSummary(content: string): SummaryContent {
  const normalized = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const summarySection = sectionPattern(summaryKind).exec(normalized)
  const nextSection = sectionPattern(nextKind).exec(normalized)
  if (summarySection !== null || nextSection !== null) {
    return {
      summary: (summarySection?.[2] ?? '').trim(),
      nextStep: (nextSection?.[2] ?? '').trim(),
    }
  }

  const lines = normalized.split('\n')
  const summaryLines: string[] = []
  const nextStepLines: string[] = []
  let current: 'summary' | 'nextStep' | null = null
  let sawHeading = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === `## ${summarySectionTitle}`) {
      current = 'summary'
      sawHeading = true
      continue
    }
    if (trimmed === `## ${nextStepSectionTitle}`) {
      current = 'nextStep'
      sawHeading = true
      continue
    }
    // Legacy framing: a heading ends the current section. New writes always use
    // paired markers, so a heading the learner adds inside a section survives.
    if (/^#{1,6}\s/.test(trimmed)) {
      current = null
      continue
    }
    if (current === 'summary') summaryLines.push(line)
    else if (current === 'nextStep') nextStepLines.push(line)
  }

  if (!sawHeading) return { summary: normalized.trim(), nextStep: '' }
  return { summary: summaryLines.join('\n').trim(), nextStep: nextStepLines.join('\n').trim() }
}
