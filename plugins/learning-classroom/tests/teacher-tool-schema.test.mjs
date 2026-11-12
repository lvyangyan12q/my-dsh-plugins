import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const source = process.env.DSH_SOURCE
const skip = source === undefined || source === ''
  ? 'set DSH_SOURCE to an already-built official DSH checkout to evaluate the real tool schema contract'
  : false

const { createTeacherTools } = await import('../src/teacher-tools.ts')

async function validationModule() {
  return import(pathToFileURL(join(source, 'packages/core/tools/lib/index.js')).href)
}

const host = {
  hasBoundSession: () => true,
  writeGenerated: async () => {
    throw new Error('schema test does not write')
  },
}

test('真实宿主 ToolsService 接受两个老师工具的输入/输出 schema，并拒绝自报主题字段', { skip }, async () => {
  const { assertObjectJsonSchema, assertSupportedJsonSchema, validateJsonSchemaValue } = await validationModule()
  const [lecture, experiment] = createTeacherTools(host).map(entry => entry.definition)

  for (const tool of [lecture, experiment]) {
    assert.doesNotThrow(() => assertObjectJsonSchema(tool.parameters), `${tool.name} 参数必须是对象根 schema`)
    assert.doesNotThrow(() => assertSupportedJsonSchema(tool.output.schema), `${tool.name} 输出 schema 必须被真实宿主接受`)
  }

  const goodLecture = {
    fileName: '第一章/01-条件概率.md',
    title: '条件概率',
    order: 1,
    body: '解释正文。',
    sources: ['《概率论》'],
  }
  assert.deepEqual(validateJsonSchemaValue(lecture.parameters, goodLecture, ''), [])

  const selfReported = { ...goodLecture, spaceId: '另一个主题' }
  const violations = validateJsonSchemaValue(lecture.parameters, selfReported, '')
  assert.equal(violations.some(violation => /spaceId/.test(violation)), true, '真实 schema 必须拒绝自报主题字段')

  const goodExperiment = {
    fileName: '第一章/02-实验.html',
    title: '实验',
    sources: ['课堂推导'],
    parameters: [{ name: 'p', label: '概率', min: 0, max: 1, step: 0.1, default: 0.5, unit: '' }],
    readouts: [{
      name: 'outcome',
      label: '结果',
      expression: 'p * 2',
      unit: '',
      decimals: 2,
    }],
    render: {
      kind: 'line',
      xParameter: 'p',
      samples: 40,
      xLabel: '概率',
      yLabel: '结果',
      series: [{ label: '结果', expression: 'p * 2', color: '#0969da' }],
    },
  }
  assert.deepEqual(validateJsonSchemaValue(experiment.parameters, goodExperiment, ''), [])
})

test('真实宿主 ToolRuntime 注册两个老师工具并暴露绑定条件', { skip }, async () => {
  const { Context } = await import('@deepseek-ai/cordis')
  const SystemPrompt = (await import(pathToFileURL(join(source, 'packages/core/system-prompt/lib/index.js')).href)).default
  const ToolRuntime = (await import(pathToFileURL(join(source, 'packages/core/tools/lib/index.js')).href)).ToolsService
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const disposers = createTeacherTools(host).map(entry => ctx.tools.register(entry.definition, {
    when: context => entry.visibleFor(context.agent.id),
  }))
  try {
    const schemas = ctx.tools.schemas()
    assert.deepEqual(schemas.map(schema => schema.name).sort(), ['classroom_experiment_write', 'classroom_lecture_write'])
    for (const schema of schemas) {
      assert.equal(schema.parameters.additionalProperties, false)
      assert.equal(Object.keys(schema.parameters.properties).includes('spaceId'), false)
    }
  } finally {
    for (const dispose of disposers) dispose()
    await ctx.dispose?.()
  }
})
