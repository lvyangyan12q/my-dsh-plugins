import { z } from 'zod'
import { ensureExperimentCsp, injectIntoHead } from './experiment.ts'
import { lectureFileKind, lectureFolder } from './lectures.ts'

export { ensureExperimentCsp, experimentCsp } from './experiment.ts'

/** One declared experiment control, persisted with the experiment for display. */
export interface ExperimentParameter {
  name: string
  label: string
  min: number
  max: number
  step: number
  default: number
  unit: string
}

export interface LectureDraft {
  fileName: string
  title: string
  order?: number
  body: string
  sources: string[]
}

export interface ExperimentDraft {
  fileName: string
  title: string
  order?: number
  html: string
  sources: string[]
  parameters: ExperimentParameter[]
}

export interface ExperimentMeta {
  sources: string[]
  parameters: ExperimentParameter[]
}

/** Hard bounds shared by the Host writer and the tool argument validators. */
export const teacherContentLimits = {
  title: 120,
  body: 200 * 1024,
  html: 512 * 1024,
  sources: 20,
  sourceLength: 500,
  parameters: 12,
} as const

const forbiddenPathCharacter = /[<>:"|?*\u0000-\u001f]/
const experimentParameterName = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/
const singleLine = (value: string): boolean => !/[\r\n]/.test(value)

function text(value: string, label: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new Error(`${label}不能为空。`)
  if (trimmed.length > max) throw new Error(`${label}超过 ${max} 个字符。`)
  if (!singleLine(trimmed)) throw new Error(`${label}不能包含换行。`)
  return trimmed
}

/**
 * Normalize a teacher-supplied file name into a space-relative path under the
 * lecture folder. The tool may pass `第一章/02.md` or `讲义/第一章/02.md`; every
 * other absolute, hidden, traversal or wrong-extension form is refused instead
 * of being clamped into the lecture folder.
 */
export function lectureRelativePath(fileName: string): string {
  if (typeof fileName !== 'string') throw new Error('讲义文件名必须是字符串。')
  let candidate = fileName.trim().replaceAll('\\', '/')
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

export const experimentParameterSchema = z.object({
  name: z.string().regex(experimentParameterName, '参数名须以字母开头，只含字母、数字、下划线或连字符，最长 32 个字符。'),
  label: z.string()
    .transform(value => value.trim())
    .refine(value => value !== '', '参数说明不能为空。')
    .refine(value => value.length <= 80, '参数说明不能超过 80 个字符。')
    .refine(singleLine, '参数说明不能包含换行。'),
  min: z.number().finite(),
  max: z.number().finite(),
  step: z.number().finite().positive('步长必须大于 0。'),
  default: z.number().finite(),
  unit: z.string()
    .transform(value => value.trim())
    .refine(value => value.length <= 16, '单位不能超过 16 个字符。')
    .refine(singleLine, '单位不能包含换行。'),
}).strict().superRefine((parameter, ctx) => {
  if (!(parameter.min < parameter.max)) {
    ctx.addIssue({ code: 'custom', message: `参数 ${parameter.name} 的最小值必须小于最大值。` })
  }
  if (parameter.default < parameter.min || parameter.default > parameter.max) {
    ctx.addIssue({ code: 'custom', message: `参数 ${parameter.name} 的默认值必须在范围内。` })
  }
  if (parameter.max > parameter.min && parameter.step > parameter.max - parameter.min) {
    ctx.addIssue({ code: 'custom', message: `参数 ${parameter.name} 的步长不能大于取值范围。` })
  }
})

/** Patterns that would make a generated experiment depend on the network or host. */
const externalResourcePatterns: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<(?:script|img|link|iframe|object|embed|source|video|audio|track)\b[^>]*\b(?:src|href|data|poster)\s*=\s*["']?\s*(?:https?:)?\/\//i, reason: '外链资源' },
  { pattern: /<link\b/i, reason: '外部样式或预加载' },
  { pattern: /<(?:iframe|object|embed)\b/i, reason: '嵌套文档或插件' },
  { pattern: /<(?:base|form)\b/i, reason: '基地址或表单提交' },
  { pattern: /<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, reason: '自动跳转' },
  { pattern: /\b(?:src|href|action|poster|data)\s*=\s*["']?\s*\/\//i, reason: '协议相对地址' },
  { pattern: /url\(\s*["']?\s*(?:https?:)?\/\//i, reason: '外部样式资源' },
  { pattern: /@import\b/i, reason: '外部样式导入' },
  { pattern: /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/i, reason: '网络请求 API' },
  { pattern: /\b(?:localStorage|sessionStorage|indexedDB|document\.cookie)\b/i, reason: '宿主存储 API' },
  { pattern: /\b(?:window|document)\.location\b|\blocation\.(?:href|assign|replace)\b/i, reason: '页面跳转 API' },
  { pattern: /\bwindow\.(?:open|parent|top)\b|\b(?:parent|top)\.(?:location|document|postMessage)\b/i, reason: '宿主窗口 API' },
  { pattern: /\bimport\s*\(/i, reason: '动态模块导入' },
]

/** Reject an experiment body that reaches the network, the host or storage. */
export function assertSelfContainedExperiment(html: string): void {
  for (const { pattern, reason } of externalResourcePatterns) {
    if (pattern.test(html)) {
      throw new Error(`动态实验不能使用${reason}；它必须在沙箱里完全自包含，不联网、不读宿主或笔记。`)
    }
  }
}

export const experimentDraftSchema = z.object({
  fileName: filePathSchema('experiment'),
  html: z.string()
    .refine(value => value.trim() !== '', '实验 HTML 不能为空。')
    .refine(value => Buffer.byteLength(value, 'utf8') <= teacherContentLimits.html, `实验 HTML 不能超过 ${Math.round(teacherContentLimits.html / 1024)} KB。`)
    .refine(value => {
      try {
        assertSelfContainedExperiment(value)
        return true
      } catch {
        return false
      }
    }, '动态实验不能引用外部资源、网络 API、宿主对象或存储；必须在隔离沙箱里自包含。'),
  parameters: z.array(experimentParameterSchema)
    .min(1, '动态实验至少声明一个参数。')
    .max(teacherContentLimits.parameters, `动态实验最多声明 ${teacherContentLimits.parameters} 个参数。`),
  ...commonDraft,
}).strict().superRefine((draft, ctx) => {
  const names = new Set<string>()
  for (const parameter of draft.parameters) {
    if (names.has(parameter.name)) {
      ctx.addIssue({ code: 'custom', message: `参数名重复：${parameter.name}` })
    }
    names.add(parameter.name)
  }
})

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

const viewportTag = '<meta name="viewport" content="width=device-width, initial-scale=1">'
const orderMetaName = 'learning-classroom:order'
const sourcesMetaName = 'learning-classroom:sources'
const parametersMetaName = 'learning-classroom:parameters'

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function unescapeAttribute(value: string): string {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function metaTags(html: string): Array<Record<string, string>> {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  return tags.map(tag => {
    const attributes: Record<string, string> = {}
    for (const match of tag.matchAll(/([a-zA-Z][a-zA-Z0-9:_-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attributes[match[1].toLowerCase()] = unescapeAttribute(match[2] ?? match[3] ?? '')
    }
    return attributes
  })
}

function readJsonMeta<T>(html: string, name: string, schema: z.ZodType<T>): T | undefined {
  for (const tag of metaTags(html)) {
    if (tag.name !== name || tag.content === undefined) continue
    try {
      const parsed = schema.safeParse(JSON.parse(tag.content))
      if (parsed.success) return parsed.data
    } catch {
      // A malformed hand-written tag degrades to "no declaration".
    }
  }
  return undefined
}

/** Read the generated experiment's source and parameter declarations. */
export function readExperimentMeta(html: string): ExperimentMeta {
  const sources = readJsonMeta(html, sourcesMetaName, z.array(z.string())) ?? []
  const parameters = readJsonMeta(html, parametersMetaName, z.array(experimentParameterSchema)) ?? []
  return { sources, parameters }
}

/**
 * Compose the persisted experiment: the model's self-contained page plus the
 * classroom CSP, title and metadata used by the reader and Obsidian.
 */
export function composeExperiment(input: ExperimentDraft): string {
  const draft = experimentDraftSchema.parse(input)
  assertSelfContainedExperiment(draft.html)
  const markup = [
    viewportTag,
    /<title\b/i.test(draft.html) ? '' : `<title>${escapeAttribute(draft.title)}</title>`,
    draft.order !== undefined ? `<meta name="${orderMetaName}" content="${draft.order}">` : '',
    `<meta name="${sourcesMetaName}" content="${escapeAttribute(JSON.stringify(draft.sources))}">`,
    `<meta name="${parametersMetaName}" content="${escapeAttribute(JSON.stringify(draft.parameters))}">`,
  ].filter(Boolean).join('')
  return ensureExperimentCsp(injectIntoHead(draft.html, markup))
}
