import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeSummary, parseSummary, summaryFileName } from '../src/summary.ts'

test('学习小结与下一步写成可读的普通 Markdown，并能读回同一内容', () => {
  const markdown = composeSummary({ summary: '理解了条件概率的定义。', nextStep: '做三道条件概率练习。' })
  assert.match(markdown, /^# 学习小结/m)
  assert.match(markdown, /^## 本次小结$/m)
  assert.match(markdown, /^## 下一步$/m)
  assert.deepEqual(parseSummary(markdown), {
    summary: '理解了条件概率的定义。',
    nextStep: '做三道条件概率练习。',
  })
  assert.equal(summaryFileName, '学习小结.md')
})

test('只写下一步或只写小结都保留，空小节读回空串', () => {
  const onlyNext = composeSummary({ summary: '', nextStep: '明天复习贝叶斯公式。' })
  assert.deepEqual(parseSummary(onlyNext), { summary: '', nextStep: '明天复习贝叶斯公式。' })
  const onlySummary = composeSummary({ summary: '今天只读了一节。', nextStep: '' })
  assert.deepEqual(parseSummary(onlySummary), { summary: '今天只读了一节。', nextStep: '' })
  const empty = composeSummary({ summary: '', nextStep: '' })
  assert.deepEqual(parseSummary(empty), { summary: '', nextStep: '' })
})

test('在 Obsidian 里手写的文件没有小节标题时整体作为小结，不丢内容', () => {
  const handWritten = '# 我的记录\n\n今天把条件概率重新推了一遍。\n\n下一步想做题。\n'
  assert.deepEqual(parseSummary(handWritten), {
    summary: '# 我的记录\n\n今天把条件概率重新推了一遍。\n\n下一步想做题。',
    nextStep: '',
  })
})

test('小节标题后的内容按标题边界截断，不会把小节后面的文字吞进上一节', () => {
  const handEdited = [
    '# 学习小结',
    '',
    '## 本次小结',
    '看完了第一章。',
    '',
    '## 下一步',
    '做练习 1-3。',
    '',
    '## 备注',
    '这是用户自己加的，不进入小结或下一步。',
    '',
  ].join('\n')
  assert.deepEqual(parseSummary(handEdited), { summary: '看完了第一章。', nextStep: '做练习 1-3。' })
})

test('任意 Markdown 标题与代码块原样 roundtrip，不会被当成小节边界', () => {
  const summary = '先复习定义。\n\n## 我自己的小节\n\n这里有 **重点**。\n\n### 更深的标题\n\n- 列表一\n- 列表二\n\n```js\nconst x = 1\n```\n\n最后一行。'
  const nextStep = '## 我的计划\n\n1. 做练习\n2. 复盘'
  const markdown = composeSummary({ summary, nextStep })
  assert.deepEqual(parseSummary(markdown), { summary, nextStep })
})

test('正文里出现与章节同名的标题也原样保留，不被截断', () => {
  const summary = '开头。\n\n## 本次小结\n\n这是用户自己写的一个同名标题，不是结构分隔。\n\n结尾。'
  const nextStep = '下一步正文。\n\n## 下一步\n\n用户自己写的另一个同名标题。'
  assert.deepEqual(parseSummary(composeSummary({ summary, nextStep })), { summary, nextStep })
})

test('小节编码使用成对标记，手写文件缺少标记时仍按旧标题规则读取', () => {
  const markdown = composeSummary({ summary: '有标记的小结。', nextStep: '有标记的下一步。' })
  assert.match(markdown, /<!-- learning-classroom:summary:/)
  assert.match(markdown, /<!-- \/learning-classroom:summary:/)
  assert.match(markdown, /<!-- learning-classroom:next:/)
  assert.match(markdown, /<!-- \/learning-classroom:next:/)
  // Legacy file without our markers still reads by the known section headings.
  assert.deepEqual(
    parseSummary('# 学习小结\n\n## 本次小结\n\n旧文件。\n\n## 下一步\n\n旧下一步。\n'),
    { summary: '旧文件。', nextStep: '旧下一步。' },
  )
})

