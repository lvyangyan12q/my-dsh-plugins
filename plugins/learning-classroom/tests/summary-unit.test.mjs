import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composeSummary, parseSummary, summaryFileName } from '../src/summary.ts'

const none = { summary: '', nextStep: '', extra: '' }

test('学习小结与下一步写成可读的普通 Markdown，并能读回同一内容', () => {
  const markdown = composeSummary({ summary: '理解了条件概率的定义。', nextStep: '做三道条件概率练习。' })
  assert.match(markdown, /^# 学习小结/m)
  assert.match(markdown, /^## 本次小结$/m)
  assert.match(markdown, /^## 下一步$/m)
  assert.deepEqual(parseSummary(markdown), {
    summary: '理解了条件概率的定义。',
    nextStep: '做三道条件概率练习。',
    extra: '',
  })
  assert.equal(summaryFileName, '学习小结.md')
})

test('只写下一步或只写小结都保留，空小节读回空串', () => {
  const onlyNext = composeSummary({ summary: '', nextStep: '明天复习贝叶斯公式。' })
  assert.deepEqual(parseSummary(onlyNext), { ...none, nextStep: '明天复习贝叶斯公式。' })
  const onlySummary = composeSummary({ summary: '今天只读了一节。', nextStep: '' })
  assert.deepEqual(parseSummary(onlySummary), { ...none, summary: '今天只读了一节。' })
  const empty = composeSummary({ summary: '', nextStep: '' })
  assert.deepEqual(parseSummary(empty), none)
})

test('在 Obsidian 里手写的文件没有小节标题时整体作为小结，不丢内容', () => {
  const handWritten = '# 我的记录\n\n今天把条件概率重新推了一遍。\n\n下一步想做题。\n'
  assert.deepEqual(parseSummary(handWritten), {
    summary: '# 我的记录\n\n今天把条件概率重新推了一遍。\n\n下一步想做题。',
    nextStep: '',
    extra: '',
  })
})

test('手写旧文件里的其他标题与后文原样保留，不被当成小节边界截断', () => {
  const handEdited = [
    '# 学习小结',
    '',
    '## 本次小结',
    '看完了第一章。',
    '',
    '## 我自己的小节',
    '',
    '这一节是用户写的，不能丢。',
    '',
    '## 下一步',
    '做练习 1-3。',
    '',
    '## 备注',
    '',
    '这也是用户写的后文。',
    '',
  ].join('\n')
  assert.deepEqual(parseSummary(handEdited), {
    summary: '看完了第一章。\n\n## 我自己的小节\n\n这一节是用户写的，不能丢。',
    nextStep: '做练习 1-3。\n\n## 备注\n\n这也是用户写的后文。',
    extra: '',
  })
})

test('任意 Markdown 标题与代码块原样 roundtrip，不会被当成小节边界', () => {
  const summary = '先复习定义。\n\n## 我自己的小节\n\n这里有 **重点**。\n\n### 更深的标题\n\n- 列表一\n- 列表二\n\n```js\nconst x = 1\n```\n\n最后一行。'
  const nextStep = '## 我的计划\n\n1. 做练习\n2. 复盘'
  const markdown = composeSummary({ summary, nextStep })
  assert.deepEqual(parseSummary(markdown), { summary, nextStep, extra: '' })
})

test('正文里出现与章节同名的标题也原样保留，不被截断', () => {
  const summary = '开头。\n\n## 本次小结\n\n这是用户自己写的一个同名标题，不是结构分隔。\n\n结尾。'
  const nextStep = '下一步正文。\n\n## 下一步\n\n用户自己写的另一个同名标题。'
  assert.deepEqual(parseSummary(composeSummary({ summary, nextStep })), { summary, nextStep, extra: '' })
})

test('小节编码使用成对标记，手写文件缺少标记时仍按旧标题规则读取', () => {
  const markdown = composeSummary({ summary: '有标记的小结。', nextStep: '有标记的下一步。' })
  assert.match(markdown, /<!-- learning-classroom:summary:/)
  assert.match(markdown, /<!-- \/learning-classroom:summary:/)
  assert.match(markdown, /<!-- learning-classroom:next:/)
  assert.match(markdown, /<!-- \/learning-classroom:next:/)
  assert.deepEqual(
    parseSummary('# 学习小结\n\n## 本次小结\n\n旧文件。\n\n## 下一步\n\n旧下一步。\n'),
    { summary: '旧文件。', nextStep: '旧下一步。', extra: '' },
  )
})

test('标记外被追加的文字作为额外内容原样保留，下一次组合仍写回', () => {
  const base = composeSummary({ summary: '我的小结。', nextStep: '我的下一步。' })
  const withAppendix = `${base}\n## 我后来加的\n\n这段不是插件写的，不能丢。\n`
  const parsed = parseSummary(withAppendix)
  assert.equal(parsed.summary, '我的小结。')
  assert.equal(parsed.nextStep, '我的下一步。')
  assert.match(parsed.extra, /## 我后来加的/)
  assert.match(parsed.extra, /这段不是插件写的，不能丢。/)

  const rewritten = composeSummary({ summary: '新的小结。', nextStep: '新的下一步。', extra: parsed.extra })
  const reparsed = parseSummary(rewritten)
  assert.equal(reparsed.summary, '新的小结。')
  assert.equal(reparsed.nextStep, '新的下一步。')
  assert.match(reparsed.extra, /## 我后来加的/)
  assert.match(reparsed.extra, /这段不是插件写的，不能丢。/)
})

test('标记前的额外文字同样保留，不会因为分节读取被丢掉', () => {
  const base = composeSummary({ summary: '正文。', nextStep: '' })
  const prefixed = `> 我在文件开头写的说明\n\n${base}`
  const parsed = parseSummary(prefixed)
  assert.equal(parsed.summary, '正文。')
  assert.match(parsed.extra, /我在文件开头写的说明/)
})

test('用户在标记外追加与章节同名的标题时，后出现的那个标题也保留', () => {
  const base = composeSummary({ summary: '正文。', nextStep: '' })
  const appended = `${base}\n## 本次小结\n\n用户自己追加的同名小节。\n`
  const parsed = parseSummary(appended)
  assert.equal(parsed.summary, '正文。')
  assert.match(parsed.extra, /## 本次小结/)
  assert.match(parsed.extra, /用户自己追加的同名小节。/)
  const reparsed = parseSummary(composeSummary({ summary: '新正文。', nextStep: '', extra: parsed.extra }))
  assert.match(reparsed.extra, /用户自己追加的同名小节。/)
})
