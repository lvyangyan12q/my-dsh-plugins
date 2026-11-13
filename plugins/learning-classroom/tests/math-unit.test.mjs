import assert from 'node:assert/strict'
import { test } from 'node:test'

const { parseInline, parseMarkdown } = await import('../src/markdown.ts')

test('行内数学成为独立 token，TeX 原样保留', () => {
  const tokens = parseInline('体积是 $V = \\frac{4}{3}\\pi r^3$。')
  assert.deepEqual(tokens, [
    { type: 'text', text: '体积是 ' },
    { type: 'math', tex: 'V = \\frac{4}{3}\\pi r^3', display: false },
    { type: 'text', text: '。' },
  ])
})

test('独立成行的 $$ 是 display math 块，多行 TeX 保持原文', () => {
  const source = [
    '条件概率：',
    '',
    '$$',
    'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}',
    '$$',
    '',
    '读作在 B 已发生的前提下 A 的概率。',
  ].join('\n')
  assert.deepEqual(parseMarkdown(source), [
    { type: 'paragraph', text: '条件概率：' },
    { type: 'math', tex: 'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}', display: true },
    { type: 'paragraph', text: '读作在 B 已发生的前提下 A 的概率。' },
  ])
})

test('同一行的 $$...$$ 也按 display math 块解析', () => {
  assert.deepEqual(parseMarkdown('$$ x^2 + y^2 = z^2 $$\n'), [
    { type: 'math', tex: 'x^2 + y^2 = z^2', display: true },
  ])
})

test('代码围栏里的公式不进入数学解析，代码内容逐字保留', () => {
  const blocks = parseMarkdown('```md\n$x$ 和 $$y$$ 都只是示例\n```\n\n真正公式 $z$。\n')
  assert.deepEqual(blocks, [
    { type: 'code', lang: 'md', code: '$x$ 和 $$y$$ 都只是示例' },
    { type: 'paragraph', text: '真正公式 $z$。' },
  ])
})

test('行内代码里的美元符号不当作公式', () => {
  assert.deepEqual(parseInline('`$x$` 与 $y$'), [
    { type: 'code', text: '$x$' },
    { type: 'text', text: ' 与 ' },
    { type: 'math', tex: 'y', display: false },
  ])
})

test('未闭合、空内容与货币写法安全降级为普通文字', () => {
  assert.deepEqual(parseInline('$未闭合'), [{ type: 'text', text: '$未闭合' }])
  assert.deepEqual(parseInline('$$'), [{ type: 'text', text: '$$' }])
  assert.deepEqual(parseInline('价格 $5 和 $3'), [{ type: 'text', text: '价格 $5 和 $3' }])
  assert.deepEqual(parseMarkdown('$$\n没有结束\n'), [{ type: 'paragraph', text: '$$ 没有结束' }])
})

test('美元符号可用反斜杠转义，转义后的 $ 不打开公式', () => {
  assert.deepEqual(parseInline('\\$5 与 $x$'), [
    { type: 'text', text: '$5 与 ' },
    { type: 'math', tex: 'x', display: false },
  ])
})

test('HTML 标签不能被数学解析或 TeX 注入变成 DOM 结构', () => {
  const tokens = parseInline('<img src=x onerror=alert(1)> $<script>alert(2)</script>$')
  assert.deepEqual(tokens[0], { type: 'text', text: '<img src=x onerror=alert(1)> ' })
  assert.deepEqual(tokens[1], { type: 'math', tex: '<script>alert(2)</script>', display: false })
  const html = parseMarkdown('<img src=x onerror="alert(1)">')
  assert.deepEqual(html, [{ type: 'paragraph', text: '<img src=x onerror="alert(1)">' }])
})

test('数学块沿用真实块 id 元数据，代码围栏后的 ^id 仍不冒充锚点', () => {
  assert.deepEqual(parseMarkdown('$$\nx^2\n$$\n^math-block\n'), [
    { type: 'math', tex: 'x^2', display: true, blockId: 'math-block' },
  ])
  const fenced = parseMarkdown('```\n$$\n^fake\n```\n')
  assert.equal(fenced[0].type, 'code')
  assert.equal(fenced[0].blockId, undefined)
})
