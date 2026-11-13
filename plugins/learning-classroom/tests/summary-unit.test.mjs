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
