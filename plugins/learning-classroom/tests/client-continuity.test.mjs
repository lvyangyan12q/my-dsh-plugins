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

const lectureBody = '# 第一节 矩阵\n\n' + Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 段正文。`).join('\n\n')

function space(overrides = {}) {
  return {
    id: 'space-1',
    title: '线性代数',
    directory: '线性代数',
    notePath: '笔记/我的笔记.md',
    createdAt: '2026-11-09T00:00:00.000Z',
    sessionId: null,
    cwd: 'D:/知识库/线性代数',
    lecturePath: '讲义/01.md',
    linkedLectures: [],
    layout: defaultLayout(),
    readingPosition: { path: '讲义/01.md', scrollTop: 420 },
    ...overrides,
  }
}

function lecture(path = '讲义/01.md', title = '第一节 矩阵') {
  return {
    path,
    fileName: path.split('/').pop(),
    title,
    order: null,
    kind: 'markdown',
    chapter: '',
    source: 'lectures',
    missing: false,
  }
}

function summaryView(spaceId, summary, nextStep, version = 'summary-v1') {
  return {
    spaceId,
    path: '学习小结.md',
    summary,
    nextStep,
    version,
    updatedAt: '2026-11-10T00:00:00.000Z',
    fileMissing: false,
  }
}

function fakeClient(options = {}) {
  const first = space()
  const second = space({
    id: 'space-2',
    title: '概率论',
    directory: '概率论',
    notePath: '笔记/我的笔记.md',
    cwd: 'D:/知识库/概率论',
    lecturePath: '讲义/02.md',
    readingPosition: { path: '讲义/02.md', scrollTop: 30 },
  })
  const spaces = [structuredClone(first), structuredClone(second)]
  let view = {
    vault: { path: 'D:/知识库', status: 'ready', reason: null, hint: '' },
    spaces,
    currentSpaceId: first.id,
  }
  const calls = []
  const summaries = new Map([
    [first.id, summaryView(first.id, '今天理解了行列式。', '做两道行列式题。')],
    [second.id, summaryView(second.id, 'B 的小结。', 'B 的下一步。', 'summary-b')],
  ])
  const saveDeferred = options.deferSummarySave === true ? [] : null
  const updateSpace = (spaceId, patch) => {
    view = { ...view, spaces: view.spaces.map(row => (row.id === spaceId ? { ...row, ...patch } : row)) }
    return structuredClone(view.spaces.find(row => row.id === spaceId))
  }
  return {
    calls,
    summaries,
    saveDeferred,
    get view() { return view },
    async load() { return structuredClone(view) },
    async command(input) {
      calls.push({ type: 'command', ...structuredClone(input) })
      if (input.action === 'space-open') {
        if (!view.spaces.some(row => row.id === input.spaceId)) throw new Error(`学习空间不存在：${input.spaceId}`)
        view = { ...view, currentSpaceId: input.spaceId }
      }
      return structuredClone(view)
    },
    async listLectures(spaceId) {
      const target = view.spaces.find(row => row.id === spaceId)
      const path = target.lecturePath
      return {
        spaceId,
        lectures: path === null ? [] : [lecture(path, spaceId === first.id ? '第一节 矩阵' : '第二节 条件概率')],
        selectedPath: path,
        missingSelection: null,
        folderMissing: false,
      }
    },
    async readLecture(spaceId, path) {
      calls.push({ type: 'lecture-read', spaceId, path })
      return {
        spaceId,
        path,
        fileName: '01.md',
        title: spaceId === first.id ? '第一节 矩阵' : '第二节 条件概率',
        kind: 'markdown',
        content: lectureBody,
        experiment: null,
        experimentError: null,
        sources: [],
        parameters: [],
        version: 'lecture-v1',
      }
    },
    async readTopic(spaceId) {
      return {
        spaceId,
        path: '学习目标.md',
        title: spaceId === first.id ? '线性代数' : '概率论',
        goal: spaceId === first.id ? '能独立完成矩阵题。' : '理解条件概率。',
        version: 'goal-v1',
        updatedAt: '2026-11-09T00:00:00.000Z',
        fileMissing: false,
      }
    },
    async saveTopicGoal(input) {
      calls.push({ type: 'topic-save', ...input })
      return this.readTopic(input.spaceId)
    },
    async readSummary(spaceId) {
      calls.push({ type: 'summary-read', spaceId })
      return structuredClone(summaries.get(spaceId))
    },
    saveSummary(input) {
      calls.push({ type: 'summary-save', ...structuredClone(input) })
      const next = summaryView(input.spaceId, input.summary, input.nextStep, `summary:${input.summary}`)
      if (saveDeferred !== null) {
        let resolve
        let reject
        const promise = new Promise((res, rej) => { resolve = res; reject = rej })
        saveDeferred.push({ input, resolve: value => resolve(value ?? next), reject })
        return promise
      }
      summaries.set(input.spaceId, next)
      return Promise.resolve(next)
    },
    async saveReadingPosition(input) {
      calls.push({ type: 'position-save', ...structuredClone(input) })
      return updateSpace(input.spaceId, { readingPosition: { path: input.path, scrollTop: input.scrollTop } })
    },
    async selectNote(input) {
      calls.push({ type: 'note-select', ...structuredClone(input) })
      return updateSpace(input.spaceId, { notePath: input.path })
    },
    async listNotes() {
      return {
        notes: [
          { path: '笔记/我的笔记.md', name: '我的笔记.md' },
          { path: '笔记/阅读笔记.md', name: '阅读笔记.md' },
        ],
        defaultPath: view.spaces[0].notePath,
      }
    },
    async readNote(spaceId, path) {
      calls.push({ type: 'note-read', spaceId, path })
      return { path, content: `# ${path}\n`, version: `note:${path}`, updatedAt: '2026-11-09T00:00:00.000Z' }
    },
    async saveNote(input) {
      calls.push({ type: 'note-save', ...structuredClone(input) })
      return { path: input.path, version: `note:${input.content}`, savedAt: '2026-11-09T00:01:00.000Z' }
    },
    async saveLayout(input) {
      calls.push({ type: 'layout-save', ...structuredClone(input) })
      return structuredClone(view)
    },
    async readCanvas() { throw new Error('本测试不使用脉络') },
  }
}

async function settle(rounds = 8) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

function findButton(document, label) {
  return [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))
}

function zone(document, label) {
  return document.querySelector(`[aria-label="${label}"]`)
}

async function wait(ms) {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) })
}

async function mount(client) {
  FakeResizeObserver.instances = []
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(h(ClassroomPanel, { client })) })
  await settle()
  return {
    document: dom.window.document,
    text: () => container.textContent,
    async click(element) {
      assert.ok(element, '要点击的元素应存在')
      await act(async () => { element.click() })
      await settle()
    },
    async type(element, value) {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
      await act(async () => {
        setter.call(element, value)
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      await settle()
    },
    async select(element, value) {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set
      await act(async () => {
        setter.call(element, value)
        element.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      })
      await settle()
    },
    async scroll(element, top) {
      await act(async () => {
        element.scrollTop = top
        element.dispatchEvent(new dom.window.Event('scroll'))
      })
      await settle(2)
    },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

test('冷启动显示目标、上次位置与已保存的小结，阅读位置恢复到上次的讲义偏移', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const text = ui.text()
    assert.match(text, /目标：能独立完成矩阵题。/)
    assert.match(text, /上次位置：第一节 矩阵/)
    assert.match(text, /约 420 像素/)
    assert.match(text, /今天理解了行列式。/)
    assert.match(text, /做两道行列式题。/)
    const pane = zone(ui.document, '讲义')
    assert.ok(pane, '讲义区存在')
    assert.equal(pane.scrollTop, 420, '冷启动按保存的偏移恢复阅读位置')
    assert.equal(client.calls.filter(call => call.type === 'lecture-read').length, 1)
  } finally {
    await ui.unmount()
  }
})

test('显式保存本次小结与下一步，走带版本的知识文件命令并在界面更新', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.document, '编辑小结'))
    await ui.type(ui.document.querySelector('textarea[aria-label="本次小结"]'), '新的小结：矩阵乘法。')
    await ui.type(ui.document.querySelector('textarea[aria-label="下一步"]'), '做矩阵乘法练习。')
    await ui.click(findButton(ui.document, '保存小结'))

    const save = client.calls.find(call => call.type === 'summary-save')
    assert.ok(save, '显式保存一次小结')
    assert.deepEqual(
      { action: save.action, spaceId: save.spaceId, summary: save.summary, nextStep: save.nextStep, version: save.version },
      {
        action: 'summary-save',
        spaceId: 'space-1',
        summary: '新的小结：矩阵乘法。',
        nextStep: '做矩阵乘法练习。',
        version: 'summary-v1',
      },
    )
    assert.match(ui.text(), /新的小结：矩阵乘法。/)
    assert.match(ui.text(), /做矩阵乘法练习。/)
    assert.equal(findButton(ui.document, '编辑小结') !== undefined, true, '保存后回到只读展示')
  } finally {
    await ui.unmount()
  }
})

test('切换主题后迟到的保存失败不串到另一个主题，A 的草稿与错误留在 A', async () => {
  const client = fakeClient({ deferSummarySave: true })
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.document, '编辑小结'))
    await ui.type(ui.document.querySelector('textarea[aria-label="本次小结"]'), 'A 的未保存小结')
    await ui.click(findButton(ui.document, '保存小结'))

    await ui.click([...ui.document.querySelectorAll('button')].find(button => button.textContent === '概率论'))
    assert.ok(zone(ui.document, '学习接续').textContent.includes('B 的小结。'), 'B 显示自己的小结')

    await act(async () => {
      client.saveDeferred[0].reject(new Error('磁盘忙，保存失败'))
    })
    await settle()

    const bCard = zone(ui.document, '学习接续').textContent
    assert.doesNotMatch(bCard, /磁盘忙/)
    assert.match(bCard, /B 的小结。/)
    assert.match(bCard, /B 的下一步。/)

    await ui.click([...ui.document.querySelectorAll('button')].find(button => button.textContent === '线性代数'))
    const aCard = zone(ui.document, '学习接续').textContent
    assert.match(aCard, /磁盘忙/)
    assert.equal(ui.document.querySelector('textarea[aria-label="本次小结"]').value, 'A 的未保存小结', '失败后 A 的草稿仍在')
  } finally {
    await ui.unmount()
  }
})

test('按主题恢复上次打开的笔记，切换笔记后把选择写回该主题', async () => {
  const client = fakeClient()
  client.view.spaces[0].notePath = '笔记/阅读笔记.md'
  const ui = await mount(client)
  try {
    const select = ui.document.querySelector('select[aria-label="笔记文件"]')
    assert.equal(select.value, '笔记/阅读笔记.md', '冷启动打开上次的笔记')
    assert.ok(client.calls.some(call => call.type === 'note-read' && call.path === '笔记/阅读笔记.md'))

    await ui.select(select, '笔记/我的笔记.md')
    const chosen = client.calls.find(call => call.type === 'note-select')
    assert.ok(chosen, '切换笔记时写回主题选择')
    assert.deepEqual(
      { action: chosen.action, spaceId: chosen.spaceId, path: chosen.path },
      { action: 'note-select', spaceId: 'space-1', path: '笔记/我的笔记.md' },
    )
    assert.ok(client.calls.some(call => call.type === 'note-read' && call.path === '笔记/我的笔记.md'))
  } finally {
    await ui.unmount()
  }
})

test('滚动讲义后防抖保存阅读位置，重新挂载按该位置恢复', async () => {
  const client = fakeClient()
  const first = await mount(client)
  try {
    const pane = zone(first.document, '讲义')
    await first.scroll(pane, 360)
    assert.equal(client.calls.some(call => call.type === 'position-save'), false, '防抖窗口内不写状态')
    await wait(600)
    const saved = client.calls.filter(call => call.type === 'position-save').at(-1)
    assert.deepEqual(
      { action: saved.action, spaceId: saved.spaceId, path: saved.path, scrollTop: saved.scrollTop },
      { action: 'position-save', spaceId: 'space-1', path: '讲义/01.md', scrollTop: 360 },
    )
  } finally {
    await first.unmount()
  }

  const second = await mount(client)
  try {
    assert.equal(zone(second.document, '讲义').scrollTop, 360, '重新进入恢复到保存的阅读位置')
  } finally {
    await second.unmount()
  }
})

test('没有实现小结命令的旧客户端仍渲染课堂，不显示假装可保存的接续卡', async () => {
  const client = fakeClient()
  delete client.readSummary
  delete client.saveSummary
  const ui = await mount(client)
  try {
    assert.equal(zone(ui.document, '学习接续'), null)
    assert.match(ui.text(), /第一节 矩阵/, '讲义仍可阅读')
  } finally {
    await ui.unmount()
  }
})
