import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: dom.window })
Object.defineProperty(globalThis, 'document', { configurable: true, writable: true, value: dom.window.document })
Object.defineProperty(globalThis, 'Node', { configurable: true, writable: true, value: dom.window.Node })

const { lectureSelection } = await import('../src/annotation-selection.ts')

function article() {
  const host = document.createElement('div')
  host.innerHTML = [
    '<div id="outside">老师对话与笔记，不属于讲义</div>',
    '<article id="body">',
    '  <h3>第一节 样本空间</h3>',
    '  <p id="p1">第一段原文。</p>',
    '  <h4>小标题</h4>',
    '  <p id="p2">第二段选中的原文。</p>',
    '</article>',
    '<div id="notes">笔记区隐私内容</div>',
  ].join('')
  document.body.appendChild(host)
  return host
}

function select(startNode, startOffset, endNode, endOffset) {
  const range = document.createRange()
  range.setStart(startNode, startOffset)
  range.setEnd(endNode, endOffset)
  const selection = window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

test('只接受完全落在讲义正文内的选区，并给出最近的真实标题', () => {
  const host = article()
  const body = host.querySelector('#body')
  const text = host.querySelector('#p2').firstChild
  select(text, 0, text, 7)

  assert.deepEqual(lectureSelection(body), { text: '第二段选中的原', heading: '小标题' })

  const p1 = host.querySelector('#p1').firstChild
  select(p1, 0, p1, 3)
  assert.deepEqual(lectureSelection(body), { text: '第一段', heading: '第一节 样本空间' })

  host.remove()
})

test('跨出讲义的选区一律拒绝，防止把笔记或老师内容当讲义摘录', () => {
  const host = article()
  const body = host.querySelector('#body')
  const lectureText = host.querySelector('#p2').firstChild
  const notesText = host.querySelector('#notes').firstChild

  // 从讲义拖到笔记区：起点在讲义、终点在外。
  select(lectureText, 0, notesText, 2)
  assert.equal(lectureSelection(body), null)

  // 反向选择：起点在外、终点在讲义。
  select(notesText, 2, lectureText, 0)
  assert.equal(lectureSelection(body), null)

  // 整个选区都在讲义外。
  select(notesText, 0, notesText, 2)
  assert.equal(lectureSelection(body), null)

  host.remove()
})

test('折叠选区、空文本与空根都不产生摘录', () => {
  const host = article()
  const body = host.querySelector('#body')
  const text = host.querySelector('#p2').firstChild
  const selection = window.getSelection()
  selection.removeAllRanges()
  const range = document.createRange()
  range.setStart(text, 2)
  range.collapse(true)
  selection.addRange(range)
  assert.equal(lectureSelection(body), null)

  select(text, 0, text, 0)
  assert.equal(lectureSelection(body), null)

  select(text, 0, text, 3)
  assert.notEqual(lectureSelection(body), null)
  assert.equal(lectureSelection(null), null)

  host.remove()
})

test('没有标题时返回 null，不伪造标题锚点', () => {
  const host = document.createElement('div')
  host.innerHTML = '<article id="body"><p id="only">没有标题的讲义。</p></article>'
  document.body.appendChild(host)
  const body = host.querySelector('#body')
  const text = host.querySelector('#only').firstChild
  select(text, 0, text, 3)
  assert.deepEqual(lectureSelection(body), { text: '没有标', heading: null })
  host.remove()
})
