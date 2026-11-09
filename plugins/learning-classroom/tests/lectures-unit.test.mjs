import assert from 'node:assert/strict'
import { test } from 'node:test'

/**
 * Pure lecture-directory logic: the course directory is derived from file names
 * and frontmatter, never from a separate manifest.
 */
const { compareLectures, lectureFileKind, parseFrontmatter, readLectureMeta, sortLectures } = await import('../src/lectures.ts')

test('frontmatter 解析出 title 与 order，并从正文中剥离', () => {
  const source = '---\ntitle: 缩小样本空间\norder: 2\n---\n\n# 第一节\n\n正文。\n'
  const parsed = parseFrontmatter(source)
  assert.equal(parsed.present, true)
  assert.equal(parsed.attributes.title, '缩小样本空间')
  assert.equal(parsed.attributes.order, '2')
  assert.equal(parsed.body, '\n# 第一节\n\n正文。\n')
})

test('frontmatter 支持引号值，缺少结束分隔符时不吞正文', () => {
  const quoted = parseFrontmatter('---\ntitle: "概率: 入门"\n---\n内容')
  assert.equal(quoted.attributes.title, '概率: 入门')
  assert.equal(quoted.body, '内容')

  const unterminated = '---\ntitle: 未闭合\n\n# 正文\n'
  const parsed = parseFrontmatter(unterminated)
  assert.equal(parsed.present, false)
  assert.equal(parsed.body, unterminated)
  assert.deepEqual(parsed.attributes, {})
})

test('讲义文件名决定类型与默认标题，未知扩展名不进目录', () => {
  assert.equal(lectureFileKind('01-缩小样本空间.md'), 'markdown')
  assert.equal(lectureFileKind('02-实验.HTML'), 'experiment')
  assert.equal(lectureFileKind('README.txt'), null)
  assert.equal(lectureFileKind('notes.markdown'), null)

  const markdown = readLectureMeta('01-缩小样本空间.md', '---\ntitle: 自定义\ntext\n---\nbody')
  assert.equal(markdown.title, '自定义')
  assert.equal(markdown.order, null)

  const fallback = readLectureMeta('02-先验.md', '# 无 frontmatter')
  assert.equal(fallback.title, '02-先验')
  assert.equal(fallback.order, null)

  const html = readLectureMeta('03-实验.html', '---\norder: 3\n---\n<!doctype html>')
  assert.equal(html.title, '03-实验')
  assert.equal(html.order, 3)
  assert.equal(readLectureMeta('忽略.txt', ''), null)
})

test('排序由 order 覆盖，未声明 order 的按文件名排在后面', () => {
  const unordered = { fileName: '01-先讲的.md', order: null }
  const late = { fileName: '02-后讲的.md', order: 20 }
  const early = { fileName: '03-最先.md', order: 1 }
  assert.deepEqual(sortLectures([unordered, late, early]).map(row => row.fileName), ['03-最先.md', '02-后讲的.md', '01-先讲的.md'])
  assert.deepEqual(sortLectures([unordered, { fileName: '02-并列.md', order: null }]).map(row => row.fileName), ['01-先讲的.md', '02-并列.md'])
  assert.ok(compareLectures(early, late) < 0)
})
