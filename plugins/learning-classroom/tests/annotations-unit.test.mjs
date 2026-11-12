import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  appendAnnotationBlock,
  boundExcerpt,
  buildAnnotationBlock,
  maxAnnotationExcerpt,
} from '../src/annotations.ts'

const sourceLink = '[[概率论/讲义/第一章/01.md#第一节]]'

test('摘录保留纯文本原文：换行、代码缩进与行内符号不被改写', () => {
  const bounded = boundExcerpt('  第一行  \r\n\r\n    缩进代码  \r\n\r\n第三行  ')
  assert.equal(bounded.truncated, false)
  assert.equal(bounded.text, '第一行\n\n    缩进代码\n\n第三行')
})

test('超长摘录明确截断，不静默丢字', () => {
  const long = '字'.repeat(maxAnnotationExcerpt + 20)
  const bounded = boundExcerpt(long)
  assert.equal(bounded.truncated, true)
  assert.equal(Array.from(bounded.text).length, maxAnnotationExcerpt)
})

test('批注块引用真实来源双链并保留原文，不生成任何块 id', () => {
  const block = buildAnnotationBlock({
    excerpt: '样本空间可以缩小。\n\n于是概率更容易计算。',
    link: sourceLink,
  })
  assert.equal(block, [
    '> 样本空间可以缩小。',
    '>',
    '> 于是概率更容易计算。',
    '>',
    `> 来源：${sourceLink}`,
  ].join('\n'))
  assert.equal(block.includes('^'), false)
  assert.equal(block.includes('<'), false)
})

test('截断的摘录在来源行明确说明，不冒充完整原文', () => {
  const block = buildAnnotationBlock({ excerpt: '摘录', link: sourceLink, truncated: true })
  assert.match(block, /只保留了前 4000 个字符/)
})

test('追加批注逐字保留已有笔记，只在末尾增加新内容', () => {
  const note = '# 我的笔记\n\n我自己写的理解，不能改。\n'
  const block = buildAnnotationBlock({ excerpt: '原文', link: sourceLink })
  const next = appendAnnotationBlock(note, block)
  assert.equal(next.startsWith(note), true)
  assert.equal(next, `${note}\n${block}\n`)
  assert.equal(next.includes(note.trim()), true)
})

test('追加时空笔记直接写入，非空内容自动补空行且不改已有字节', () => {
  const block = buildAnnotationBlock({ excerpt: '原文', link: sourceLink })
  assert.equal(appendAnnotationBlock('', block), `${block}\n`)
  assert.equal(appendAnnotationBlock('# 标题', block), `# 标题\n\n${block}\n`)
  assert.equal(appendAnnotationBlock('# 标题\n', block), `# 标题\n\n${block}\n`)
  assert.equal(appendAnnotationBlock('# 标题\n\n', block), `# 标题\n\n${block}\n`)
})

test('来源改动后摘录仍是原句，链接仍指向真实文件与标题', () => {
  const block = buildAnnotationBlock({ excerpt: '当时的原文', link: sourceLink })
  // 来源文件此刻被改写也不影响已写入的批注：摘录与来源是笔记里的普通文本。
  assert.match(block, /当时的原文/)
  assert.match(block, /\[\[概率论\/讲义\/第一章\/01\.md#第一节\]\]/)
})

test('拒绝空批注或空链接，避免写入无来源内容', () => {
  assert.throws(() => buildAnnotationBlock({ excerpt: '   ', link: sourceLink }))
  assert.throws(() => buildAnnotationBlock({ excerpt: '原文', link: '' }))
  assert.throws(() => buildAnnotationBlock({ excerpt: '原文', link: '来源不是双链' }))
  assert.throws(() => appendAnnotationBlock('# 笔记', '   '))
})
