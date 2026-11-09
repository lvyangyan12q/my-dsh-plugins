import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
const globals = {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
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
const { ClassroomPanel } = await import('../src/classroom-panel.tsx')
const { ClassroomClientError } = await import('../src/classroom-client.ts')

const space = {
  id: 'space-1',
  title: '概率论',
  directory: '概率论',
  notePath: '笔记/我的笔记.md',
  createdAt: '2026-11-09T00:00:00.000Z',
  lecturePath: null,
}

const readyView = {
  vault: { path: 'D:/知识库', status: 'ready', reason: null, hint: '' },
  spaces: [space],
  currentSpaceId: space.id,
}

const lectures = [
  { path: '讲义/01-样本空间.md', fileName: '01-样本空间.md', title: '样本空间', order: 1, kind: 'markdown' },
  { path: '讲义/02-概率.md', fileName: '02-概率.md', title: '概率', order: 2, kind: 'markdown' },
]

function canvasDocument() {
  const target = (path, vaultPath, kind) => ({ path, vaultPath, kind, status: 'ok', message: null })
  return {
    spaceId: space.id,
    path: '概率论/脉络.canvas',
    fileName: '脉络.canvas',
    width: 600,
    height: 400,
    nodes: [
      { id: 'text', type: 'text', text: '样本空间', x: 0, y: 0, width: 200, height: 80, color: null, file: null, url: null, label: null, target: null },
      {
        id: 'lecture', type: 'file', file: '概率论/讲义/01-样本空间.md', x: 300, y: 0, width: 200, height: 80,
        color: null, text: null, url: null, label: null,
        target: target('讲义/01-样本空间.md', '概率论/讲义/01-样本空间.md', 'lecture'),
      },
      {
        id: 'note', type: 'file', file: '概率论/笔记/概念卡.md', x: 0, y: 200, width: 200, height: 80,
        color: null, text: null, url: null, label: null,
        target: target('笔记/概念卡.md', '概率论/笔记/概念卡.md', 'note'),
      },
      { id: 'link', type: 'link', url: 'https://example.com/reading', x: 300, y: 200, width: 200, height: 80, color: null, text: null, file: null, label: null, target: null },
      { id: 'group', type: 'group', label: '基础', x: -50, y: -50, width: 600, height: 400, color: null, text: null, file: null, url: null, target: null },
      {
        id: 'missing', type: 'file', file: '概率论/讲义/99-没有.md', x: 0, y: 320, width: 200, height: 80,
        color: null, text: null, url: null, label: null,
        target: {
          path: '讲义/99-没有.md',
          vaultPath: '概率论/讲义/99-没有.md',
          kind: 'lecture',
          status: 'missing',
          message: '文件不存在或已被外部删除：概率论/讲义/99-没有.md',
        },
      },
    ],
    edges: [
      { id: 'e1', fromNode: 'text', toNode: 'lecture', label: '先修', relation: 'prerequisite', selfLoop: false },
      { id: 'e2', fromNode: 'note', toNode: 'link', label: '应用', relation: 'application', selfLoop: false },
      { id: 'e3', fromNode: 'text', toNode: 'note', label: '组成', relation: 'composition', selfLoop: false },
      { id: 'e4', fromNode: 'text', toNode: 'text', label: '先修', relation: 'prerequisite', selfLoop: true },
    ],
  }
}

const noteTexts = {
  '笔记/我的笔记.md': '# 我的笔记\n\n默认笔记内容。',
  '笔记/概念卡.md': '# 概念卡\n\n概念卡正文。',
}

function fakeClient(options = {}) {
  const calls = []
  let selectedPath = options.selectedPath ?? null
  const docs = {
    '讲义/01-样本空间.md': {
      spaceId: space.id,
      path: '讲义/01-样本空间.md',
      fileName: '01-样本空间.md',
      title: '样本空间',
      kind: 'markdown',
      content: '# 样本空间\n\n全部可能结果的集合。',
      placeholder: null,
    },
    '讲义/02-概率.md': {
      spaceId: space.id,
      path: '讲义/02-概率.md',
      fileName: '02-概率.md',
      title: '概率',
      kind: 'markdown',
      content: '# 概率\n\n事件的度量。',
      placeholder: null,
    },
  }
  let canvasAttempts = 0
  return {
    calls,
    async load() { return structuredClone(readyView) },
    async command(input) { calls.push(input); return structuredClone(readyView) },
    async listLectures(spaceId) {
      calls.push({ action: 'lecture-list', spaceId })
      return { spaceId, lectures: structuredClone(lectures), selectedPath, missingSelection: null, folderMissing: false }
    },
    async readLecture(spaceId, path) {
      calls.push({ action: 'lecture-read', spaceId, path })
      const doc = docs[path]
      if (!doc) throw new ClassroomClientError('lecture-missing', `讲义文件不存在或已被外部删除：${path}`, 409)
      selectedPath = path
      return structuredClone(doc)
    },
    async readCanvas(spaceId) {
      canvasAttempts += 1
      calls.push({ action: 'canvas-read', spaceId })
      if (options.canvasError !== undefined && canvasAttempts === 1) throw options.canvasError
      return structuredClone(options.canvas ?? canvasDocument())
    },
    async listNotes(spaceId) {
      calls.push({ action: 'note-list', spaceId })
      return {
        notes: Object.keys(noteTexts).map(path => ({ path, name: path.replace(/^笔记\//, '').replace(/\.md$/, '') })),
        defaultPath: '笔记/我的笔记.md',
      }
    },
    async readNote(spaceId, path) {
      calls.push({ action: 'note-read', spaceId, path })
      const content = noteTexts[path]
      if (content === undefined) throw new ClassroomClientError('note-missing', `笔记文件不存在：${path}`, 409)
      return { path, content, version: `v-${path}`, updatedAt: '2026-11-09T00:00:00.000Z' }
    },
    async saveNote() { throw new Error('这个测试不应保存笔记') },
  }
}

async function settle() {
  for (let index = 0; index < 6; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

async function mount(client) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(h(ClassroomPanel, { client })) })
  await settle()
  const document = dom.window.document
  return {
    document,
    text: () => container.textContent,
    tab: label => [...document.querySelectorAll('[role="tablist"] [role="tab"]')].find(tab => tab.textContent === label),
    canvas: () => document.querySelector('[aria-label="课程脉络"]'),
    reader: () => document.querySelector('[aria-label="讲义"]'),
    notes: () => document.querySelector('[aria-label="我的笔记"]'),
    async click(element) { await act(async () => { element.click() }); await settle() },
    async openCanvas() { await this.click(this.tab('脉络')) },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

function node(ui, id) {
  return ui.document.querySelector(`[data-node-id="${id}"]`)
}

function findButton(scope, label) {
  return [...scope.querySelectorAll('button')].find(button => button.textContent.includes(label))
}

test('切到脉络后只读渲染四种节点、分组标签与带标签的有向边', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.openCanvas()
    const canvas = ui.canvas()
    assert.ok(canvas)
    assert.equal(ui.document.querySelectorAll('[data-node-id]').length, 6)
    assert.equal(node(ui, 'text').getAttribute('data-node-type'), 'text')
    assert.match(node(ui, 'group').textContent, /基础/)
    assert.match(node(ui, 'link').textContent, /example\.com/)
    assert.ok(node(ui, 'link').querySelector('a[href="https://example.com/reading"]'))

    const edges = [...canvas.querySelectorAll('[data-edge-id]')]
    assert.equal(edges.length, 4)
    assert.deepEqual(edges.map(edge => edge.getAttribute('data-relation')), ['prerequisite', 'application', 'composition', 'prerequisite'])
    assert.match(edges[0].textContent, /先修/)
    assert.match(edges[1].textContent, /应用/)
    assert.match(edges[2].textContent, /组成/)
    // A self relation is rendered as an explicit self loop, not a stray arrow.
    assert.equal(edges[3].getAttribute('data-self'), 'true')
    assert.match(edges[3].textContent, /自引用/)

    const legend = canvas.querySelector('.lc-canvas-legend')
    assert.match(legend.textContent, /先修/)
    assert.match(legend.textContent, /组成/)
    assert.match(legend.textContent, /应用/)
    const kinds = [...legend.querySelectorAll('[data-relation]')].map(item => item.getAttribute('data-relation'))
    assert.deepEqual(kinds, ['prerequisite', 'composition', 'application'])
  } finally {
    await ui.unmount()
  }
})

test('点击文件节点打开对应讲义，切回课堂并定位到那一节', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.openCanvas()
    await ui.click(node(ui, 'lecture'))

    assert.deepEqual(client.calls.filter(call => call.action === 'lecture-read'), [
      { action: 'lecture-read', spaceId: space.id, path: '讲义/01-样本空间.md' },
    ])
    assert.equal(ui.tab('课堂').getAttribute('aria-selected'), 'true')
    assert.match(ui.reader().textContent, /全部可能结果的集合/)
    assert.equal(ui.document.querySelector('.lc-lecture-list button[aria-current="true"]').textContent, '样本空间')
  } finally {
    await ui.unmount()
  }
})

test('点击笔记节点在笔记区打开对应笔记，不触发讲义读取', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const before = ui.notes().querySelector('textarea')
    assert.ok(before)
    assert.match(before.value, /默认笔记内容/)

    await ui.openCanvas()
    await ui.click(node(ui, 'note'))

    assert.equal(client.calls.some(call => call.action === 'lecture-read'), false)
    assert.equal(ui.tab('课堂').getAttribute('aria-selected'), 'true')
    const editor = ui.notes().querySelector('textarea')
    assert.ok(editor)
    assert.match(editor.value, /概念卡正文/)
    assert.deepEqual(
      client.calls.filter(call => call.action === 'note-read').at(-1),
      { action: 'note-read', spaceId: space.id, path: '笔记/概念卡.md' },
    )
  } finally {
    await ui.unmount()
  }
})

test('画布缺失或格式非法时显示可理解错误，不渲染半张图，并可重试', async () => {
  const missing = new ClassroomClientError(
    'canvas-missing',
    '学习空间「概率论」里还没有「脉络.canvas」（期望路径：概率论/脉络.canvas）。请在 Obsidian 中创建这个画布后刷新脉络；插件内不提供画布编辑。',
    409,
  )
  const client = fakeClient({ canvasError: missing })
  const ui = await mount(client)
  try {
    await ui.openCanvas()
    const canvas = ui.canvas()
    const alert = canvas.querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /脉络\.canvas/)
    assert.match(alert.textContent, /Obsidian/)
    assert.equal(ui.document.querySelectorAll('[data-node-id]').length, 0)
    assert.equal(ui.document.querySelectorAll('[data-edge-id]').length, 0)

    await ui.click(findButton(alert, '重新加载脉络'))
    assert.equal(ui.document.querySelectorAll('[data-node-id]').length, 6)
    assert.equal(canvas.querySelector('[role="alert"]'), null)
  } finally {
    await ui.unmount()
  }

  const invalid = new ClassroomClientError('canvas-invalid', '脉络.canvas 格式不合法：节点「n1」的类型未知：image。', 400)
  const second = fakeClient({ canvasError: invalid })
  const broken = await mount(second)
  try {
    await broken.openCanvas()
    assert.match(broken.canvas().querySelector('[role="alert"]').textContent, /格式不合法/)
    assert.equal(broken.document.querySelectorAll('[data-node-id]').length, 0)
    assert.equal(broken.document.querySelectorAll('[data-edge-id]').length, 0)
  } finally {
    await broken.unmount()
  }
})

test('目标缺失或越界时给出明确提示，不假装打开了讲义', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.openCanvas()
    await ui.click(node(ui, 'missing'))

    const alert = ui.canvas().querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /不存在|删除/)
    assert.match(alert.textContent, /99-没有\.md/)
    assert.equal(client.calls.some(call => call.action === 'lecture-read'), false)
    assert.equal(ui.tab('脉络').getAttribute('aria-selected'), 'true')
  } finally {
    await ui.unmount()
  }
})

test('插件内没有画布编辑入口，只提供路径与在 Obsidian 中打开', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.openCanvas()
    const canvas = ui.canvas()
    assert.match(canvas.textContent, /概率论\/脉络\.canvas/)
    const link = [...canvas.querySelectorAll('a')].find(anchor => anchor.textContent.includes('在 Obsidian 中打开'))
    assert.ok(link)
    assert.match(link.getAttribute('href'), /^obsidian:\/\/open\?path=/)
    assert.match(decodeURIComponent(link.getAttribute('href')), /D:\/知识库\/概率论\/脉络\.canvas/)

    const labels = [...canvas.querySelectorAll('button')].map(button => button.textContent)
    assert.equal(labels.some(label => /添加|新建|创建|编辑|连线|删除/.test(label)), false, `不应有编辑入口：${labels.join('、')}`)
    assert.match(canvas.textContent, /只读/)
    assert.match(canvas.textContent, /在 Obsidian 中编辑/)
  } finally {
    await ui.unmount()
  }
})

test('脉络与课堂切换互不覆盖，回到课堂仍停在原讲义', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const directory = ui.document.querySelector('[aria-label="课程目录"]')
    const probability = [...directory.querySelectorAll('.lc-lecture-list button')].find(button => button.textContent === '概率')
    assert.ok(probability)
    await ui.click(probability)
    assert.match(ui.reader().textContent, /事件的度量/)
    const readsBefore = client.calls.filter(call => call.action === 'lecture-read').length

    await ui.openCanvas()
    await ui.click(ui.tab('课堂'))

    assert.match(ui.reader().textContent, /事件的度量/)
    assert.equal(ui.document.querySelector('.lc-lecture-list button[aria-current="true"]').textContent, '概率')
    assert.equal(client.calls.filter(call => call.action === 'lecture-read').length, readsBefore)
  } finally {
    await ui.unmount()
  }
})
