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
  content: ['# 第一节', '', '## 目标小节', '', '正文。', '', '结论 ^block-1', ''].join('\n'),
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

test('打开讲义块引用时定位到含真实 ^块id 的段落', async () => {
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

    const paragraph = [...container.querySelectorAll('p')]
      .find(element => element.textContent.trimEnd().endsWith('^block-1'))
    assert.ok(paragraph, '讲义应渲染含块 id 的段落')
    assert.equal(paragraph.getAttribute('data-scrolled'), '1')
  } finally {
    await act(async () => { root.unmount() })
  }
})
