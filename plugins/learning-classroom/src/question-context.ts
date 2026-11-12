/**
 * The frozen question-context text contract.
 *
 * "Ask the teacher" never hands the composer a live reference to a lecture or a
 * note. It builds one plain-text block here — space, material, file version and
 * excerpt — and appends that block to the learner's existing native draft.
 * Because the block is text, switching topics, lecture files or note versions
 * afterwards cannot rewrite what was already asked; the native Session history
 * is the only place the sent question is stored (no second chat database).
 */

/** Which material the excerpt came from; the reader names it in the block. */
export type QuestionContextKind = 'lecture' | 'lecture-selection' | 'note-selection'

/** Everything the block freezes at the moment the learner asks. */
export interface QuestionContextInput {
  kind: QuestionContextKind
  /** Learning space title, the learner's theme for this conversation. */
  spaceTitle: string
  /** Material title, derived from the file when the Host has one. */
  title: string
  /** Space-relative path of the material file. */
  path: string
  /** Content version read from the Host; null when the Host has no version. */
  version: string | null
  /** A note excerpt taken from unsaved editor text rather than the disk copy. */
  unsaved: boolean
  excerpt: string
  truncated: boolean
}

/** Maximum excerpt length: one material fragment, never the vault. */
export const questionExcerptLimit = 4000

/** One context block the learner appended, kept for viewing and removal. */
export interface AskedContext extends QuestionContextInput {
  /** Local identity for the context bar; not persisted and not sent. */
  id: string
  /** The exact text appended to the draft. */
  block: string
}

/** Outcome of asking the teacher; a refusal always explains itself. */
export type AskQuestionResult = { ok: true } | { ok: false; reason: string }

/** The classroom's "ask the teacher" capability handed to the reading zones. */
export interface AskTeacher {
  /** Whether the native append seam is available right now. */
  available: boolean
  /** Why asking is unavailable; '' while it is available. */
  reason: string
  ask(input: QuestionContextInput): Promise<AskQuestionResult>
}

/** Build one frozen context record and the exact text appended to the draft. */
export function createAskedContext(input: QuestionContextInput, id: string): AskedContext {
  return { ...input, id, block: formatQuestionBlock(input) }
}

/** Material label shown in the context strip and used as its button label. */
export function questionMaterialLabel(input: Pick<QuestionContextInput, 'kind' | 'title'>): string {
  if (input.kind === 'note-selection') return `笔记《${input.title}》`
  if (input.kind === 'lecture-selection') return `讲义《${input.title}》选段`
  return `讲义《${input.title}》`
}

/**
 * Normalize learner-selected or material text into a bounded excerpt.
 * Line endings are unified, edge whitespace and runs of blank lines are
 * collapsed, and an over-long excerpt is cut by UTF-16 length rather than
 * silently dropped.
 */
export function excerptForQuestion(
  text: string,
  limit: number = questionExcerptLimit,
): { text: string; truncated: boolean } {
  const normalized = text
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim()
  if (normalized === '') return { text: '', truncated: false }
  if (normalized.length <= limit) return { text: normalized, truncated: false }
  return { text: normalized.slice(0, limit), truncated: true }
}

/** Quote the excerpt so it reads as source material in the native message. */
function quoteExcerpt(excerpt: string): string {
  return excerpt.split('\n').map(line => (line === '' ? '>' : `> ${line}`)).join('\n')
}

function hasVersion(version: string | null | undefined): version is string {
  return typeof version === 'string' && version.trim() !== ''
}

function versionLine(input: QuestionContextInput): string {
  if (input.unsaved) {
    return hasVersion(input.version)
      ? `版本：未保存（基于磁盘版本 ${input.version}）`
      : '版本：未保存（磁盘基础版本未知）'
  }
  if (!hasVersion(input.version)) return '版本：未知（宿主未提供文件版本）'
  return `版本：${input.version}`
}

function materialLine(input: QuestionContextInput): string {
  if (input.kind === 'note-selection') {
    return input.unsaved
      ? `材料：笔记《${input.title}》 · ${input.path}（未保存，取自当前编辑内容）`
      : `材料：笔记《${input.title}》 · ${input.path}`
  }
  if (input.kind === 'lecture-selection') return `材料：讲义《${input.title}》选段 · ${input.path}`
  return `材料：讲义《${input.title}》 · ${input.path}`
}

/**
 * Format the frozen context block. Pure text: the learner can see exactly what
 * will be sent before sending, and the block never changes after it is built.
 */
export function formatQuestionBlock(input: QuestionContextInput): string {
  const lines = [
    '【提问上下文】',
    `主题：${input.spaceTitle}`,
    materialLine(input),
    versionLine(input),
    '摘录：',
    quoteExcerpt(input.excerpt),
  ]
  if (input.truncated) lines.push('> ……（摘录过长，已截断）')
  return lines.join('\n')
}

/**
 * Append a block below the learner's existing draft. Existing text is kept
 * byte-for-byte; the returned draft is what the native composer receives.
 */
export function appendContextBlock(draft: string, block: string): string {
  if (draft.trim() === '') return block
  return `${draft}\n\n${block}`
}

/** Result of taking one previously appended block back out of a draft. */
export type RemoveContextResult =
  | { status: 'removed'; draft: string }
  | { status: 'missing' }
  | { status: 'ambiguous' }

/**
 * Remove exactly one appended block and restore the surrounding draft.
 * The block must occur exactly once: a repeated block would make removal a
 * guess about which question the learner meant to change.
 */
export function removeContextBlock(draft: string, block: string): RemoveContextResult {
  const first = draft.indexOf(block)
  if (first < 0) return { status: 'missing' }
  if (draft.indexOf(block, first + block.length) >= 0) return { status: 'ambiguous' }
  let before = draft.slice(0, first)
  let after = draft.slice(first + block.length)
  // The blank line we add between the draft and the block belongs to neither.
  if (after.startsWith('\n\n')) after = after.slice(2)
  else if (after === '') before = before.replace(/\n\n$/u, '')
  else if (before === '') after = after.replace(/^\n+/u, '')
  return { status: 'removed', draft: before + after }
}
