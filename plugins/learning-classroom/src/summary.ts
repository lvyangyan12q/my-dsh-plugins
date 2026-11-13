/**
 * The learner's explicit end-of-session note: a short summary plus the next
 * step. Both are ordinary Markdown in one knowledge file, so Obsidian and the
 * classroom read the same bytes. Nothing here models mastery, review schedules
 * or a recommendation system; it is a readable note the learner chose to save.
 */
export const summaryFileName = '学习小结.md'

/** File cap for the composed summary. The Host enforces it before writing. */
export const maxSummaryBytes = 64 * 1024

export const summaryTitle = '学习小结'
export const summarySectionTitle = '本次小结'
export const nextStepSectionTitle = '下一步'

export interface SummaryContent {
  summary: string
  nextStep: string
}

/** Render the two sections as one readable Markdown file. */
export function composeSummary(input: SummaryContent): string {
  const summary = input.summary.trim()
  const nextStep = input.nextStep.trim()
  return [
    `# ${summaryTitle}`,
    '',
    `## ${summarySectionTitle}`,
    '',
    summary,
    '',
    `## ${nextStepSectionTitle}`,
    '',
    nextStep,
    '',
  ].join('\n')
}

/**
 * Read the two sections back. A file edited in Obsidian may not have our
 * headings at all: the whole body is then the summary instead of being treated
 * as invalid. Section text stops at the next Markdown heading, so a learner's
 * own later section is never swallowed into the summary or the next step.
 */
export function parseSummary(content: string): SummaryContent {
  const lines = content.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
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
    // Any heading ends the current section; a heading before our sections is
    // part of a hand-written file and is handled by the fallback below.
    if (/^#{1,6}\s/.test(trimmed)) {
      current = null
      continue
    }
    if (current === 'summary') summaryLines.push(line)
    else if (current === 'nextStep') nextStepLines.push(line)
  }

  if (!sawHeading) return { summary: content.trim(), nextStep: '' }
  return { summary: summaryLines.join('\n').trim(), nextStep: nextStepLines.join('\n').trim() }
}
