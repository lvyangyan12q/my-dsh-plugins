import assert from 'node:assert/strict'
import { test } from 'node:test'

const {
  composeLecture,
  lectureDraftSchema,
  lectureRelativePath,
} = await import('../src/teacher-content.ts')

const sources = ['《概率论》第 2 章', 'https://example.org/probability']

test('生成文件名只接受讲义目录内的 .md/.html，并拒绝越界、隐藏与非讲义扩展名', () => {
  assert.equal(lectureRelativePath('第一章/02-条件概率.md'), '讲义/第一章/02-条件概率.md')
  assert.equal(lectureRelativePath('讲义\\第二章\\03-实验.html'), '讲义/第二章/03-实验.html')
  assert.equal(lectureRelativePath('概览.md'), '讲义/概览.md')

  for (const bad of [
    '../其他主题/讲义/01.md',
    '第一章/../../01.md',
    '/绝对/01.md',
    'C:\\讲义\\01.md',
    '.隐藏/01.md',
    '第一章/.临时.md',
    '01.txt',
    '第一章/',
    '',
  ]) {
    assert.throws(() => lectureRelativePath(bad), /讲义|路径|扩展|文件名|隐藏|支持/, `${bad} 应被拒绝`)
  }
})

test('讲义草稿要求标题、解释正文与来源；组合文件保留 frontmatter、来源节和可读代码', () => {
  const draft = lectureDraftSchema.parse({
    fileName: '第一章/02-条件概率.md',
    title: '条件概率',
    order: 2,
    body: '条件概率的定义：\n\n```\nP(A|B) = P(A∩B) / P(B)\n```\n\n它是把样本空间缩小到 B 后的概率。',
    sources,
  })
  const markdown = composeLecture(draft)
  assert.match(markdown, /^---\ntitle: "条件概率"\norder: 2\ngenerated: teacher\n---\n/)
  assert.match(markdown, /^# 条件概率$/m)
  assert.match(markdown, /P\(A\|B\) = P\(A∩B\) \/ P\(B\)/)
  assert.match(markdown, /^## 来源$/m)
  assert.match(markdown, /- 《概率论》第 2 章/)
  assert.match(markdown, /- https:\/\/example\.org\/probability/)

  for (const bad of [
    { ...draft, body: '   ' },
    { ...draft, sources: [] },
    { ...draft, title: '条件\n概率' },
    { ...draft, sources: ['有\n换行'] },
  ]) {
    assert.equal(lectureDraftSchema.safeParse(bad).success, false)
  }
})
