import assert from 'node:assert/strict'
import { test } from 'node:test'

const {
  compileExperimentDraft,
  composeExperimentFile,
  experimentDraftSchema,
  readExperimentFile,
} = await import('../src/experiment-spec.ts')

const bayes = {
  fileName: '第一章/03-贝叶斯实验.html',
  title: '贝叶斯更新',
  order: 3,
  sources: ['《概率论》第 2 章', '课堂推导'],
  parameters: [
    { name: 'prior', label: '先验概率', min: 0, max: 1, step: 0.01, default: 0.5, unit: '' },
    { name: 'likelihood', label: '似然', min: 0, max: 1, step: 0.01, default: 0.8, unit: '' },
    { name: 'falsePositive', label: '误报率', min: 0.01, max: 1, step: 0.01, default: 0.2, unit: '' },
  ],
  readouts: [
    {
      name: 'posterior',
      label: '后验概率',
      expression: 'prior * likelihood / (prior * likelihood + (1 - prior) * falsePositive)',
      unit: '',
      decimals: 2,
    },
  ],
  render: {
    kind: 'line',
    xParameter: 'prior',
    samples: 80,
    xLabel: '先验概率',
    yLabel: '后验概率',
    series: [{
      label: '后验',
      color: '#0969da',
      expression: 'prior * likelihood / (prior * likelihood + (1 - prior) * falsePositive)',
    }],
  },
}

test('声明式实验 spec 编译出受限 AST，折线图与读数共用同一表达式', () => {
  const spec = compileExperimentDraft(bayes)
  assert.equal(spec.format, 'learning-experiment/v1')
  assert.equal(spec.readouts[0].ast.kind, 'binary')
  assert.equal(spec.render.series[0].ast.kind, 'binary')
  assert.equal(JSON.stringify(spec.readouts[0].ast).includes('"call"'), false)
  assert.equal(JSON.stringify(spec.readouts[0].ast).includes('"string"'), false)
})

test('实验文件只含惰性 JSON spec，不执行模型 HTML/JS，JSON 里的脚本闭合与行分隔符被安全转义', () => {
  const spec = compileExperimentDraft({
    ...bayes,
    title: '贝叶斯 </script><script>self["loc"+"ation"]="https://example.com"</script> 实验',
    readouts: [{ ...bayes.readouts[0], label: '后验 </script><script>alert(1)</script>\u2028\u2029' }],
  })
  const html = composeExperimentFile(spec)
  assert.match(html, /name="learning-classroom:experiment" content="learning-experiment\/v1"/)
  assert.match(html, /<script type="application\/json" id="learning-classroom-experiment-spec">/)
  assert.match(html, /\\u003c\/script>/)
  assert.doesNotMatch(html, /<\/script><script>self/, 'JSON 中的脚本闭合必须被转义，不能形成第二个可执行 script')
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.doesNotMatch(html, /\u2028|\u2029/, 'U+2028/U+2029 必须转义')
  assert.equal((html.match(/<script\b/gi) ?? []).length, 1)
  assert.match(html, /<script type="application\/json"/)

  const parsed = readExperimentFile(html)
  assert.equal(parsed.legacy, false)
  assert.equal(parsed.error, null)
  assert.deepEqual(parsed.spec, spec)
})

test('旧式任意 HTML/脚本实验明确不执行，保留可读原因；损坏的声明式文件也报错误', () => {
  const legacy = '<!doctype html><html><body><script>self["loc"+"ation"]="https://example.com"</script></body></html>'
  const old = readExperimentFile(legacy)
  assert.equal(old.spec, null)
  assert.equal(old.legacy, true)
  assert.match(old.error, /旧式|任意|脚本|不执行|重新生成/)

  const malformed = '<!doctype html><html><head><meta name="learning-classroom:experiment" content="learning-experiment/v1"></head><body><script type="application/json" id="learning-classroom-experiment-spec">{bad json}</script></body></html>'
  const broken = readExperimentFile(malformed)
  assert.equal(broken.spec, null)
  assert.equal(broken.legacy, false)
  assert.match(broken.error, /无法读取|JSON|声明/)
})

test('实验声明拒绝任意脚本、属性、字符串、未知参数、重复名称、越界采样和非有限默认结果', () => {
  const bads = [
    { ...bayes, readouts: [{ ...bayes.readouts[0], expression: 'prior.value' }] },
    { ...bayes, readouts: [{ ...bayes.readouts[0], expression: '"prior"' }] },
    { ...bayes, readouts: [{ ...bayes.readouts[0], expression: 'eval("prior")' }] },
    { ...bayes, readouts: [{ ...bayes.readouts[0], expression: 'unknown + 1' }] },
    { ...bayes, readouts: [bayes.readouts[0], { ...bayes.readouts[0], label: '重复' }] },
    { ...bayes, render: { ...bayes.render, xParameter: 'missing' } },
    { ...bayes, render: { ...bayes.render, samples: 2 } },
    { ...bayes, render: { ...bayes.render, samples: 1000 } },
    { ...bayes, render: { ...bayes.render, series: [] } },
    { ...bayes, parameters: [bayes.parameters[0], { ...bayes.parameters[0], label: '重复' }] },
    { ...bayes, readouts: [{ ...bayes.readouts[0], expression: 'prior / 0' }] },
  ]
  for (const bad of bads) {
    assert.throws(() => compileExperimentDraft(bad), /表达式|参数|重复|采样|读数|未知|不允许|有限|除零|范围|series|readout|图线/i)
  }
  assert.equal(experimentDraftSchema.safeParse(bads[0]).success, false)
})

test('声明式实验的 schema 只接受受控字段，不接受 html/script/ast 自报', () => {
  for (const extra of [{ html: '<script>alert(1)</script>' }, { script: 'alert(1)' }, { ast: {} }]) {
    assert.equal(experimentDraftSchema.safeParse({ ...bayes, ...extra }).success, false)
  }
})
