import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })

class FakeResizeObserver {
  static instances = []
  constructor(callback) {
    this.callback = callback
    FakeResizeObserver.instances.push(this)
  }
  observe(element) { this.element = element }
  unobserve() {}
  disconnect() { this.disconnected = true }
}

const globals = {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  HTMLSelectElement: dom.window.HTMLSelectElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
  KeyboardEvent: dom.window.KeyboardEvent,
  navigator: dom.window.navigator,
  ResizeObserver: FakeResizeObserver,
  IS_REACT_ACT_ENVIRONMENT: true,
}
for (const [key, value] of Object.entries(globals)) {
  try { Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) } catch { /* Node may own navigator. */ }
}

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const act = React.act ?? (await import('react-dom/test-utils')).act
const h = React.createElement
const { ClassroomPanel } = await import('../src/classroom-panel.tsx')
const { defaultLayout } = await import('../src/layout.ts')

const first = { id: 'space-1', title: '线性代数', directory: '线性代数', notePath: '笔记/我的笔记.md', createdAt: '2026-11-09T00:00:00.000Z', lecturePath: null, layout: defaultLayout() }
const second = { id: 'space-2', title: '概率论', directory: '概率论', notePath: '笔记/我的笔记.md', createdAt: '2026-11-10T00:00:00.000Z', lecturePath: null, layout: structuredClone(defaultLayout()) }
second.layout.collapsed.notes = true

function fakeClient() {
  const calls = []
  let view = {
    vault: { path: 'D:/知识库', status: 'ready', reason: null, hint: '' },
    spaces: [structuredClone(first), structuredClone(second)],
    currentSpaceId: first.id,
  }
  const withLayout = (spaceId, layout) => {
    view = {
      ...view,
      spaces: view.spaces.map(row => (row.id === spaceId ? { ...row, layout: structuredClone(layout) } : row)),
    }
    return structuredClone(view)
  }
  return {
    calls,
    async load() { return structuredClone(view) },
    async command(input) {
      calls.push(input)
      if (input.action === 'space-open') view = { ...view, currentSpaceId: input.spaceId }
      return structuredClone(view)
    },
    async listLectures(spaceId) {
      return { spaceId, lectures: [], selectedPath: null, missingSelection: null, folderMissing: false }
    },
    async readLecture(_spaceId, path) { throw new Error(`还没有讲义文件：${path}`) },
    async listNotes() {
      return { notes: [{ path: '笔记/我的笔记.md', name: '我的笔记.md' }], defaultPath: '笔记/我的笔记.md' }
    },
    async readNote(_spaceId, path) {
      return { path, content: '# 我的笔记\n', version: 'version-1', updatedAt: '2026-11-09T00:00:00.000Z' }
    },
    async saveNote(input) {
      calls.push({ action: 'note-save', path: input.path })
      return { path: input.path, version: 'version-2', savedAt: '2026-11-09T00:01:00.000Z' }
    },
    async saveLayout(input) {
      calls.push(input)
      return withLayout(input.spaceId, input.layout)
    },
  }
}

async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

function buttonByLabel(document, label) {
  return document.querySelector(`button[aria-label="${label}"]`)
}

async function mount(client) {
  FakeResizeObserver.instances = []
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(h(ClassroomPanel, { client })) })
  await settle()
  const document = dom.window.document
  const layout = () => client.calls.filter(call => call.action === 'layout-save').at(-1)
  const zone = label => document.querySelector(`[aria-label="${label}"]`)
  const visible = label => {
    const element = zone(label)
    return element !== null && dom.window.getComputedStyle(element).display !== 'none'
  }
  return {
    document,
    client,
    layout,
    zone,
    visible,
    text: () => container.textContent,
    async click(element) {
      assert.ok(element, '要点击的元素应存在')
      await act(async () => { element.click() })
      await settle()
    },
    async press(element, key, options = {}) {
      await act(async () => {
        element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options }))
      })
      await settle()
    },
    async drag(separator, from, to) {
      await act(async () => {
        separator.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: from, button: 0 }))
        document.dispatchEvent(new dom.window.MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: to }))
        document.dispatchEvent(new dom.window.MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX: to }))
      })
      await settle()
    },
    async resizeContainer(width) {
      await act(async () => {
        for (const instance of FakeResizeObserver.instances) {
          instance.callback([{ target: instance.element, contentRect: { width } }], instance)
        }
      })
      await settle()
    },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

function separators(document) {
  return [...document.querySelectorAll('[role="separator"]')]
}

test('收起三栏各自有明确恢复入口，收起与恢复只保存布局，不重复读取讲义或笔记', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    for (const label of ['课程目录', '我的笔记', '老师对话']) {
      assert.ok(ui.visible(label), `${label} 初始可见`)
      assert.ok(buttonByLabel(ui.document, `收起${label}`), `${label} 有收起入口`)
    }
    assert.equal(buttonByLabel(ui.document, '收起讲义'), null, '讲义不可收起')

    const before = client.calls.length
    await ui.click(buttonByLabel(ui.document, '收起我的笔记'))
    assert.equal(ui.visible('我的笔记'), false)
    assert.ok(buttonByLabel(ui.document, '显示我的笔记'), '收起后有带无障碍名称的恢复入口')
    assert.equal(client.calls.length, before + 1, '收起只写一次布局，不触发讲义/笔记/会话请求')
    assert.deepEqual(ui.layout(), {
      action: 'layout-save',
      spaceId: first.id,
      layout: { ...defaultLayout(), collapsed: { directory: false, notes: true, conversation: false } },
    })

    const editor = ui.document.querySelector('[aria-label="笔记编辑器"]')
    const conversationZone = ui.zone('老师对话')
    await ui.click(buttonByLabel(ui.document, '显示我的笔记'))
    assert.equal(ui.visible('我的笔记'), true)
    assert.equal(ui.document.querySelector('[aria-label="笔记编辑器"]'), editor, '收起不卸载笔记区，编辑状态保留')
    assert.deepEqual(ui.layout(), { action: 'layout-save', spaceId: first.id, layout: defaultLayout() })

    await ui.click(buttonByLabel(ui.document, '收起课程目录'))
    assert.equal(ui.visible('课程目录'), false)
    assert.ok(buttonByLabel(ui.document, '显示课程目录'))
    await ui.click(buttonByLabel(ui.document, '收起老师对话'))
    assert.equal(ui.visible('老师对话'), false)
    assert.ok(buttonByLabel(ui.document, '显示老师对话'))
    assert.equal(ui.zone('老师对话'), conversationZone, '对话区收起不卸载，会话不被布局打断')
    assert.deepEqual(ui.layout().layout.collapsed, { directory: true, notes: false, conversation: true })
  } finally {
    await ui.unmount()
  }
})

test('拖动分隔条改变相邻栏宽度，松手后按空间保存布局载荷', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const before = client.calls.length
    const [directoryEdge] = separators(ui.document)
    assert.equal(directoryEdge.getAttribute('aria-orientation'), 'vertical')
    assert.equal(Number(directoryEdge.getAttribute('aria-valuenow')), 200)
    await ui.drag(directoryEdge, 200, 260)
    assert.equal(Number(directoryEdge.getAttribute('aria-valuenow')), 260)
    assert.deepEqual(ui.layout(), {
      action: 'layout-save',
      spaceId: first.id,
      layout: {
        widths: { directory: 260, notes: 220, conversation: 240 },
        collapsed: { directory: false, notes: false, conversation: false },
      },
    })
    assert.equal(client.calls.length, before + 1, '拖动结束只写一次布局')

    // 拖到超出上限时夹在边界内。
    await ui.drag(directoryEdge, 200, 2000)
    assert.equal(Number(directoryEdge.getAttribute('aria-valuenow')), 360)
    assert.equal(ui.layout().layout.widths.directory, 360)
  } finally {
    await ui.unmount()
  }
})

test('分隔条支持方向键与 Shift 加速调整宽度，并带 aria 角色与数值', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const [directoryEdge, notesEdge] = separators(ui.document)
    assert.equal(directoryEdge.getAttribute('role'), 'separator')
    assert.equal(Number(directoryEdge.getAttribute('aria-valuemin')), 140)
    assert.equal(Number(directoryEdge.getAttribute('aria-valuemax')), 360)

    await ui.press(directoryEdge, 'ArrowRight')
    assert.equal(Number(directoryEdge.getAttribute('aria-valuenow')), 216)
    assert.equal(ui.layout().layout.widths.directory, 216)

    await ui.press(directoryEdge, 'ArrowRight', { shiftKey: true })
    assert.equal(Number(directoryEdge.getAttribute('aria-valuenow')), 264)

    // 讲义与笔记之间的分隔条：左移让笔记变宽。
    assert.equal(Number(notesEdge.getAttribute('aria-valuenow')), 220)
    await ui.press(notesEdge, 'ArrowLeft')
    assert.equal(Number(notesEdge.getAttribute('aria-valuenow')), 236)
    assert.deepEqual(ui.layout().layout.widths, { directory: 264, notes: 236, conversation: 240 })

    // 收起笔记后，讲义与对话直接相邻，方向键仍可调整。
    await ui.click(buttonByLabel(ui.document, '收起我的笔记'))
    const conversationEdge = separators(ui.document).find(separator => separator.getAttribute('aria-label') === '调整讲义与老师对话宽度')
    assert.ok(conversationEdge, '收起笔记后出现讲义与对话的分隔条')
    await ui.press(conversationEdge, 'ArrowLeft')
    assert.equal(ui.layout().layout.widths.conversation, 256)
  } finally {
    await ui.unmount()
  }
})

test('窄容器一次只显示一个区并默认讲义，切换分区不写布局、不卸载其他区', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const editor = ui.document.querySelector('[aria-label="笔记编辑器"]')
    const before = client.calls.length
    await ui.resizeContainer(720)

    assert.equal(ui.visible('讲义'), true, '窄屏默认显示讲义')
    for (const label of ['课程目录', '我的笔记', '老师对话']) assert.equal(ui.visible(label), false, `${label} 初始隐藏`)
    assert.equal(separators(ui.document).length, 0, '窄屏不渲染分隔条')
    assert.equal(buttonByLabel(ui.document, '收起我的笔记'), null, '窄屏用分区切换而不是收起')

    const tabs = [...ui.document.querySelectorAll('[role="toolbar"] button[aria-pressed]')]
    assert.deepEqual(tabs.map(tab => tab.textContent), ['课程目录', '讲义', '我的笔记', '老师对话'])
    assert.equal(tabs.find(tab => tab.getAttribute('aria-pressed') === 'true').textContent, '讲义')

    await ui.click(tabs.find(tab => tab.textContent === '我的笔记'))
    assert.equal(ui.visible('我的笔记'), true)
    assert.equal(ui.visible('讲义'), false)
    assert.equal(ui.document.querySelector('[aria-label="笔记编辑器"]'), editor, '切换分区不卸载笔记区')
    assert.equal(client.calls.length, before, '切换分区是临时视图状态，不写布局')

    await ui.click(tabs.find(tab => tab.textContent === '课程目录'))
    assert.equal(ui.visible('课程目录'), true)
    assert.equal(ui.visible('我的笔记'), false)

    // 恢复到宽容器后按保存的布局显示，且默认窄屏入口仍是讲义。
    await ui.resizeContainer(1200)
    assert.equal(ui.visible('讲义'), true)
    assert.equal(ui.visible('课程目录'), true)
    assert.equal(ui.visible('我的笔记'), true)
    assert.equal(separators(ui.document).length, 3)
    await ui.resizeContainer(500)
    assert.equal(ui.visible('讲义'), true, '再次变窄时回到讲义')
  } finally {
    await ui.unmount()
  }
})

test('布局按学习空间读取与保存，切换空间后互不影响', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.click(buttonByLabel(ui.document, '收起老师对话'))
    assert.equal(ui.layout().spaceId, first.id)
    assert.equal(ui.visible('老师对话'), false)

    await ui.click([...ui.document.querySelectorAll('button')].find(button => button.textContent === '概率论'))
    assert.equal(ui.visible('我的笔记'), false, '第二个空间的收起状态来自它自己的布局')
    assert.ok(buttonByLabel(ui.document, '显示我的笔记'))
    assert.equal(ui.visible('老师对话'), true, '前一个空间的收起状态不会串到另一个空间')

    await ui.click(buttonByLabel(ui.document, '显示我的笔记'))
    assert.equal(ui.layout().spaceId, second.id)
    assert.deepEqual(ui.layout().layout.collapsed, { directory: false, notes: false, conversation: false })
  } finally {
    await ui.unmount()
  }
})
