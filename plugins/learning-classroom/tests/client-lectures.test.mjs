import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
const globals = {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
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
  { path: '讲义/02-后讲.md', fileName: '02-后讲.md', title: '后讲', order: 2, kind: 'markdown', chapter: '', source: 'lectures', missing: false },
  { path: '讲义/01-先讲.md', fileName: '01-先讲.md', title: '先讲', order: 10, kind: 'markdown', chapter: '', source: 'lectures', missing: false },
  { path: '讲义/03-实验.html', fileName: '03-实验.html', title: '实验', order: null, kind: 'experiment', chapter: '', source: 'lectures', missing: false },
]

const defaultTopic = {
  spaceId: 'space-1',
  path: '学习目标.md',
  title: '概率论',
  goal: '先学会条件概率。',
  version: 'version-goal-1',
  updatedAt: '2026-11-12T00:00:00.000Z',
  fileMissing: false,
}

const defaultCandidates = [
  { path: '资料/旧资料.md', fileName: '旧资料.md', title: '旧资料', chapter: '资料' },
]

const article = [
  '# 样本空间',
  '',
  '样本空间是**所有可能结果**的集合。',
  '',
  '- 样本点',
  '- 事件',
  '',
  '| 概念 | 说明 |',
  '| --- | --- |',
  '| 事件 | 结果的集合 |',
  '',
  '```ts',
  'const x = 1',
  '```',
  '',
  '> 先定义，再计算。',
].join('\n')

function docsFor() {
  return {
    '讲义/02-后讲.md': {
      spaceId: space.id,
      path: '讲义/02-后讲.md',
      fileName: '02-后讲.md',
      title: '后讲',
      kind: 'markdown',
      content: article,
      placeholder: null,
    },
    '讲义/01-先讲.md': {
      spaceId: space.id,
      path: '讲义/01-先讲.md',
      fileName: '01-先讲.md',
      title: '先讲',
      kind: 'markdown',
      content: '# 先讲内容\n\n第一节正文。',
      placeholder: null,
    },
    '讲义/03-实验.html': {
      spaceId: space.id,
      path: '讲义/03-实验.html',
      fileName: '03-实验.html',
      title: '实验',
      kind: 'experiment',
      content: null,
      placeholder: '这是一节动态实验（HTML）。隔离渲染会在后续工单中打开。',
    },
  }
}

function fakeClient(options = {}) {
  const calls = []
  let selectedPath = options.selectedPath ?? null
  let missingSelection = options.missingSelection ?? null
  let lectureRows = structuredClone(options.lectures ?? lectures)
  let topic = structuredClone(options.topic ?? defaultTopic)
  let candidateFiles = structuredClone(options.candidates ?? defaultCandidates)
  const docs = options.docs ?? docsFor()
  const listView = () => ({
    spaceId: space.id,
    lectures: structuredClone(lectureRows),
    selectedPath,
    missingSelection,
    folderMissing: options.folderMissing ?? false,
  })
  return {
    calls,
    async load() { return structuredClone(readyView) },
    async command(input) { calls.push(input); return structuredClone(readyView) },
    async listLectures(spaceId) {
      calls.push({ action: 'lecture-list', spaceId })
      const result = listView()
      missingSelection = null
      return result
    },
    async readLecture(spaceId, path) {
      calls.push({ action: 'lecture-read', spaceId, path })
      const doc = docs[path]
      if (!doc) throw new ClassroomClientError('lecture-missing', `讲义文件不存在或已被外部删除：${path}`, 409)
      selectedPath = path
      return structuredClone(doc)
    },
    async readTopic(spaceId) {
      calls.push({ action: 'topic-read', spaceId })
      if (options.topicError) throw options.topicError
      return structuredClone(topic)
    },
    async saveTopicGoal(input) {
      calls.push(input)
      if (options.saveTopicError) throw options.saveTopicError
      topic = { ...topic, goal: input.goal, version: 'version-goal-2', fileMissing: false }
      return structuredClone(topic)
    },
    async listLectureCandidates(spaceId) {
      calls.push({ action: 'lecture-candidates', spaceId })
      return { spaceId, files: structuredClone(candidateFiles), truncated: options.truncated ?? false }
    },
    async linkLecture(spaceId, path) {
      calls.push({ action: 'lecture-link', spaceId, path })
      const file = candidateFiles.find(row => row.path === path)
      candidateFiles = candidateFiles.filter(row => row.path !== path)
      if (file !== undefined) {
        lectureRows = [...lectureRows, {
          path,
          fileName: file.fileName,
          title: file.title,
          order: null,
          kind: 'markdown',
          chapter: file.chapter,
          source: 'linked',
          missing: false,
        }]
      }
      return listView()
    },
    async unlinkLecture(spaceId, path) {
      calls.push({ action: 'lecture-unlink', spaceId, path })
      lectureRows = lectureRows.filter(row => row.path !== path)
      if (selectedPath === path) selectedPath = null
      return listView()
    },
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
    directory: () => document.querySelector('[aria-label="课程目录"]'),
    reader: () => document.querySelector('[aria-label="讲义"]'),
    async click(element) { await act(async () => { element.click() }); await settle() },
    async setTextarea(area, value) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(area, value)
        area.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      await settle()
    },
    async submit(form) { await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) }); await settle() },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

function findButton(scope, label) {
  return [...scope.querySelectorAll('button')].find(button => button.textContent.includes(label))
}

test('目录列出讲义文件，空空间显示提示与下一步', async () => {
  const empty = fakeClient({ lectures: [] })
  const ui = await mount(empty)
  try {
    assert.match(ui.directory().textContent, /学习空间/)
    assert.match(ui.directory().textContent, /还没有讲义/)
    assert.match(ui.reader().textContent, /还没有讲义/)
    assert.match(ui.reader().textContent, /讲义\//)
  } finally {
    await ui.unmount()
  }

  const full = fakeClient()
  const second = await mount(full)
  try {
    const buttons = [...second.directory().querySelectorAll('.lc-lecture-list button')]
    assert.deepEqual(buttons.map(button => button.textContent), ['后讲', '先讲', '实验'])
  } finally {
    await second.unmount()
  }
})

test('点击讲义在右侧排版渲染标题、列表、表格、代码与引用', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '后讲'))
    assert.deepEqual(client.calls.filter(call => call.action === 'lecture-read'), [{ action: 'lecture-read', spaceId: space.id, path: '讲义/02-后讲.md' }])

    const reader = ui.reader()
    assert.equal(reader.querySelector('.lc-lecture-doc h3').textContent, '样本空间')
    assert.equal(reader.querySelectorAll('li').length, 2)
    assert.equal(reader.querySelector('th').textContent, '概念')
    assert.equal(reader.querySelector('td').textContent, '事件')
    assert.match(reader.querySelector('pre code').textContent, /const x = 1/)
    assert.equal(reader.querySelector('blockquote').textContent, '先定义，再计算。')
    assert.match(reader.querySelector('strong').textContent, /所有可能结果/)
    assert.equal(ui.directory().querySelector('.lc-lecture-list button[aria-current="true"]').textContent, '后讲')
  } finally {
    await ui.unmount()
  }
})

test('重新打开学习空间时自动回到上次的讲义', async () => {
  const client = fakeClient({ selectedPath: '讲义/02-后讲.md' })
  const ui = await mount(client)
  try {
    assert.deepEqual(client.calls.filter(call => call.action === 'lecture-read'), [{ action: 'lecture-read', spaceId: space.id, path: '讲义/02-后讲.md' }])
    assert.equal(ui.reader().querySelector('.lc-lecture-doc h3').textContent, '样本空间')
    const current = ui.directory().querySelector('.lc-lecture-list button[aria-current="true"]')
    assert.equal(current.textContent, '后讲')
  } finally {
    await ui.unmount()
  }
})

test('讲义被外部删除时提示并给出重新加载目录的出口', async () => {
  const client = fakeClient({ missingSelection: '讲义/99-旧课.md' })
  const ui = await mount(client)
  try {
    const alert = ui.reader().querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /99-旧课\.md/)
    assert.match(alert.textContent, /删除|改名/)
    await ui.click(findButton(alert, '重新加载目录'))
    assert.deepEqual(client.calls.filter(call => call.action === 'lecture-list').length >= 2, true)
    assert.equal(ui.reader().querySelector('h3'), null)
    assert.match(ui.reader().textContent, /选择一节讲义/)
  } finally {
    await ui.unmount()
  }
})

test('读取时发现讲义被删除也给出同样的可操作提示', async () => {
  const client = fakeClient({ lectures: [{ path: '讲义/旧.md', fileName: '旧.md', title: '旧课', order: null, kind: 'markdown' }], docs: {} })
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '旧课'))
    assert.match(ui.reader().textContent, /删除|不存在/)
    assert.ok(findButton(ui.reader(), '重新加载目录'))
  } finally {
    await ui.unmount()
  }
})

test('HTML 实验只显示可理解占位，不注入实验内容', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '实验'))
    const reader = ui.reader()
    assert.match(reader.textContent, /后续工单/)
    assert.equal(reader.querySelector('iframe'), null)
    assert.equal(reader.querySelector('script'), null)
  } finally {
    await ui.unmount()
  }
})

test('讲义里的原始 HTML 只显示为文字，不会变成 DOM 结构', async () => {
  const unsafe = '# 安全\n\n<img src=x onerror="alert(1)">\n\n<script>alert(2)</script>'
  const docs = docsFor()
  docs['讲义/02-后讲.md'] = { ...docs['讲义/02-后讲.md'], content: unsafe }
  const ui = await mount(fakeClient({ docs }))
  try {
    await ui.click(findButton(ui.directory(), '后讲'))
    const reader = ui.reader()
    assert.equal(reader.querySelector('img'), null)
    assert.equal(reader.querySelector('script'), null)
    assert.match(reader.textContent, /<img src=x/)
    assert.match(reader.textContent, /<script>alert\(2\)<\/script>/)
  } finally {
    await ui.unmount()
  }
})

test('切换讲义不重挂笔记区与对话区', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const notes = ui.document.querySelector('[aria-label="我的笔记"]')
    const conversation = ui.document.querySelector('[aria-label="老师对话"]')
    const notesText = notes.textContent
    const conversationText = conversation.textContent

    await ui.click(findButton(ui.directory(), '后讲'))
    await ui.click(findButton(ui.directory(), '先讲'))

    assert.equal(ui.document.querySelector('[aria-label="我的笔记"]'), notes)
    assert.equal(ui.document.querySelector('[aria-label="老师对话"]'), conversation)
    assert.equal(notes.textContent, notesText)
    assert.equal(conversation.textContent, conversationText)
    assert.match(ui.reader().textContent, /先讲内容/)
  } finally {
    await ui.unmount()
  }
})

test('学习目标可读可编辑，保存时携带读取版本并显示新正文', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const goal = ui.directory().querySelector('[aria-label="学习目标"]')
    assert.ok(goal)
    assert.match(goal.textContent, /先学会条件概率/)

    await ui.click(findButton(goal, '编辑目标'))
    const area = goal.querySelector('textarea[aria-label="学习目标内容"]')
    assert.ok(area)
    await ui.setTextarea(area, '能独立完成条件概率题。')
    await ui.click(findButton(goal, '保存目标'))

    assert.deepEqual(client.calls.find(call => call.action === 'topic-save'), {
      action: 'topic-save',
      spaceId: space.id,
      goal: '能独立完成条件概率题。',
      version: 'version-goal-1',
    })
    assert.equal(goal.querySelector('textarea[aria-label="学习目标内容"]'), null)
    assert.match(ui.directory().querySelector('[aria-label="学习目标"]').textContent, /能独立完成条件概率题/)
  } finally {
    await ui.unmount()
  }
})

test('目标保存冲突时保留编辑中的文字并给出重试提示，不悄悄覆盖', async () => {
  const conflict = new ClassroomClientError('topic-conflict', '学习目标文件已被外部修改，保存已被拒绝。请重新加载后再保存。', 409)
  const client = fakeClient({ saveTopicError: conflict })
  const ui = await mount(client)
  try {
    const goal = ui.directory().querySelector('[aria-label="学习目标"]')
    await ui.click(findButton(goal, '编辑目标'))
    const area = goal.querySelector('textarea[aria-label="学习目标内容"]')
    await ui.setTextarea(area, '冲突时仍需保留的文字')
    await ui.click(findButton(goal, '保存目标'))

    const alert = goal.querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /外部修改|重新加载/)
    const stillEditing = goal.querySelector('textarea[aria-label="学习目标内容"]')
    assert.ok(stillEditing)
    assert.equal(stillEditing.value, '冲突时仍需保留的文字')
  } finally {
    await ui.unmount()
  }
})

test('目标文件被外部删除时显示缺失提示，编辑保存可重新创建', async () => {
  const missingTopic = { ...defaultTopic, goal: '', version: null, fileMissing: true }
  const client = fakeClient({ topic: missingTopic })
  const ui = await mount(client)
  try {
    const goal = ui.directory().querySelector('[aria-label="学习目标"]')
    assert.match(goal.textContent, /学习目标\.md/)
    assert.match(goal.textContent, /不见|重新创建|还没有填写/)
    await ui.click(findButton(goal, '编辑目标'))
    await ui.click(findButton(goal, '保存目标'))
    assert.deepEqual(client.calls.find(call => call.action === 'topic-save'), {
      action: 'topic-save',
      spaceId: space.id,
      goal: '',
      version: null,
    })
  } finally {
    await ui.unmount()
  }
})

test('课程目录按章节分组并保留章内顺序，根目录文件不出现空章节标题', async () => {
  const chaptered = [
    { path: '讲义/01-总论.md', fileName: '01-总论.md', title: '总论', order: 1, kind: 'markdown', chapter: '', source: 'lectures', missing: false },
    { path: '讲义/第一章/02-基础.md', fileName: '02-基础.md', title: '基础', order: 1, kind: 'markdown', chapter: '第一章', source: 'lectures', missing: false },
    { path: '讲义/第一章/01-引言.md', fileName: '01-引言.md', title: '引言', order: 2, kind: 'markdown', chapter: '第一章', source: 'lectures', missing: false },
    { path: '讲义/第二章/03-进阶.md', fileName: '03-进阶.md', title: '进阶', order: 1, kind: 'markdown', chapter: '第二章', source: 'lectures', missing: false },
  ]
  const ui = await mount(fakeClient({ lectures: chaptered }))
  try {
    const chapters = [...ui.directory().querySelectorAll('.lc-chapter-title')].map(node => node.textContent)
    assert.deepEqual(chapters, ['第一章', '第二章'])
    const buttons = [...ui.directory().querySelectorAll('.lc-lecture-list button')].map(button => button.textContent)
    assert.deepEqual(buttons, ['总论', '基础', '引言', '进阶'])
  } finally {
    await ui.unmount()
  }
})

test('关联已有文件后进入课程目录，可取消关联且不复制原文件', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    const linkedSection = ui.directory().querySelector('[aria-label="已关联文件"]')
    assert.ok(linkedSection)
    assert.match(linkedSection.textContent, /不复制|不移动/)

    await ui.click(findButton(linkedSection, '关联已有文件'))
    const panel = ui.directory().querySelector('[aria-label="可关联文件"]')
    assert.ok(panel)
    assert.match(panel.textContent, /资料\/旧资料\.md/)
    await ui.click(findButton(panel, '旧资料'))

    assert.deepEqual(client.calls.find(call => call.action === 'lecture-link'), {
      action: 'lecture-link',
      spaceId: space.id,
      path: '资料/旧资料.md',
    })
    assert.equal(ui.directory().querySelector('[aria-label="可关联文件"]'), null)
    const linked = ui.directory().querySelector('[aria-label="已关联文件"]')
    assert.match(linked.textContent, /旧资料/)

    await ui.click(linked.querySelector('button[aria-label="取消关联 旧资料"]'))
    assert.deepEqual(client.calls.find(call => call.action === 'lecture-unlink'), {
      action: 'lecture-unlink',
      spaceId: space.id,
      path: '资料/旧资料.md',
    })
    assert.doesNotMatch(ui.directory().querySelector('[aria-label="已关联文件"]').textContent, /旧资料/)
  } finally {
    await ui.unmount()
  }
})

test('关联文件被外部删除时目录显示缺失并禁止打开，仍可取消关联', async () => {
  const linked = [
    { path: '资料/缺失.md', fileName: '缺失.md', title: '缺失', order: null, kind: 'markdown', chapter: '资料', source: 'linked', missing: true },
  ]
  const client = fakeClient({ lectures: linked, candidates: [] })
  const ui = await mount(client)
  try {
    const row = ui.directory().querySelector('[aria-label="已关联文件"]')
    assert.match(row.textContent, /缺失.*文件缺失/)
    const openButton = [...row.querySelectorAll('button')].find(button => button.textContent.includes('缺失') && !button.textContent.includes('取消'))
    assert.equal(openButton.disabled, true)
    await ui.click(row.querySelector('button[aria-label="取消关联 缺失"]'))
    assert.deepEqual(client.calls.find(call => call.action === 'lecture-unlink').path, '资料/缺失.md')
  } finally {
    await ui.unmount()
  }
})
