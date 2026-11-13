import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
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
const { createSessionDraftStore } = await import('../src/note-drafts.ts')
const { createSummaryDraftStore } = await import('../src/summary-drafts.ts')

// Drafts are page/session scoped on purpose; tests in this file share the same
// jsdom page, so clear the fixture spaces between tests.
const summaryDrafts = createSummaryDraftStore(createSessionDraftStore())
beforeEach(() => {
  summaryDrafts.remove('space-1')
  summaryDrafts.remove('space-2')
})

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
    extra: '',
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
  const readDeferred = options.deferSummaryRead === true ? [] : null
  const positionDeferred = options.deferPosition === true ? [] : null
  const updateSpace = (spaceId, patch) => {
    view = { ...view, spaces: view.spaces.map(row => (row.id === spaceId ? { ...row, ...patch } : row)) }
    return structuredClone(view.spaces.find(row => row.id === spaceId))
  }
  return {
    calls,
    summaries,
    saveDeferred,
    readDeferred,
    positionDeferred,
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
      if (readDeferred !== null) {
        let resolve
        let reject
        const promise = new Promise((res, rej) => { resolve = res; reject = rej })
        readDeferred.push({
          spaceId,
          resolve: value => resolve(value ?? structuredClone(summaries.get(spaceId))),
          reject,
        })
        return promise
      }
      return structuredClone(summaries.get(spaceId))
    },
    saveSummary(input) {
      calls.push({ type: 'summary-save', ...structuredClone(input) })
      const current = summaries.get(input.spaceId)
      if ((current.version ?? null) !== input.version) {
        const error = new Error('学习小结文件已被外部修改，保存已被拒绝。请重新加载后再保存。')
        error.code = 'summary-conflict'
        return Promise.reject(error)
      }
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
      const nextPosition = { path: input.path, scrollTop: input.scrollTop }
      if (positionDeferred !== null) {
        let resolve
        let reject
        const promise = new Promise((res, rej) => { resolve = res; reject = rej })
        positionDeferred.push({
          input,
          resolve: value => {
            const spaceView = updateSpace(input.spaceId, { readingPosition: nextPosition })
            resolve(value ?? spaceView)
          },
          reject,
        })
        return promise
      }
      return updateSpace(input.spaceId, { readingPosition: nextPosition })
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

test('A 编辑、切到 B、A 被外部修改、回到 A 保存：用草稿基线版本拒绝覆盖', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.document, '编辑小结'))
    await ui.type(ui.document.querySelector('textarea[aria-label="本次小结"]'), 'A 的旧基线草稿')

    await ui.click([...ui.document.querySelectorAll('button')].find(button => button.textContent === '概率论'))
    // Another editor changes A while the learner is away.
    client.summaries.set('space-1', summaryView('space-1', '外部新小结', '外部新一步', 'summary-v2'))
    await ui.click([...ui.document.querySelectorAll('button')].find(button => button.textContent === '线性代数'))

    const editor = ui.document.querySelector('textarea[aria-label="本次小结"]')
    assert.equal(editor.value, 'A 的旧基线草稿', '回到 A 时草稿仍在编辑框里')
    await ui.click(findButton(ui.document, '保存小结'))

    const save = client.calls.filter(call => call.type === 'summary-save').at(-1)
    assert.equal(save.version, 'summary-v1', '保存必须使用草稿基线版本，而不是刚读到的 v2')
    assert.equal(client.summaries.get('space-1').summary, '外部新小结', '外部修改没有被静默覆盖')
    assert.match(ui.text(), /外部修改|拒绝/)
    assert.equal(ui.document.querySelector('textarea[aria-label="本次小结"]').value, 'A 的旧基线草稿', '冲突后草稿仍在')
  } finally {
    await ui.unmount()
  }
})

test('未保存的小结草稿在重新挂载后恢复，并且不会自动写盘', async () => {
  const client = fakeClient()
  const first = await mount(client)
  try {
    await first.click(findButton(first.document, '编辑小结'))
    await first.type(first.document.querySelector('textarea[aria-label="本次小结"]'), '刷新前还没保存的小结')
    assert.equal(client.calls.filter(call => call.type === 'summary-save').length, 0, '输入不会自动保存')
  } finally {
    await first.unmount()
  }

  const second = await mount(client)
  try {
    const editor = second.document.querySelector('textarea[aria-label="本次小结"]')
    assert.ok(editor, '重新挂载后应恢复可继续编辑的草稿')
    assert.equal(editor.value, '刷新前还没保存的小结')
    assert.match(zone(second.document, '学习接续').textContent, /恢复|草稿/)
    assert.equal(client.calls.filter(call => call.type === 'summary-save').length, 0, '恢复草稿不等于自动保存')
  } finally {
    await second.unmount()
  }
})

test('阅读位置保存成功后卡片与回到位置立即使用最新偏移，无需整页重读', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const pane = zone(ui.document, '讲义')
    await ui.scroll(pane, 360)
    await wait(600)
    assert.match(zone(ui.document, '学习接续').textContent, /约 360 像素/, '保存成功后卡片立即显示新位置')

    // Move without firing a scroll event, so only the stored position can drive restore.
    await act(async () => { pane.scrollTop = 0 })
    await ui.click(findButton(ui.document, '回到上次阅读位置'))
    assert.equal(pane.scrollTop, 360, '回到位置使用刚保存的最新偏移，而不是旧的 view 值')
  } finally {
    await ui.unmount()
  }
})

test('A 的阅读位置迟到回包只更新 A，不污染 B 的卡片与恢复位置', async () => {
  const client = fakeClient({ deferPosition: true })
  const ui = await mount(client)
  try {
    const paneA = zone(ui.document, '讲义')
    await ui.scroll(paneA, 500)
    await wait(600)
    assert.equal(client.positionDeferred.length, 1, 'A 的位置保存请求仍在途')

    await ui.click([...ui.document.querySelectorAll('button')].find(button => button.textContent === '概率论'))
    await act(async () => { client.positionDeferred[0].resolve() })
    await settle()

    const bCard = zone(ui.document, '学习接续').textContent
    assert.match(bCard, /约 30 像素/, 'B 保持自己的阅读位置')
    assert.doesNotMatch(bCard, /500 像素/, 'A 的迟到回包没有写进 B')
    assert.equal(zone(ui.document, '讲义').scrollTop, 30, 'B 的恢复位置不被 A 的回包改写')

    await ui.click([...ui.document.querySelectorAll('button')].find(button => button.textContent === '线性代数'))
    assert.match(zone(ui.document, '学习接续').textContent, /约 500 像素/, 'A 自己拿到更新后的位置')
  } finally {
    await ui.unmount()
  }
})

test('重新加载在途时继续输入：迟到回包不删新草稿、不覆盖新文字', async () => {
  const client = fakeClient({ deferSummaryRead: true })
  const ui = await mount(client)
  try {
    await act(async () => { client.readDeferred[0].resolve() })
    await settle()
    await ui.click(findButton(ui.document, '编辑小结'))
    await ui.click(findButton(ui.document, '重新加载小结（放弃我的修改）'))
    assert.equal(client.readDeferred.length, 2, '重新加载请求仍在途')

    await ui.type(ui.document.querySelector('textarea[aria-label="本次小结"]'), 'reload 期间的新输入')
    assert.equal(summaryDrafts.read('space-1').summary, 'reload 期间的新输入')

    await act(async () => { client.readDeferred[1].resolve() })
    await settle()

    const editor = ui.document.querySelector('textarea[aria-label="本次小结"]')
    assert.ok(editor, '迟到的 reload 不能关掉编辑')
    assert.equal(editor.value, 'reload 期间的新输入', '迟到回包不能覆盖新文字')
    assert.equal(summaryDrafts.read('space-1').summary, 'reload 期间的新输入', '迟到 reload 不能删掉新草稿')
  } finally {
    await ui.unmount()
  }
})

test('取消编辑后迟到的重新加载不得重新打开编辑或写回草稿', async () => {
  const client = fakeClient({ deferSummaryRead: true })
  const ui = await mount(client)
  try {
    await act(async () => { client.readDeferred[0].resolve() })
    await settle()
    await ui.click(findButton(ui.document, '编辑小结'))
    await ui.click(findButton(ui.document, '重新加载小结（放弃我的修改）'))
    await ui.click(findButton(ui.document, '取消'))
    assert.equal(summaryDrafts.read('space-1'), null)

    await act(async () => { client.readDeferred[1].resolve() })
    await settle()

    assert.equal(ui.document.querySelector('textarea[aria-label="本次小结"]'), null, '取消后旧 reload 不能重开编辑')
    assert.ok(findButton(ui.document, '编辑小结'), '仍是只读展示')
    assert.equal(summaryDrafts.read('space-1'), null, '旧 reload 不能写回已放弃的草稿')
  } finally {
    await ui.unmount()
  }
})

test('保存在途时继续输入：迟到成功不清掉新草稿，编辑框保留新文字', async () => {
  const client = fakeClient({ deferSummarySave: true })
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.document, '编辑小结'))
    await ui.type(ui.document.querySelector('textarea[aria-label="本次小结"]'), '第一次输入')
    await ui.click(findButton(ui.document, '保存小结'))
    assert.equal(client.saveDeferred.length, 1, '保存请求仍在途')

    await ui.type(ui.document.querySelector('textarea[aria-label="本次小结"]'), '第二次输入')
    await act(async () => { client.saveDeferred[0].resolve() })
    await settle()

    const editor = ui.document.querySelector('textarea[aria-label="本次小结"]')
    assert.ok(editor, '迟到成功不能关掉正在编辑的表单')
    assert.equal(editor.value, '第二次输入', '迟到的保存结果不能覆盖后输入的文字')
    assert.equal(summaryDrafts.read('space-1').summary, '第二次输入', '新草稿仍在可靠存储里')
  } finally {
    await ui.unmount()
  }
})

test('保存在途时取消：迟到成功不得重新打开编辑或复活草稿', async () => {
  const client = fakeClient({ deferSummarySave: true })
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.document, '编辑小结'))
    await ui.type(ui.document.querySelector('textarea[aria-label="本次小结"]'), '要取消的输入')
    await ui.click(findButton(ui.document, '保存小结'))
    await ui.click(findButton(ui.document, '取消'))

    await act(async () => { client.saveDeferred[0].resolve() })
    await settle()

    assert.equal(ui.document.querySelector('textarea[aria-label="本次小结"]'), null, '取消后迟到成功不能重开编辑')
    assert.equal(summaryDrafts.read('space-1'), null)
  } finally {
    await ui.unmount()
  }
})

test('同一主题的阅读位置旧回包不能覆盖新回包', async () => {
  const client = fakeClient({ deferPosition: true })
  const ui = await mount(client)
  try {
    const pane = zone(ui.document, '讲义')
    await ui.scroll(pane, 300)
    await wait(600)
    await ui.scroll(pane, 600)
    await wait(600)
    assert.equal(client.positionDeferred.length, 2, '两个位置请求都在途')

    await act(async () => { client.positionDeferred[1].resolve() })
    await settle()
    await act(async () => { client.positionDeferred[0].resolve() })
    await settle()

    assert.match(zone(ui.document, '学习接续').textContent, /约 600 像素/, '旧回包不能把位置退回 300')
  } finally {
    await ui.unmount()
  }
})

test('初始 load 的旧版本回包在草稿保存成功后到达，不回退 summary 版本', async () => {
  const client = fakeClient({ deferSummaryRead: true })
  client.summaries.set('space-1', summaryView('space-1', '磁盘 v2 小结', '磁盘 v2 下一步', 'summary-v2'))
  summaryDrafts.write('space-1', {
    summary: '恢复的草稿',
    nextStep: '',
    baseVersion: 'summary-v2',
    revision: 5,
    savedAt: '2026-11-13T00:00:00.000Z',
  })
  const ui = await mount(client)
  try {
    const editor = ui.document.querySelector('textarea[aria-label="本次小结"]')
    assert.ok(editor, '草稿在初始 load 完成前就可编辑')
    assert.equal(editor.value, '恢复的草稿')

    await ui.click(findButton(ui.document, '保存小结'))
    assert.match(zone(ui.document, '学习接续').textContent, /恢复的草稿/)

    // The initial read was issued before the save and carries the old version.
    await act(async () => {
      client.readDeferred[0].resolve(summaryView('space-1', '旧 v1 小结', '旧 v1 下一步', 'summary-v1'))
    })
    await settle()
    assert.doesNotMatch(zone(ui.document, '学习接续').textContent, /旧 v1 小结/, '旧 load 不能回退已保存的新版本')

    await ui.click(findButton(ui.document, '编辑小结'))
    await ui.click(findButton(ui.document, '保存小结'))
    const saves = client.calls.filter(call => call.type === 'summary-save')
    assert.equal(saves.at(-1).version, 'summary:恢复的草稿', '后续编辑使用保存后的新版本')
    assert.doesNotMatch(ui.text(), /保存小结失败/)
  } finally {
    await ui.unmount()
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
