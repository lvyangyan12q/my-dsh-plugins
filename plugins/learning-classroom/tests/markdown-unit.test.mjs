import assert from 'node:assert/strict'
import { test } from 'node:test'

/** Pure Markdown-to-block conversion. It never produces raw HTML blocks. */
const { parseInline, parseMarkdown } = await import('../src/markdown.ts')

test('解析标题、段落、列表、代码、引用与表格', () => {
  const source = [
    '# 第一节',
    '',
    '普通段落第一行',
    '普通段落第二行',
    '',
    '- 项目一',
    '- 项目二',
    '',
    '1. 第一步',
    '2. 第二步',
    '',
    '> 引用的一句话',
    '',
    '```ts',
    'const x = 1',
    '```',
    '',
    '| 概念 | 说明 |',
    '| --- | --- |',
    '| 样本空间 | 所有结果 |',
    '| 事件 | 结果的集合 |',
  ].join('\n')

  const blocks = parseMarkdown(source)
  assert.deepEqual(blocks.map(block => block.type), ['heading', 'paragraph', 'list', 'list', 'quote', 'code', 'table'])
  assert.deepEqual(blocks[0], { type: 'heading', level: 1, text: '第一节' })
  assert.deepEqual(blocks[1], { type: 'paragraph', text: '普通段落第一行 普通段落第二行' })
  assert.deepEqual(blocks[2], { type: 'list', ordered: false, items: ['项目一', '项目二'] })
  assert.deepEqual(blocks[3], { type: 'list', ordered: true, items: ['第一步', '第二步'] })
  assert.deepEqual(blocks[4], { type: 'quote', text: '引用的一句话' })
  assert.deepEqual(blocks[5], { type: 'code', lang: 'ts', code: 'const x = 1' })
  assert.deepEqual(blocks[6], { type: 'table', header: ['概念', '说明'], rows: [['样本空间', '所有结果'], ['事件', '结果的集合']] })
})

test('frontmatter 不进入正文，未闭合的代码围栏也不丢内容', () => {
  const blocks = parseMarkdown('---\ntitle: 隐藏标题\norder: 1\n---\n\n# 可见标题\n')
  assert.deepEqual(blocks, [{ type: 'heading', level: 1, text: '可见标题' }])

  const unclosed = parseMarkdown('```\n没有结束围栏\n')
  assert.deepEqual(unclosed, [{ type: 'code', lang: '', code: '没有结束围栏' }])
})

test('无法识别的结构与原始 HTML 降级为纯文本段落，不产生 html 块', () => {
  const html = '<img src=x onerror="alert(1)">\n\n<script>alert(2)</script>'
  const blocks = parseMarkdown(html)
  assert.equal(blocks.every(block => block.type === 'paragraph'), true)
  assert.match(blocks.map(block => block.text).join('\n'), /<img src=x/)
  assert.match(blocks.map(block => block.text).join('\n'), /<script>alert\(2\)<\/script>/)

  const brokenTable = '| 只有一个 |\n| 没有分隔行 |'
  assert.deepEqual(parseMarkdown(brokenTable), [{ type: 'paragraph', text: '| 只有一个 | | 没有分隔行 |' }])
})

test('行内解析只把安全链接变成链接，未知语法保持文本', () => {
  assert.deepEqual(parseInline('看 `code` 和 **加粗** 与 *斜体*'), [
    { type: 'text', text: '看 ' },
    { type: 'code', text: 'code' },
    { type: 'text', text: ' 和 ' },
    { type: 'strong', text: '加粗' },
    { type: 'text', text: ' 与 ' },
    { type: 'em', text: '斜体' },
  ])
  assert.deepEqual(parseInline('[讲义](讲义/01.md)'), [
    { type: 'link', text: '讲义', href: '讲义/01.md' },
  ])
  assert.deepEqual(parseInline('[危险](javascript:alert(1))'), [
    { type: 'text', text: '[危险](javascript:alert(1))' },
  ])
  // Obsidian 双链是已支持的语法，不再是未知文本；未知语法仍保持字面。
  assert.deepEqual(parseInline('[[讲义/01.md]]'), [
    { type: 'wikilink', target: '讲义/01.md', text: '讲义/01.md' },
  ])
  assert.deepEqual(parseInline('**未闭合'), [{ type: 'text', text: '**未闭合' }])
})
