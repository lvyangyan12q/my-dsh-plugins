/**
 * 选段批注：把学习者选中的纯文本原文和真实来源链接写成一段 Markdown，
 * 追加到当前笔记末尾。这里不生成标题或块锚点——来源链接必须来自 Host 对
 * 真实文件的解析结果，避免出现只在渲染 DOM 里存在的假块 id。
 */
export const maxAnnotationExcerpt = 4000

export interface BoundedExcerpt {
  text: string
  truncated: boolean
}

/** 选出可保存的纯文本：统一换行、去掉行尾空白、压缩多余空行，再按上限截断。 */
export function boundExcerpt(text: string, limit: number = maxAnnotationExcerpt): BoundedExcerpt {
  const cleaned = String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const characters = Array.from(cleaned)
  if (characters.length <= limit) return { text: cleaned, truncated: false }
  return { text: characters.slice(0, limit).join('').trimEnd(), truncated: true }
}

function assertWikilink(link: string): void {
  if (typeof link !== 'string' || !link.startsWith('[[') || !link.endsWith(']]') || link.length <= 4) {
    throw new Error('批注来源必须是 Host 解析出的真实双链，例如 [[文件#标题]]。')
  }
}

/**
 * 构造批注块：正文逐行引用保留原文，末行写真实来源。
 * `truncated` 只说明摘录被限长，绝不把截断后的文字冒充完整原文。
 */
export function buildAnnotationBlock(input: { excerpt: string; link: string; truncated?: boolean }): string {
  assertWikilink(input.link)
  const bounded = boundExcerpt(input.excerpt)
  if (bounded.text === '') throw new Error('没有可保存的摘录文字。')
  const quoted = bounded.text
    .split('\n')
    .map(line => (line === '' ? '>' : `> ${line}`))
    .join('\n')
  const truncated = input.truncated === true || bounded.truncated
  const source = truncated
    ? `来源：${input.link}（摘录较长，只保留了前 ${maxAnnotationExcerpt} 个字符）`
    : `来源：${input.link}`
  return `${quoted}\n>\n> ${source}`
}

/**
 * 追加到笔记末尾。已有正文逐字保留，只补足以形成独立段落的分隔；
 * 返回值始终以换行结束，便于下一次继续追加。
 */
export function appendAnnotationBlock(note: string, block: string): string {
  if (typeof block !== 'string' || block.trim() === '') throw new Error('批注内容为空，未写入笔记。')
  const body = block.replace(/\n+$/, '')
  if (note === '') return `${body}\n`
  const separator = note.endsWith('\n\n') ? '' : note.endsWith('\n') ? '\n' : '\n\n'
  return `${note}${separator}${body}\n`
}
