import assert from 'node:assert/strict'
import { test } from 'node:test'

const {
  evaluateExperimentAst,
  experimentExpressionLimits,
  parseExperimentExpression,
} = await import('../src/experiment-expression.ts')

const parameters = ['prior', 'likelihood', 'falsePositive']

test('受限表达式支持参数、四则、幂、括号和白名单函数', () => {
  const ast = parseExperimentExpression('prior * likelihood / (prior * likelihood + (1 - prior) * falsePositive)', parameters)
  const posterior = evaluateExperimentAst(ast, { prior: 0.5, likelihood: 0.8, falsePositive: 0.2 })
  assert.ok(Math.abs(posterior - (0.5 * 0.8) / (0.5 * 0.8 + 0.5 * 0.2)) < 1e-12)
  assert.equal(evaluateExperimentAst(parseExperimentExpression('max(min(prior, 0.7), 0.2)', parameters), { prior: 0.9 }), 0.7)
  assert.equal(evaluateExperimentAst(parseExperimentExpression('sqrt(9) + abs(-2) + pow(2, 3)', parameters), {}), 13)
  assert.equal(evaluateExperimentAst(parseExperimentExpression('clamp(prior, 0, 1) + sin(0) + cos(0) + exp(0) + log(1)', parameters), { prior: 1.5 }), 3)
  assert.ok(Math.abs(evaluateExperimentAst(parseExperimentExpression('pi', parameters), {}) - Math.PI) < 1e-12)
  assert.ok(Math.abs(evaluateExperimentAst(parseExperimentExpression('e', parameters), {}) - Math.E) < 1e-12)
})

test('表达式拒绝属性、字符串、赋值、调用任意函数和未知参数', () => {
  for (const source of [
    'prior.value',
    'prior["x"]',
    "'字符串'",
    '"字符串"',
    'eval("prior")',
    'new Function("return 1")',
    'prior = 1',
    'prior; likelihood',
    'foo(prior)',
    'prior(1)',
    'unknownParameter + 1',
    'Math.max(prior, 1)',
    'window.location',
    'fetch("https://example.com")',
    'prior?.value',
    'prior ?? 1',
    'prior || 1',
    'prior > 0',
  ]) {
    assert.throws(
      () => parseExperimentExpression(source, parameters),
      /表达式|不支持|未知|函数|参数|字符|语法/,
      source,
    )
  }
})

test('表达式有节点、深度和长度硬限，错误可理解', () => {
  assert.throws(
    () => parseExperimentExpression('1+'.repeat(experimentExpressionLimits.nodes + 5) + '1', parameters),
    /过长|节点|深度|语法/,
  )
  assert.throws(
    () => parseExperimentExpression(`prior${' + 1'.repeat(experimentExpressionLimits.depth + 2)}`, parameters),
    /过深|深度|语法/,
  )
  assert.throws(
    () => parseExperimentExpression('1+'.repeat(experimentExpressionLimits.sourceLength), parameters),
    /过长|长度/,
  )
})

test('求值结果必须是有限数，除零和非法数学结果明确失败', () => {
  assert.throws(
    () => evaluateExperimentAst(parseExperimentExpression('prior / (prior - prior)', parameters), { prior: 0.5 }),
    /有限|无穷|除零|NaN|数值/,
  )
  assert.throws(
    () => evaluateExperimentAst(parseExperimentExpression('sqrt(-1)', parameters), { prior: 0.5 }),
    /有限|NaN|数值/,
  )
  assert.throws(
    () => evaluateExperimentAst(parseExperimentExpression('prior + 1e308 * 1e308', parameters), { prior: 0.5 }),
    /有限|无穷|数值/,
  )
  assert.throws(
    () => evaluateExperimentAst(parseExperimentExpression('1 / (1e308 * 1e308)', parameters), { prior: 0.5 }),
    /有限|无穷|NaN|Infinity|数值/,
    '中间 Infinity 不能变成 0；Host 与 runtime 都必须在每一步拒绝非有限值',
  )
})

test('一元负号低于幂运算，幂右结合且指数可为负', () => {
  const value = (source, scope = {}) => evaluateExperimentAst(parseExperimentExpression(source, Object.keys(scope)), scope)
  assert.equal(value('-2^2'), -4)
  assert.equal(value('(-2)^2'), 4)
  assert.equal(value('2^-2'), 0.25)
  assert.equal(value('2^3^2'), 512)
  assert.equal(value('-prior^2', { prior: 2 }), -4)
  assert.equal(value('2^(-2)'), 0.25)
})
