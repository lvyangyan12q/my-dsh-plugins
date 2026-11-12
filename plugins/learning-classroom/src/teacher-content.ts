import { z } from 'zod'
import { lectureFileKind, lectureFolder } from './lectures.ts'

/** Lecture path helpers and the sourced Markdown writer. */
export interface LectureDraft {
  fileName: string
  title: string
  order?: number
  body: string
  sources: string[]
}

/** Hard bounds shared by the Host writer and the tool argument validators. */
export const teacherContentLimits = {
  title: 120,
  body: 200 * 1024,
  sources: 20,
  sourceLength: 500,
} as const

const forbiddenPathCharacter = /[<>:"|?*\u0000-\u001f]/
const singleLine = (value: string): boolean => !/[\r\n]/.test(value)

/**
 * Normalize a teacher-supplied file name into a space-relative path under the
 * lecture folder. The tool may pass `第一章/02.md` or `讲义/第一章/02.md`; every
 * other absolute, hidden, traversal or wrong-extension form is refused instead
 * of being clamped into the lecture folder.
 */
export function lectureRelativePath(fileName: string): string {
  if (typeof fileName !== 'string') throw new Error('讲义文件名必须是字符串。')
  const candidate = fileName.trim().replaceAll('\\', '/')
  if (candidate === '') throw new Error('讲义文件名不能为空。')
  if (candidate.startsWith('/') || candidate.startsWith('//') || /^[A-Za-z]:/.test(candidate)) {
    throw new Error('讲义文件名必须是学习空间内的相对路径，不能是绝对路径。')
  }
  const segments = candidate.split('/').filter(segment => segment !== '' && segment !== '.')
  if (segments.some(segment => segment === '..')) {
    throw new Error('讲义文件名不能越出讲义目录。')
  }
  if (segments[0] === lectureFolder) segments.shift()
  if (segments.length === 0) throw new Error('讲义文件名不能只指向讲义目录。')
  for (const segment of segments) {
    if (segment.startsWith('.')) throw new Error(`隐藏文件不会进入课程目录：${fileName}`)
    if (forbiddenPathCharacter.test(segment)) throw new Error(`讲义文件名包含非法字符：${fileName}`)
    if (segment.endsWith('.') || segment.endsWith(' ')) throw new Error(`讲义文件名不能以点或空格结尾：${fileName}`)
    if (segment.length > 120) throw new Error(`讲义文件名片段过长：${fileName}`)
  }
  const last = segments[segments.length - 1] ?? ''
  if (lectureFileKind(last) === null) throw new Error(`只支持 Markdown（.md）或动态实验（.html）：${fileName}`)
  return [lectureFolder, ...segments].join('/')
}

function filePathSchema(kind: 'markdown' | 'experiment') {
  return z.string().superRefine((value, ctx) => {
    let relative: string
    try {
      relative = lectureRelativePath(value)
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: error instanceof Error ? error.message : '讲义文件名不合法。' })
      return
    }
    const actual = lectureFileKind(relative)
    if (actual !== kind) {
      ctx.addIssue({
        code: 'custom',
        message: kind === 'markdown'
          ? `生成讲义必须使用 .md 文件：${value}`
          : `生成动态实验必须使用 .html 文件：${value}`,
      })
    }
  })
}

const sourcesSchema = z.array(
  z.string()
    .transform(value => value.trim())
    .refine(value => value !== '', '来源不能为空。')
    .refine(value => value.length <= teacherContentLimits.sourceLength, `单条来源不能超过 ${teacherContentLimits.sourceLength} 个字符。`)
    .refine(singleLine, '来源不能包含换行。'),
)
  .min(1, '至少给出一条来源。')
  .max(teacherContentLimits.sources, `来源最多 ${teacherContentLimits.sources} 条。`)

const commonDraft = {
  title: z.string()
    .transform(value => value.trim())
    .refine(value => value !== '', '标题不能为空。')
    .refine(value => value.length <= teacherContentLimits.title, `标题不能超过 ${teacherContentLimits.title} 个字符。`)
    .refine(singleLine, '标题不能包含换行。'),
  order: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  sources: sourcesSchema,
}

export const lectureDraftSchema = z.object({
  fileName: filePathSchema('markdown'),
  body: z.string()
    .refine(value => value.trim() !== '', '讲义解释正文不能为空。')
    .refine(value => Buffer.byteLength(value, 'utf8') <= teacherContentLimits.body, `讲义正文不能超过 ${Math.round(teacherContentLimits.body / 1024)} KB。`),
  ...commonDraft,
}).strict()

export { filePathSchema }

function yamlString(value: string): string {
  return JSON.stringify(value)
}

/** Compose the persisted Markdown: sourced explanation plus a readable title. */
export function composeLecture(input: LectureDraft): string {
  const draft = lectureDraftSchema.parse(input)
  const order = draft.order !== undefined ? `order: ${draft.order}\n` : ''
  const sources = draft.sources.map(source => `- ${source}`).join('\n')
  return [
    '---',
    `title: ${yamlString(draft.title)}`,
    `${order}generated: teacher`,
    '---',
    '',
    `# ${draft.title}`,
    '',
    draft.body.trim(),
    '',
    '## 来源',
    '',
    sources,
    '',
  ].join('\n')
}
