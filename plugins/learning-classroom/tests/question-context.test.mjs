import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  appendContextBlock,
  excerptForQuestion,
  formatQuestionBlock,
  questionExcerptLimit,
  removeContextBlock,
} from '../src/question-context.ts'

/**
 * Seam under test: the question-context text contract shared by the three
 * "ask the teacher" entry points. It freezes the space, the material path, the
 * file version and the excerpt into one plain-text block that is appended to
 * the existing native draft, and it can take exactly that block back out
 * without touching anything else. Real composer behaviour, sending and the
 * native history stay out of this unit test; the panel test and browser
 * acceptance cover them.
 */

const lecture = {
  kind: 'lecture-selection',
  spaceTitle: '概率论',
  title: '条件概率',
  path: '讲义/第一章/01-条件概率.md',
  version: 'a'.repeat(64),
  unsaved: false,
  excerpt: '条件概率的定义：在事件 B 发生的条件下，事件 A 发生的概率。',
  truncated: false,
}

test('冻结块写清主题、材料、版本与摘录，并标明是选段还是整篇', () => {
  const block = formatQuestionBlock(lecture)
  assert.match(block, /^【提问上下文】/)
  assert.match(block, /主题：概率论/)
  assert.match(block, /讲义《条件概率》选段/)
  assert.match(block, /讲义\/第一章\/01-条件概率\.md/)
  assert.match(block, new RegExp(`版本：${'a'.repeat(64)}`))
  assert.match(block, /摘录：/)
  assert.match(block, /^> 条件概率的定义/m)

  const whole = formatQuestionBlock({ ...lecture, kind: 'lecture', truncated: true })
  assert.match(whole, /讲义《条件概率》/)
  assert.doesNotMatch(whole, /选段/)
  assert.match(whole, /摘录过长，已截断/)

  const note = formatQuestionBlock({
    kind: 'note-selection',
    spaceTitle: '概率论',
    title: '我的笔记',
    path: '笔记/我的笔记.md',
    version: 'b'.repeat(64),
    unsaved: true,
    excerpt: '我自己写的理解。',
    truncated: false,
  })
  assert.match(note, /笔记《我的笔记》.*未保存/)
  assert.match(note, /版本：未保存（基于磁盘版本 b{64}）/)
  assert.match(note, /^> 我自己写的理解。/m)
})

test('宿主没有版本或字段缺失时明确写未知，不把 undefined 当成版本号', () => {
  const without = formatQuestionBlock({ ...lecture, version: null })
  assert.match(without, /版本：未知（宿主未提供文件版本）/)

  const legacy = formatQuestionBlock({ ...lecture, version: undefined })
  assert.match(legacy, /版本：未知（宿主未提供文件版本）/)
  assert.doesNotMatch(legacy, /undefined/)

  const unsavedLegacy = formatQuestionBlock({
    kind: 'note-selection',
    spaceTitle: '概率论',
    title: '我的笔记',
    path: '笔记/我的笔记.md',
    version: undefined,
    unsaved: true,
    excerpt: '片段',
    truncated: false,
  })
  assert.match(unsavedLegacy, /版本：未保存（磁盘基础版本未知）/)
})

test('追加只接在原有草稿后面：不覆盖、不改动已有文字', () => {
  const block = formatQuestionBlock(lecture)
  const existing = '老师，我想先问一个别的问题。'
  const next = appendContextBlock(existing, block)
  assert.ok(next.startsWith(existing))
  assert.ok(next.endsWith(block))
  assert.equal(next, `${existing}\n\n${block}`)

  // An empty draft simply becomes the block: no leading blank lines.
  assert.equal(appendContextBlock('', block), block)
  // Whitespace is the learner's text, not an empty draft: it is never trimmed.
  assert.equal(appendContextBlock('   ', block), `   \n\n${block}`)
})

test('追加/移除只拥有块和它前面的分隔符：不 trim 学习者原草稿，不删块后的空行', () => {
  const block = formatQuestionBlock(lecture)

  // A learner draft that ends with blank lines gets them back byte-for-byte.
  const trailing = '原草稿\n\n'
  assert.equal(appendContextBlock(trailing, block), `${trailing}\n\n${block}`)
  assert.deepEqual(removeContextBlock(appendContextBlock(trailing, block), block), { status: 'removed', draft: trailing })

  // Whitespace-only input is learner text, so it survives the round trip.
  const spaces = '   '
  assert.deepEqual(removeContextBlock(appendContextBlock(spaces, block), block), { status: 'removed', draft: spaces })

  // The learner typed after the block: their blank lines are not ours to trim.
  assert.deepEqual(removeContextBlock(`${block}\n\n我的补充`, block), { status: 'removed', draft: '\n\n我的补充' })

  // Block between learner text: only the block and the separator we added leave.
  assert.deepEqual(removeContextBlock(`原草稿\n\n${block}\n\n我的补充`, block), {
    status: 'removed',
    draft: '原草稿\n\n我的补充',
  })
})

test('移除精确恢复原草稿；找不到或重复出现时拒绝而不是猜一个', () => {
  const block = formatQuestionBlock(lecture)
  const existing = '原有草稿'

  assert.deepEqual(removeContextBlock(appendContextBlock(existing, block), block), { status: 'removed', draft: existing })
  assert.deepEqual(removeContextBlock(appendContextBlock('', block), block), { status: 'removed', draft: '' })

  // Two identical blocks are ambiguous: removing one by position would be a guess.
  const twice = appendContextBlock(appendContextBlock(existing, block), block)
  assert.deepEqual(removeContextBlock(twice, block), { status: 'ambiguous' })

  assert.deepEqual(removeContextBlock(existing, block), { status: 'missing' })

  // Text the learner typed after the block survives, and other blocks are untouched.
  const other = formatQuestionBlock({ ...lecture, excerpt: '另一段摘录' })
  const both = appendContextBlock(appendContextBlock(existing, block), other)
  assert.deepEqual(removeContextBlock(both, block), { status: 'removed', draft: appendContextBlock(existing, other) })
})

test('每个块带自己的可见编号：同样的材料问两次也是两个可逐条移除的块', () => {
  const first = formatQuestionBlock(lecture, 'q1')
  const second = formatQuestionBlock(lecture, 'q2')
  assert.match(first, /编号：q1/)
  assert.match(second, /编号：q2/)
  assert.notEqual(first, second)
  // The unique token is visible in the block, so removal is by exact text and
  // never leaves two indistinguishable blocks.
  const draft = appendContextBlock(first, second)
  assert.deepEqual(removeContextBlock(draft, first), { status: 'removed', draft: `\n\n${second}` })
  assert.deepEqual(removeContextBlock(draft, second), { status: 'removed', draft: first })
})

test('摘录统一换行、去首尾空白，超长时截断并显式标记', () => {
  assert.deepEqual(excerptForQuestion('  第一行\r\n第二行  \n\n\n第三行  '), {
    text: '第一行\n第二行\n\n第三行',
    truncated: false,
  })
  assert.deepEqual(excerptForQuestion('   '), { text: '', truncated: false })

  const long = 'x'.repeat(questionExcerptLimit + 50)
  const bounded = excerptForQuestion(long)
  assert.equal(bounded.text.length, questionExcerptLimit)
  assert.equal(bounded.truncated, true)

  const custom = excerptForQuestion('abcdef', 3)
  assert.deepEqual(custom, { text: 'abc', truncated: true })
})
