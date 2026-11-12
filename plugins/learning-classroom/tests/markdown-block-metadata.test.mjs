import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseMarkdown } from '../src/markdown.ts'

test('段落末尾的真实块 id 成为块元数据并从显示文本中移除', () => {
  assert.deepEqual(parseMarkdown('真段落 ^real-block\n'), [
    { type: 'paragraph', text: '真段落', blockId: 'real-block' },
  ])
})

test('独立一行的 ^id 归属前一个真实块，不冒充新段落', () => {
  assert.deepEqual(parseMarkdown('真段落\n\n^standalone-block\n'), [
    { type: 'paragraph', text: '真段落', blockId: 'standalone-block' },
  ])
})

test('代码块里的 ^fake 不产生块元数据，且代码内容保持原样', () => {
  const blocks = parseMarkdown('```\n结论 ^fake-block\n```\n\n真段落 ^real-block\n')
  assert.equal(blocks[0].type, 'code')
  assert.equal(blocks[0].blockId, undefined)
  assert.match(blocks[0].code, /\^fake-block/)
  assert.deepEqual(blocks[1], { type: 'paragraph', text: '真段落', blockId: 'real-block' })
})

test('没有块边界的 abc^real 不是块 id；标题的 ^id 同样归属标题', () => {
  assert.deepEqual(parseMarkdown('abc^real\n'), [
    { type: 'paragraph', text: 'abc^real' },
  ])
  assert.deepEqual(parseMarkdown('## 小节 ^heading-block\n'), [
    { type: 'heading', level: 2, text: '小节', blockId: 'heading-block' },
  ])
})
