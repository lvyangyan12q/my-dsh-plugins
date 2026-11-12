import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
const globals = {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}
for (const [key, value] of Object.entries(globals)) {
  try { Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) } catch { /* Node may own navigator. */ }
}

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const act = React.act ?? (await import('react-dom/test-utils')).act
const h = React.createElement
const { AnnotationAction } = await import('../src/annotation-action.tsx')

const doc = {
  spaceId: 'space-1',
  path: '讲义/第一章/01.md',
  fileName: '01.md',
  title: '第一节 缩小样本空间',
  kind: 'markdown',
  content: '# 第一节\n\n原文。',
  placeholder: null,
}

async function settle(rounds = 4) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

async function mount(handler) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  const calls = []
  await act(async () => {
    root.render(h(AnnotationAction, {
      doc,
      onAnnotate: async request => {
        calls.push(request)
        return handler === undefined ? { ok: true, message: '已追加到当前笔记末尾，正在保存。' } : handler(request)
      },
    }, h('h3', null, '第一节'), h('p', { id: 'body-text' }, '样本空间可以缩小。')))
  })
  await settle()
  return {
    container,
    calls,
    button: () => [...container.querySelectorAll('button')].find(button => button.textContent.includes('追加到笔记')),
    text: () => container.textContent,
    async click() {
      const button = [...container.querySelectorAll('button')].find(row => row.textContent.includes('追加到笔记'))
      assert.ok(button, '找不到追加批注按钮')
      await act(async () => { button.click() })
      await settle()
    },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

function select(node, start, end) {
  const range = dom.window.document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = dom.window.getSelection()
  selection.removeAllRanges()
  selection.addRange(range)
}

test('选中讲义原文后追加批注，携带真实标题与摘录给上层', async () => {
  const ui = await mount()
  try {
    const text = ui.container.querySelector('#body-text').firstChild
    select(text, 0, text.textContent.length)
    await ui.click()

    assert.equal(ui.calls.length, 1)
    assert.deepEqual(ui.calls[0], {
      path: '讲义/第一章/01.md',
      title: '第一节 缩小样本空间',
      excerpt: '样本空间可以缩小。',
      truncated: false,
      heading: '第一节',
    })
    assert.match(ui.text(), /已追加到当前笔记末尾/)
  } finally {
    await ui.unmount()
  }
})

test('没有选区时不追加，也不会把整篇讲义写进笔记', async () => {
  const ui = await mount()
  try {
    await ui.click()
    assert.equal(ui.calls.length, 0)
    assert.match(ui.text(), /选中/)
  } finally {
    await ui.unmount()
  }
})

test('跨界选区被拒绝，不会把讲义外文字当摘录', async () => {
  const ui = await mount()
  try {
    const outside = dom.window.document.createElement('p')
    outside.id = 'outside'
    outside.textContent = '笔记区隐私'
    ui.container.appendChild(outside)
    const lectureText = ui.container.querySelector('#body-text').firstChild
    const outsideText = outside.firstChild
    const range = dom.window.document.createRange()
    range.setStart(lectureText, 0)
    range.setEnd(outsideText, 2)
    const selection = dom.window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    await ui.click()
    assert.equal(ui.calls.length, 0)
    assert.match(ui.text(), /选中/)
  } finally {
    await ui.unmount()
  }
})

test('上层拒绝时显示真实原因，不伪装成功', async () => {
  const ui = await mount(() => ({ ok: false, message: '笔记有未解决的保存冲突，批注没有追加。' }))
  try {
    const text = ui.container.querySelector('#body-text').firstChild
    select(text, 0, 5)
    await ui.click()
    assert.match(ui.text(), /保存冲突/)
  } finally {
    await ui.unmount()
  }
})
