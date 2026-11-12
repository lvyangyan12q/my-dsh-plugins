import { z } from 'zod'
import type { GeneratedContentView } from './contract.ts'
import {
  experimentDraftSchema,
  lectureDraftSchema,
  type ExperimentDraft,
  type LectureDraft,
} from './teacher-content.ts'

/**
 * Structural face of the Host writer. The tool never accepts a topic or session
 * id from the model: the execution's real Agent id is the only identity, and the
 * Host resolves it to at most one bound learning space.
 */
export interface TeacherToolHost {
  hasBoundSession(sessionId: string): boolean
  writeGenerated(
    sessionId: string,
    kind: 'lecture' | 'experiment',
    draft: LectureDraft | ExperimentDraft,
    options?: { signal?: AbortSignal },
  ): Promise<GeneratedContentView>
}

/** The execution fields this tool consumes from the real ToolRunContext. */
export interface TeacherToolExecution {
  agent?: { id?: string }
  signal: AbortSignal
}

export interface TeacherToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  output: {
    schema: Record<string, unknown>
    render(args: unknown, value: GeneratedContentView): Array<{ type: 'text'; text: string }>
  }
  /** Compact native card for the pending call; the raw body/HTML is not shown. */
  presentCall?(args: unknown): Record<string, unknown>
  execute(args: unknown, exec: TeacherToolExecution): Promise<GeneratedContentView>
}

export interface TeacherToolEntry {
  definition: TeacherToolDefinition
  /** Step-time visibility: only a Session already bound to a space may write. */
  visibleFor(sessionId: string): boolean
}

const sourceSchema = {
  type: 'array',
  items: { type: 'string' },
  description: '至少一条可核对来源；写清书名/章节/链接，来源与老师解释分开。',
}

const lectureParameters = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fileName: {
      type: 'string',
      description: '相对「讲义/」的文件名，可含章节子目录，必须以 .md 结尾；例如「第一章/02-条件概率.md」。不得覆盖已有文件。',
    },
    title: { type: 'string', description: '讲义标题，单行，最长 120 字。' },
    order: { type: 'integer', description: '可选排序号；省略时按文件名排序。' },
    body: { type: 'string', description: '老师解释的 Markdown 正文，不含标题和来源节；公式与代码用可读的 Markdown 代码块。' },
    sources: sourceSchema,
  },
  required: ['fileName', 'title', 'body', 'sources'],
}

const experimentParameters = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fileName: {
      type: 'string',
      description: '相对「讲义/」的文件名，可含章节子目录，必须以 .html 结尾；例如「第一章/03-贝叶斯实验.html」。不得覆盖已有文件。',
    },
    title: { type: 'string', description: '实验标题，单行，最长 120 字。' },
    order: { type: 'integer', description: '可选排序号；省略时按文件名排序。' },
    html: {
      type: 'string',
      description: '完整、自包含的动态实验 HTML。禁止外链脚本/样式/图片、网络请求、iframe、表单、宿主对象或浏览器存储；只用内联样式与脚本、data: 图片。',
    },
    sources: sourceSchema,
    parameters: {
      type: 'array',
      description: '实验声明的可调参数（至少 1 个，最多 12 个）；min < max、default 在范围内、step > 0。',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string', description: '英文参数名，例如 prior。' },
          label: { type: 'string', description: '给学习者看的参数说明。' },
          min: { type: 'number' },
          max: { type: 'number' },
          step: { type: 'number' },
          default: { type: 'number' },
          unit: { type: 'string', description: '可留空。' },
        },
        required: ['name', 'label', 'min', 'max', 'step', 'default', 'unit'],
      },
    },
  },
  required: ['fileName', 'title', 'html', 'sources', 'parameters'],
}

const generatedOutputSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    spaceId: { type: 'string' },
    path: { type: 'string' },
    fileName: { type: 'string' },
    title: { type: 'string' },
    kind: { type: 'string', enum: ['lecture', 'experiment'] },
    size: { type: 'integer' },
    version: { type: 'string' },
    sources: { type: 'array', items: { type: 'string' } },
    parameters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
          min: { type: 'number' },
          max: { type: 'number' },
          step: { type: 'number' },
          default: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name', 'label', 'min', 'max', 'step', 'default', 'unit'],
      },
    },
  },
  required: ['spaceId', 'path', 'fileName', 'title', 'kind', 'size', 'version', 'sources', 'parameters'],
}

function parse<T>(schema: z.ZodType<T>, input: unknown, label: string): T {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const detail = result.error.issues.map(issue => issue.message).join('；')
  throw new Error(`${label}参数不合法：${detail}`)
}

function sessionOf(exec: TeacherToolExecution): string {
  const id = exec.agent?.id
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('这个工具只能由绑定了学习空间的老师会话调用；没有可用的真实会话身份。')
  }
  return id
}

function assertLive(exec: TeacherToolExecution): void {
  if (exec.signal.aborted) {
    throw new Error('生成已取消，没有写入任何文件。')
  }
}

function renderGenerated(action: string, value: GeneratedContentView): Array<{ type: 'text'; text: string }> {
  const extra = value.kind === 'experiment'
    ? ` 实验声明了 ${value.parameters.length} 个参数，来源 ${value.sources.length} 条。`
    : ` 来源 ${value.sources.length} 条。`
  return [{
    type: 'text',
    text: `已${action}：${value.path}（${value.size} 字节）。${extra} 请让学习者点「刷新目录」后从课程目录进入。`,
  }]
}

/** A concise pending card: file name and title, never the full body or HTML. */
function presentGenerated(kindLabel: string, args: unknown): Record<string, unknown> {
  const row = args !== null && typeof args === 'object' ? args as { fileName?: unknown; title?: unknown } : {}
  const title = typeof row.title === 'string' && row.title.trim() !== '' ? row.title.trim() : '未命名'
  const fileName = typeof row.fileName === 'string' ? row.fileName : ''
  return {
    card: 'generic',
    title: `生成${kindLabel}：${title}`,
    kind: 'other',
    rawInput: { fileName, title },
  }
}

/**
 * Build the two model-facing writing tools. The Host is the only writer; these
 * definitions add the model-facing schema, argument bounds, real-session
 * identity check and a concise result for the native tool card.
 */
export function createTeacherTools(host: TeacherToolHost): TeacherToolEntry[] {
  const lecture: TeacherToolDefinition = {
    name: 'classroom_lecture_write',
    description:
      '为当前学习空间写一节带来源的 Markdown 讲义。只写入这个老师会话已绑定的学习空间，不能选择或自报其他主题。'
      + '文件成功落盘前不会出现在课程目录；不得覆盖同名讲义。生成后请让学习者刷新目录。',
    parameters: lectureParameters,
    output: {
      schema: generatedOutputSchema,
      render: (_args, value) => renderGenerated('写入讲义', value),
    },
    presentCall: args => presentGenerated('讲义', args),
    async execute(args, exec) {
      const draft = parse(lectureDraftSchema, args, '讲义')
      assertLive(exec)
      const value = await host.writeGenerated(sessionOf(exec), 'lecture', draft, { signal: exec.signal })
      return value
    },
  }

  const experiment: TeacherToolDefinition = {
    name: 'classroom_experiment_write',
    description:
      '为当前学习空间写一个隔离运行的动态实验（自包含 HTML）。只写入这个老师会话已绑定的学习空间，不能选择或自报其他主题。'
      + '实验不得联网、读宿主或笔记；参数、图形与读数必须一致。不得覆盖同名文件。生成后请让学习者刷新目录。',
    parameters: experimentParameters,
    output: {
      schema: generatedOutputSchema,
      render: (_args, value) => renderGenerated('写入实验', value),
    },
    presentCall: args => presentGenerated('动态实验', args),
    async execute(args, exec) {
      const draft = parse(experimentDraftSchema, args, '动态实验')
      assertLive(exec)
      const value = await host.writeGenerated(sessionOf(exec), 'experiment', draft, { signal: exec.signal })
      return value
    },
  }

  const visibleFor = (sessionId: string): boolean => {
    if (typeof sessionId !== 'string' || sessionId.trim() === '') return false
    try {
      return host.hasBoundSession(sessionId)
    } catch {
      return false
    }
  }

  return [
    { definition: lecture, visibleFor },
    { definition: experiment, visibleFor },
  ]
}
