import { z } from 'zod'
import { jsonForScript } from './experiment-json.ts'
import {
  evaluateExperimentAst,
  experimentExpressionLimits,
  parseExperimentExpression,
  type ExperimentAst,
  type ExperimentFunctionName,
} from './experiment-expression.ts'

export type { ExperimentAst, ExperimentFunctionName } from './experiment-expression.ts'

export interface ExperimentParameter {
  name: string
  label: string
  min: number
  max: number
  step: number
  default: number
  unit: string
}

export interface ExperimentReadout {
  name: string
  label: string
  unit: string
  decimals: number
  ast: ExperimentAst
}

export interface ExperimentSeries {
  label: string
  color: string
  ast: ExperimentAst
}

export interface ExperimentRender {
  kind: 'line' | 'bars'
  xParameter: string
  samples: number
  xLabel: string
  yLabel: string
  series: ExperimentSeries[]
}

export interface ExperimentSpec {
  format: 'learning-experiment/v1'
  title: string
  sources: string[]
  parameters: ExperimentParameter[]
  readouts: ExperimentReadout[]
  render: ExperimentRender
}

export interface ExperimentDraft {
  fileName: string
  title: string
  order?: number
  sources: string[]
  parameters: ExperimentParameter[]
  readouts: Array<{
    name: string
    label: string
    expression: string
    unit?: string
    decimals?: number
  }>
  render: {
    kind: 'line' | 'bars'
    xParameter: string
    samples: number
    xLabel?: string
    yLabel?: string
    series: Array<{ label: string; expression: string; color?: string }>
  }
}

export const experimentSpecLimits = {
  title: 120,
  label: 80,
  sourceCount: 20,
  sourceLength: 500,
  parameters: 12,
  readouts: 8,
  series: 6,
  samplesMin: 24,
  samplesMax: 256,
  decimals: 6,
} as const

const parameterName = /^[A-Za-z][A-Za-z0-9_]{0,31}$/
const singleLine = (value: string): boolean => !/[\r\n]/.test(value)
const colorPattern = /^#[0-9a-fA-F]{6}$/

function text(value: string, label: string, max: number): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new Error(`${label}不能为空。`)
  if (trimmed.length > max) throw new Error(`${label}超过 ${max} 个字符。`)
  if (!singleLine(trimmed)) throw new Error(`${label}不能包含换行。`)
  return trimmed
}

export const experimentParameterSchema = z.object({
  name: z.string().regex(parameterName, '参数名须以字母开头，只含字母、数字或下划线，最长 32 个字符。'),
  label: z.string()
    .transform(value => value.trim())
    .refine(value => value !== '', '参数说明不能为空。')
    .refine(value => value.length <= experimentSpecLimits.label, `参数说明不能超过 ${experimentSpecLimits.label} 个字符。`)
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
  if (parameter.step > parameter.max - parameter.min) {
    ctx.addIssue({ code: 'custom', message: `参数 ${parameter.name} 的步长不能大于取值范围。` })
  }
})

const sourcesSchema = z.array(
  z.string()
    .transform(value => value.trim())
    .refine(value => value !== '', '来源不能为空。')
    .refine(value => value.length <= experimentSpecLimits.sourceLength, `单条来源不能超过 ${experimentSpecLimits.sourceLength} 个字符。`)
    .refine(singleLine, '来源不能包含换行。'),
)
  .min(1, '至少给出一条来源。')
  .max(experimentSpecLimits.sourceCount, `来源最多 ${experimentSpecLimits.sourceCount} 条。`)

const readoutDraftSchema = z.object({
  name: z.string().regex(parameterName, '读数名须以字母开头，只含字母、数字或下划线，最长 32 个字符。'),
  label: z.string()
    .transform(value => value.trim())
    .refine(value => value !== '', '读数说明不能为空。')
    .refine(value => value.length <= experimentSpecLimits.label, `读数说明不能超过 ${experimentSpecLimits.label} 个字符。`)
    .refine(singleLine, '读数说明不能包含换行。'),
  expression: z.string().min(1, '读数表达式不能为空。').max(experimentExpressionLimits.sourceLength),
  unit: z.string().max(16).optional().default(''),
  decimals: z.number().int().min(0).max(experimentSpecLimits.decimals).optional().default(2),
}).strict()

const seriesDraftSchema = z.object({
  label: z.string()
    .transform(value => value.trim())
    .refine(value => value !== '', '图线说明不能为空。')
    .refine(value => value.length <= experimentSpecLimits.label, `图线说明不能超过 ${experimentSpecLimits.label} 个字符。`)
    .refine(singleLine, '图线说明不能包含换行。'),
  expression: z.string().min(1, '图线表达式不能为空。').max(experimentExpressionLimits.sourceLength),
  color: z.string().regex(colorPattern, '图线颜色必须是 #rrggbb。').optional(),
}).strict()

const renderDraftSchema = z.object({
  kind: z.enum(['line', 'bars']),
  xParameter: z.string().min(1).max(64),
  samples: z.number().int()
    .min(experimentSpecLimits.samplesMin, `采样点数不能少于 ${experimentSpecLimits.samplesMin}。`)
    .max(experimentSpecLimits.samplesMax, `采样点数不能超过 ${experimentSpecLimits.samplesMax}。`),
  xLabel: z.string().max(experimentSpecLimits.label).optional().default(''),
  yLabel: z.string().max(experimentSpecLimits.label).optional().default(''),
  series: z.array(seriesDraftSchema).min(1, '至少给出一条图线。').max(experimentSpecLimits.series, `图线最多 ${experimentSpecLimits.series} 条。`),
}).strict()

export const experimentDraftSchema = z.object({
  fileName: z.string().min(1).max(400),
  title: z.string()
    .transform(value => value.trim())
    .refine(value => value !== '', '标题不能为空。')
    .refine(value => value.length <= experimentSpecLimits.title, `标题不能超过 ${experimentSpecLimits.title} 个字符。`)
    .refine(singleLine, '标题不能包含换行。'),
  order: z.number().int().min(-1_000_000).max(1_000_000).optional(),
  sources: sourcesSchema,
  parameters: z.array(experimentParameterSchema).min(1, '至少声明一个参数。').max(experimentSpecLimits.parameters, `参数最多 ${experimentSpecLimits.parameters} 个。`),
  readouts: z.array(readoutDraftSchema).min(1, '至少声明一个读数。').max(experimentSpecLimits.readouts, `读数最多 ${experimentSpecLimits.readouts} 个。`),
  render: renderDraftSchema,
}).strict().superRefine((draft, ctx) => {
  const parameterNames = new Set<string>()
  for (const parameter of draft.parameters) {
    if (parameterNames.has(parameter.name)) ctx.addIssue({ code: 'custom', message: `参数名重复：${parameter.name}` })
    parameterNames.add(parameter.name)
  }
  const readoutNames = new Set<string>()
  for (const readout of draft.readouts) {
    if (readoutNames.has(readout.name)) ctx.addIssue({ code: 'custom', message: `读数名重复：${readout.name}` })
    readoutNames.add(readout.name)
    try {
      parseExperimentExpression(readout.expression, [...parameterNames])
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: `读数《${readout.label}》表达式不合法：${error instanceof Error ? error.message : '未知原因'}` })
    }
  }
  if (!parameterNames.has(draft.render.xParameter)) {
    ctx.addIssue({ code: 'custom', message: `横轴参数不存在：${draft.render.xParameter}` })
  }
  for (const series of draft.render.series) {
    try {
      parseExperimentExpression(series.expression, [...parameterNames])
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: `图线《${series.label}》表达式不合法：${error instanceof Error ? error.message : '未知原因'}` })
    }
  }
})

function astNodeCount(ast: ExperimentAst): number {
  switch (ast.kind) {
    case 'number':
    case 'param': return 1
    case 'unary': return 1 + astNodeCount(ast.arg)
    case 'binary': return 1 + astNodeCount(ast.left) + astNodeCount(ast.right)
    case 'call': return 1 + ast.args.reduce((sum, arg) => sum + astNodeCount(arg), 0)
  }
}

function astDepth(ast: ExperimentAst): number {
  switch (ast.kind) {
    case 'number':
    case 'param': return 1
    case 'unary': return 1 + astDepth(ast.arg)
    case 'binary': return 1 + Math.max(astDepth(ast.left), astDepth(ast.right))
    case 'call': return 1 + Math.max(0, ...ast.args.map(astDepth))
  }
}

function assertAstLimits(ast: ExperimentAst, label: string): void {
  if (astNodeCount(ast) > experimentExpressionLimits.nodes) throw new Error(`${label}节点过多。`)
  if (astDepth(ast) > experimentExpressionLimits.depth) throw new Error(`${label}嵌套过深。`)
}

/** Compile model-facing expression strings into a stored, evaluation-only AST spec. */
export function compileExperimentDraft(input: unknown): ExperimentSpec {
  let draft
  try {
    draft = experimentDraftSchema.parse(input)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`实验 spec 不合法：${error.issues.map(issue => issue.message).join('；')}`)
    }
    throw error
  }
  const parameterNames = draft.parameters.map(parameter => parameter.name)
  const defaults = Object.fromEntries(draft.parameters.map(parameter => [parameter.name, parameter.default]))
  const readouts = draft.readouts.map(readout => {
    const ast = parseExperimentExpression(readout.expression, parameterNames)
    assertAstLimits(ast, `读数《${readout.label}》`)
    try {
      evaluateExperimentAst(ast, defaults)
    } catch (error) {
      throw new Error(`读数《${readout.label}》在默认参数下无法得到有限结果：${error instanceof Error ? error.message : '未知原因'}`)
    }
    return {
      name: readout.name,
      label: readout.label,
      unit: readout.unit,
      decimals: readout.decimals,
      ast,
    }
  })
  const series = draft.render.series.map((item, index) => {
    const ast = parseExperimentExpression(item.expression, parameterNames)
    assertAstLimits(ast, `图线《${item.label}》`)
    return {
      label: item.label,
      color: item.color ?? ['#0969da', '#1a7f37', '#cf222e', '#8250df', '#bf8700', '#0969da'][index % 6],
      ast,
    }
  })
  return {
    format: 'learning-experiment/v1',
    title: draft.title,
    sources: draft.sources,
    parameters: draft.parameters,
    readouts,
    render: {
      kind: draft.render.kind,
      xParameter: draft.render.xParameter,
      samples: draft.render.samples,
      xLabel: draft.render.xLabel,
      yLabel: draft.render.yLabel,
      series,
    },
  }
}

const astSchema: z.ZodType<ExperimentAst> = z.lazy(() => z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('number'), value: z.number().finite() }).strict(),
  z.object({ kind: z.literal('param'), name: z.string().regex(parameterName) }).strict(),
  z.object({ kind: z.literal('unary'), op: z.enum(['+', '-']), arg: astSchema }).strict(),
  z.object({
    kind: z.literal('binary'),
    op: z.enum(['+', '-', '*', '/', '^']),
    left: astSchema,
    right: astSchema,
  }).strict(),
  z.object({
    kind: z.literal('call'),
    name: z.enum(['min', 'max', 'abs', 'sqrt', 'exp', 'log', 'sin', 'cos', 'pow', 'clamp']),
    args: z.array(astSchema).min(1).max(experimentExpressionLimits.functionArguments),
  }).strict(),
]))

const storedReadoutSchema = z.object({
  name: z.string().regex(parameterName),
  label: z.string().min(1).max(experimentSpecLimits.label),
  unit: z.string().max(16),
  decimals: z.number().int().min(0).max(experimentSpecLimits.decimals),
  ast: astSchema,
}).strict()

const storedSeriesSchema = z.object({
  label: z.string().min(1).max(experimentSpecLimits.label),
  color: z.string().regex(colorPattern),
  ast: astSchema,
}).strict()

export const storedExperimentSchema = z.object({
  format: z.literal('learning-experiment/v1'),
  title: z.string().min(1).max(experimentSpecLimits.title),
  sources: z.array(z.string().min(1).max(experimentSpecLimits.sourceLength)).min(1).max(experimentSpecLimits.sourceCount),
  parameters: z.array(experimentParameterSchema).min(1).max(experimentSpecLimits.parameters),
  readouts: z.array(storedReadoutSchema).min(1).max(experimentSpecLimits.readouts),
  render: z.object({
    kind: z.enum(['line', 'bars']),
    xParameter: z.string(),
    samples: z.number().int()
    .min(experimentSpecLimits.samplesMin, `采样点数不能少于 ${experimentSpecLimits.samplesMin}。`)
    .max(experimentSpecLimits.samplesMax, `采样点数不能超过 ${experimentSpecLimits.samplesMax}。`),
    xLabel: z.string().max(experimentSpecLimits.label),
    yLabel: z.string().max(experimentSpecLimits.label),
    series: z.array(storedSeriesSchema).min(1).max(experimentSpecLimits.series),
  }).strict(),
}).strict()

const markerPattern = /<meta\b[^>]*name\s*=\s*["']learning-classroom:experiment["'][^>]*>/i
const specScriptPattern = /<script\b[^>]*\bid\s*=\s*["']learning-classroom-experiment-spec["'][^>]*>([\s\S]*?)<\/script>/i

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/** Build the inert knowledge file: fixed shell + escaped JSON spec, no executable script. */
export function composeExperimentFile(spec: ExperimentSpec, order?: number): string {
  const orderMeta = order !== undefined ? `<meta name="learning-classroom:order" content="${order}">` : ''
  return [
    '<!doctype html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="learning-classroom:experiment" content="learning-experiment/v1">',
    `<title>${escapeHtml(spec.title)}</title>`,
    orderMeta,
    '</head>',
    '<body>',
    '<p>这是声明式动态实验数据；请在 DSH 学习课堂中打开，课堂会用固定可信 runtime 渲染。此文件不包含可执行脚本。</p>',
    `<script type="application/json" id="learning-classroom-experiment-spec">${jsonForScript(spec)}</script>`,
    '</body>',
    '</html>',
    '',
  ].join('\n')
}

export interface ReadExperimentResult {
  spec: ExperimentSpec | null
  legacy: boolean
  error: string | null
}

/** Read a generated declarative file. Legacy arbitrary HTML is never executed. */
export function readExperimentFile(html: string): ReadExperimentResult {
  if (typeof html !== 'string' || html === '') {
    return { spec: null, legacy: true, error: '实验文件为空或不是文本，未执行。' }
  }
  if (!markerPattern.test(html)) {
    return {
      spec: null,
      legacy: true,
      error: '这是旧式任意 HTML/脚本实验，当前版本不执行它；请保留原文件，并让老师重新生成声明式实验。',
    }
  }
  const match = specScriptPattern.exec(html)
  if (match === null) {
    return { spec: null, legacy: false, error: '实验声明式文件缺少可读取的 JSON spec，未执行。' }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(match[1])
  } catch {
    return { spec: null, legacy: false, error: '实验声明式文件的 JSON spec 无法解析，未执行。' }
  }
  const result = storedExperimentSchema.safeParse(parsed)
  if (!result.success) {
    return {
      spec: null,
      legacy: false,
      error: `实验声明式文件的 spec 不合法：${result.error.issues.map(issue => issue.message).join('；')}`,
    }
  }
  try {
    const parameterNames = new Set(result.data.parameters.map(parameter => parameter.name))
    if (!parameterNames.has(result.data.render.xParameter)) throw new Error(`横轴参数不存在：${result.data.render.xParameter}`)
    for (const readout of result.data.readouts) {
      assertAstLimits(readout.ast, `读数《${readout.label}》`)
      for (const node of astParameters(readout.ast)) {
        if (!parameterNames.has(node)) throw new Error(`读数《${readout.label}》引用了未知参数：${node}`)
      }
    }
    for (const series of result.data.render.series) {
      assertAstLimits(series.ast, `图线《${series.label}》`)
      for (const node of astParameters(series.ast)) {
        if (!parameterNames.has(node)) throw new Error(`图线《${series.label}》引用了未知参数：${node}`)
      }
    }
  } catch (error) {
    return { spec: null, legacy: false, error: `实验声明式文件的 spec 不安全：${error instanceof Error ? error.message : '未知原因'}` }
  }
  return { spec: result.data, legacy: false, error: null }
}

function astParameters(ast: ExperimentAst): string[] {
  switch (ast.kind) {
    case 'number': return []
    case 'param': return [ast.name]
    case 'unary': return astParameters(ast.arg)
    case 'binary': return [...astParameters(ast.left), ...astParameters(ast.right)]
    case 'call': return ast.args.flatMap(astParameters)
  }
}
