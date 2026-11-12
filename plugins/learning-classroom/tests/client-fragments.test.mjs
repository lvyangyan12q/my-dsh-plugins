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
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
  this.setAttribute('data-scrolled', '1')
}

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const act = React.act ?? (await import('react-dom/test-utils')).act
const h = React.createElement
const { LectureZone } = await import('../src/lecture-zone.tsx')

const space = { id: 'space-1', title: '概率论', directory: '概率论', notePath: '笔记/我的笔记.md', createdAt: '2026-11-09T00:00:00.000Z' }
const lecture = {
  path: '讲义/01.md', fileName: '01.md', title: '第一节', order: null, kind: 'markdown',
  chapter: '', source: 'lectures', missing: false,
}
const doc = {
  spaceId: space.id,
  path: '讲义/01.md',
  fileName: '01.md',
  title: '第一节',
  kind: 'markdown',
  content: [
    '# 第一节',
    '',
    '## 目标小节',
    '',
    '正文。',
    '',
    '```',
    '结论 ^block-1',
    '```',
    '',
    '真实段落 ^block-1',
    '',
    '另一段',
    '',
    '^standalone-block',
    '',
    '- 列表真实项 ^list-block',
    '- 普通项',
    '- 真实项 ^multi-block',
  ].join('\n'),
  placeholder: null,
}

const client = {
  async listLectures(spaceId) {
    return { spaceId, lectures: [lecture], selectedPath: null, missingSelection: null, folderMissing: false }
  },
  async readLecture(spaceId, path) {
    assert.equal(path, '讲义/01.md')
    return structuredClone(doc)
  },
}

async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

test('打开讲义双链时按真实标题定位，不丢 fragment', async () => {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  try {
    const props = { client, space, spaces: [space], currentSpaceId: space.id, busy: false, onOpenSpace() {} }
    await act(async () => { root.render(h(LectureZone, props)) })
    await settle()
    await act(async () => {
      root.render(h(LectureZone, { ...props, openRequest: { path: '讲义/01.md', token: 1, heading: '目标小节' } }))
    })
    await settle()

    const heading = [...container.querySelectorAll('h3, h4, h5, h6')]
      .find(element => element.textContent.trim() === '目标小节')
    assert.ok(heading, '讲义应渲染真实标题')
    assert.equal(heading.getAttribute('data-scrolled'), '1')
  } finally {
    await act(async () => { root.unmount() })
  }
})

test('打开讲义块引用时定位到真实块，不误中前面代码里的同名 ^id', async () => {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  try {
    const props = { client, space, spaces: [space], currentSpaceId: space.id, busy: false, onOpenSpace() {} }
    await act(async () => { root.render(h(LectureZone, props)) })
    await settle()
    await act(async () => {
      root.render(h(LectureZone, { ...props, openRequest: { path: '讲义/01.md', token: 2, blockId: 'block-1' } }))
    })
    await settle()

    const block = container.querySelector('[data-block-id="block-1"]')
    assert.ok(block, '真实块应有块元数据')
    assert.equal(block.tagName.toLowerCase(), 'p')
    assert.equal(block.textContent.trim(), '真实段落')
    assert.equal(block.getAttribute('data-scrolled'), '1')

    const code = container.querySelector('pre code')
    assert.ok(code.textContent.includes('^block-1'))
    assert.equal(code.closest('[data-block-id]'), null)
    assert.equal(container.querySelector('pre').getAttribute('data-scrolled'), null)
  } finally {
    await act(async () => { root.unmount() })
  }
})

test('列表项里的真实块 id 渲染到对应 li 并可定位，不丢失为普通文本', async () => {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  try {
    const props = { client, space, spaces: [space], currentSpaceId: space.id, busy: false, onOpenSpace() {} }
    await act(async () => { root.render(h(LectureZone, props)) })
    await settle()
    await act(async () => {
      root.render(h(LectureZone, { ...props, openRequest: { path: '讲义/01.md', token: 4, blockId: 'list-block' } }))
    })
    await settle()

    const item = container.querySelector('li[data-block-id="list-block"]')
    assert.ok(item, '列表项应带自己的块元数据')
    assert.equal(item.textContent.trim(), '列表真实项')
    assert.equal(item.getAttribute('data-scrolled'), '1')
    assert.equal(container.querySelector('ul').getAttribute('data-block-id'), null)
  } finally {
    await act(async () => { root.unmount() })
  }
})

test('独立一行 ^id 定位到它所属的真实块，而不是冒出的段落', async () => {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  try {
    const props = { client, space, spaces: [space], currentSpaceId: space.id, busy: false, onOpenSpace() {} }
    await act(async () => { root.render(h(LectureZone, props)) })
    await settle()
    await act(async () => {
      root.render(h(LectureZone, { ...props, openRequest: { path: '讲义/01.md', token: 3, blockId: 'standalone-block' } }))
    })
    await settle()

    const block = container.querySelector('[data-block-id="standalone-block"]')
    assert.ok(block, '独立 ^id 应归属前一个真实块')
    assert.equal(block.textContent.trim(), '另一段')
    assert.equal(block.getAttribute('data-scrolled'), '1')
  } finally {
    await act(async () => { root.unmount() })
  }
})

test('多列表项时只给带块 id 的那一项加元数据并准确定位', async () => {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  try {
    const props = { client, space, spaces: [space], currentSpaceId: space.id, busy: false, onOpenSpace() {} }
    await act(async () => { root.render(h(LectureZone, props)) })
    await settle()
    await act(async () => {
      root.render(h(LectureZone, { ...props, openRequest: { path: '讲义/01.md', token: 5, blockId: 'multi-block' } }))
    })
    await settle()

    const target = container.querySelector('li[data-block-id="multi-block"]')
    assert.ok(target, '带块 id 的列表项应有自己的元数据')
    assert.equal(target.textContent.trim(), '真实项')
    assert.equal(target.getAttribute('data-scrolled'), '1')
    const plain = [...container.querySelectorAll('li')].find(item => item.textContent.trim() === '普通项')
    assert.equal(plain.hasAttribute('data-block-id'), false)
    // 列表项块 id 不能绑到整个 ul 上。
    assert.equal(container.querySelector('ul').getAttribute('data-block-id'), null)
  } finally {
    await act(async () => { root.unmount() })
  }
})
