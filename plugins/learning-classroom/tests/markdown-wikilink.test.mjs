import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseInline } from '../src/markdown.ts'

test('笔记里的双链成为独立 token，显示别名且保留原始目标', () => {
  const tokens = parseInline('前 [[概率论/讲义/01.md#第一节|第一节原文]] 后')
  assert.deepEqual(tokens, [
    { type: 'text', text: '前 ' },
    { type: 'wikilink', target: '概率论/讲义/01.md#第一节|第一节原文', text: '第一节原文' },
    { type: 'text', text: ' 后' },
  ])
})

test('无别名的双链显示标题或文件，不丢方括号目标', () => {
  const heading = parseInline('[[笔记/我的笔记.md#小结]]')
  assert.deepEqual(heading, [
    { type: 'wikilink', target: '笔记/我的笔记.md#小结', text: '小结' },
  ])
  const file = parseInline('[[资料/概率.md]]')
  assert.deepEqual(file, [
    { type: 'wikilink', target: '资料/概率.md', text: '资料/概率.md' },
  ])
})

test('未闭合或非法的双链保持普通文字，不被误当成链接', () => {
  assert.deepEqual(parseInline('[[未闭合'), [{ type: 'text', text: '[[未闭合' }])
  assert.deepEqual(parseInline('[[]]'), [{ type: 'text', text: '[[]]' }])
})

test('代码里的双链不渲染，Markdown 普通链接仍按原规则解析', () => {
  assert.deepEqual(parseInline('`[[A]]`'), [{ type: 'code', text: '[[A]]' }])
  assert.deepEqual(parseInline('[文字](https://example.com)'), [
    { type: 'link', text: '文字', href: 'https://example.com' },
  ])
})
