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

const otherSpace = {
  id: 'space-2',
  title: '线性代数',
  directory: '线性代数',
  notePath: '笔记/我的笔记.md',
  createdAt: '2026-11-10T00:00:00.000Z',
  lecturePath: null,
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
  '',
  '[打开实验](讲义/03-实验.html)',
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
      experiment: null,
      experimentError: null,
      sources: [],
      parameters: [],
      version: 'v-article',
    },
    '讲义/01-先讲.md': {
      spaceId: space.id,
      path: '讲义/01-先讲.md',
      fileName: '01-先讲.md',
      title: '先讲',
      kind: 'markdown',
      content: '# 先讲内容\n\n第一节正文。',
      experiment: null,
      experimentError: null,
      sources: [],
      parameters: [],
      version: 'v-first',
    },
    '讲义/03-实验.html': {
      spaceId: space.id,
      path: '讲义/03-实验.html',
      fileName: '03-实验.html',
      title: '实验',
      kind: 'experiment',
      content: null,
      experiment: {
        format: 'learning-experiment/v1',
        title: '实验',
        sources: ['《概率论》第 2 章'],
        parameters: [{ name: 'prior', label: '先验概率', min: 0, max: 1, step: 0.01, default: 0.5, unit: '' }],
        readouts: [{ name: 'posterior', label: '后验概率', unit: '', decimals: 2, ast: { kind: 'param', name: 'prior' } }],
        render: {
          kind: 'line',
          xParameter: 'prior',
          samples: 32,
          xLabel: '先验概率',
          yLabel: '后验概率',
          series: [{ label: '后验', color: '#0969da', ast: { kind: 'param', name: 'prior' } }],
        },
      },
      experimentError: null,
      sources: ['《概率论》第 2 章'],
      parameters: [{ name: 'prior', label: '先验概率', min: 0, max: 1, step: 0.01, default: 0.5, unit: '' }],
      version: null,
    },
  }
}

function fakeClient(options = {}) {
  const calls = []
  let selectedPath = options.selectedPath ?? null
  let missingSelection = options.missingSelection ?? null
  let lectureRows = structuredClone(options.lectures ?? lectures)
  let candidateFiles = structuredClone(options.candidates ?? defaultCandidates)
  const spaces = structuredClone(options.spaces ?? [space])
  let currentSpaceId = options.currentSpaceId ?? space.id
  const topics = structuredClone(options.topics ?? { [space.id]: options.topic ?? defaultTopic })
  const docs = options.docs ?? docsFor()
  const view = () => ({ ...structuredClone(readyView), spaces: structuredClone(spaces), currentSpaceId })
  const listView = () => ({
    spaceId: space.id,
    lectures: structuredClone(lectureRows),
    selectedPath,
    missingSelection,
    folderMissing: options.folderMissing ?? false,
  })
  return {
    calls,
    async load() { return view() },
    async command(input) {
      calls.push(input)
      if (input.action === 'space-open') currentSpaceId = input.spaceId
      return view()
    },
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
      const topic = topics[spaceId]
      if (topic === undefined) throw new ClassroomClientError('space-not-found', `学习空间不存在：${spaceId}`, 409)
      return structuredClone(topic)
    },
    async saveTopicGoal(input) {
      calls.push(input)
      if (options.saveTopicError) throw options.saveTopicError
      const topic = topics[input.spaceId] ?? { ...defaultTopic, spaceId: input.spaceId }
      const next = { ...topic, goal: input.goal, version: `version-goal-${input.spaceId}-saved`, fileMissing: false }
      topics[input.spaceId] = next
      return structuredClone(next)
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

test('HTML 实验在最小沙箱 iframe 中运行，CSP 禁止宿主、文件与网络，参数和来源可读', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '实验'))
    const reader = ui.reader()
    const frame = reader.querySelector('iframe')
    assert.ok(frame, '实验必须用 iframe 隔离，而不是把 HTML 注入主文档')
    assert.equal(frame.getAttribute('sandbox'), 'allow-scripts')
    assert.doesNotMatch(frame.getAttribute('sandbox') ?? '', /allow-same-origin|allow-forms|allow-popups|allow-top-navigation/)
    assert.equal(frame.getAttribute('referrerpolicy'), 'no-referrer')
    const srcdoc = frame.getAttribute('srcdoc') ?? ''
    assert.match(srcdoc, /Content-Security-Policy/)
    assert.match(srcdoc, /default-src 'none'/)
    assert.match(srcdoc, /connect-src 'none'/)
    assert.match(srcdoc, /canvas/)
    assert.match(srcdoc, /const SPEC = /)
    assert.doesNotMatch(srcdoc, /D:\/知识库|笔记\/我的笔记\.md|沙箱外/, '实验文档里不能带宿主路径或笔记内容')
    assert.equal(reader.querySelector('script'), null, '实验脚本不能进入课堂主文档')

    assert.match(reader.textContent, /沙箱|可信 runtime/)
    assert.match(reader.textContent, /先验概率/)
    assert.match(reader.textContent, /0.*1/)
    assert.match(reader.textContent, /《概率论》第 2 章/)
  } finally {
    await ui.unmount()
  }
})

test('从讲义链接进入实验后可以返回原讲义，并恢复阅读位置', async () => {
  const client = fakeClient()
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '后讲'))
    const pane = ui.reader()
    pane.scrollTop = 140

    const link = [...pane.querySelectorAll('a')].find(anchor => anchor.textContent === '打开实验')
    assert.ok(link, '讲义里的实验链接应可点击')
    await ui.click(link)

    assert.equal(pane.querySelector('iframe')?.getAttribute('sandbox'), 'allow-scripts')
    assert.deepEqual(client.calls.filter(call => call.action === 'lecture-read').at(-1), {
      action: 'lecture-read',
      spaceId: space.id,
      path: '讲义/03-实验.html',
    })
    const back = findButton(pane, '返回讲义')
    assert.ok(back, '从讲义进入实验后必须能返回')
    assert.match(back.textContent, /后讲/)

    await ui.click(back)
    assert.match(pane.textContent, /样本空间是/)
    assert.equal(pane.querySelector('iframe'), null)
    assert.equal(pane.scrollTop, 140, '返回讲义后应恢复原阅读位置')
  } finally {
    await ui.unmount()
  }
})

test('实验读取失败时显示可操作错误，不假装运行', async () => {
  const docs = docsFor()
  delete docs['讲义/03-实验.html']
  const client = fakeClient({ docs })
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '实验'))
    const reader = ui.reader()
    assert.equal(reader.querySelector('iframe'), null)
    const alert = reader.querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /03-实验\.html|不存在|删除/)
    assert.ok(findButton(alert, '重新加载目录'))
  } finally {
    await ui.unmount()
  }
})

test('旧式任意脚本实验只显示不执行提示与路径，不创建 iframe', async () => {
  const docs = docsFor()
  docs['讲义/03-实验.html'] = {
    ...docs['讲义/03-实验.html'],
    experiment: null,
    experimentError: '这是旧式任意 HTML/脚本实验，当前版本不执行它；请保留原文件，并让老师重新生成声明式实验。',
    sources: [],
    parameters: [],
  }
  const ui = await mount(fakeClient({ docs }))
  try {
    await ui.click(findButton(ui.directory(), '实验'))
    const reader = ui.reader()
    assert.equal(reader.querySelector('iframe'), null)
    const alert = reader.querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /旧式|任意|脚本|不执行/)
    assert.match(alert.textContent, /03-实验\.html/)
    assert.match(alert.textContent, /重新生成/)
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

const otherTopic = {
  ...defaultTopic,
  spaceId: otherSpace.id,
  title: otherSpace.title,
  goal: '线代主题目标。',
  version: 'version-goal-linalg',
}

function twoTopicClient(options = {}) {
  return fakeClient({
    spaces: [space, otherSpace],
    topics: {
      [space.id]: structuredClone(defaultTopic),
      [otherSpace.id]: structuredClone(otherTopic),
    },
    ...options,
  })
}

async function switchSpace(ui, title) {
  await ui.click(findButton(ui.directory(), title))
}

test('切换主题再返回时保留未保存的目标草稿，另一个主题不串内容', async () => {
  const client = twoTopicClient()
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '编辑目标'))
    const area = ui.directory().querySelector('textarea[aria-label="学习目标内容"]')
    await ui.setTextarea(area, '概率论未保存草稿')

    await switchSpace(ui, otherSpace.title)
    assert.match(ui.directory().textContent, /线代主题目标/)
    assert.equal(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), null)

    await switchSpace(ui, space.title)
    const restored = ui.directory().querySelector('textarea[aria-label="学习目标内容"]')
    assert.ok(restored, '返回原主题后应恢复编辑状态')
    assert.equal(restored.value, '概率论未保存草稿')
  } finally {
    await ui.unmount()
  }
})

test('保存 pending 时切换主题：新主题目标表单可用，旧请求结束后状态不串', async () => {
  const client = twoTopicClient()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const realSave = client.saveTopicGoal.bind(client)
  client.saveTopicGoal = async input => { await gate; return realSave(input) }
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '编辑目标'))
    await ui.setTextarea(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), '保存中的草稿')
    await ui.click(findButton(ui.directory(), '保存目标'))
    assert.equal(ui.directory().querySelector('textarea[aria-label="学习目标内容"]').disabled, true)

    await switchSpace(ui, otherSpace.title)
    const editOther = findButton(ui.directory(), '编辑目标')
    assert.ok(editOther)
    assert.equal(editOther.disabled, false, '旧请求未完成不能禁用新主题的目标编辑')

    release()
    await settle()

    await ui.click(findButton(ui.directory(), '编辑目标'))
    const area = ui.directory().querySelector('textarea[aria-label="学习目标内容"]')
    assert.ok(area)
    assert.equal(area.disabled, false)
    await ui.setTextarea(area, '线代新目标')
    await ui.click(findButton(ui.directory(), '保存目标'))
    assert.equal(client.calls.some(call => call.action === 'topic-save' && call.spaceId === otherSpace.id), true)
  } finally {
    await ui.unmount()
  }
})

test('保存 pending 后失败时切换主题：新主题不被禁用，且在后续保存恢复', async () => {
  const client = twoTopicClient()
  let rejectGate
  const gate = new Promise((_resolve, reject) => { rejectGate = reject })
  const realSave = client.saveTopicGoal.bind(client)
  let first = true
  client.saveTopicGoal = async input => {
    if (first) { first = false; await gate }
    return realSave(input)
  }
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '编辑目标'))
    await ui.setTextarea(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), '会失败的草稿')
    await ui.click(findButton(ui.directory(), '保存目标'))

    await switchSpace(ui, otherSpace.title)
    rejectGate(new Error('保存请求失败'))
    await settle()

    const editOther = findButton(ui.directory(), '编辑目标')
    assert.ok(editOther)
    assert.equal(editOther.disabled, false)
    await ui.click(editOther)
    await ui.setTextarea(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), '失败后再保存')
    await ui.click(findButton(ui.directory(), '保存目标'))
    assert.equal(client.calls.some(call => call.action === 'topic-save' && call.spaceId === otherSpace.id), true)
  } finally {
    await ui.unmount()
  }
})

test('保存 pending 时刷新目录不清草稿，请求结束后可以再次保存', async () => {
  const client = twoTopicClient()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const realSave = client.saveTopicGoal.bind(client)
  client.saveTopicGoal = async input => { await gate; return realSave(input) }
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '编辑目标'))
    await ui.setTextarea(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), '刷新期间的草稿')
    await ui.click(findButton(ui.directory(), '保存目标'))

    await ui.click(findButton(ui.directory(), '刷新目录'))
    const during = ui.directory().querySelector('textarea[aria-label="学习目标内容"]')
    assert.ok(during, '刷新不得移除正在编辑的目标表单')
    assert.equal(during.value, '刷新期间的草稿')

    release()
    await settle()
    // The completed save closes the editor; the same topic can be edited and saved again.
    const edit = findButton(ui.directory(), '编辑目标')
    assert.ok(edit)
    assert.equal(edit.disabled, false)
    await ui.click(edit)
    await ui.click(findButton(ui.directory(), '保存目标'))
    assert.equal(client.calls.filter(call => call.action === 'topic-save').length, 2)
  } finally {
    await ui.unmount()
  }
})

test('刷新目录时磁盘目标已更新：保留草稿并提示，不静默替换', async () => {
  const topics = { [space.id]: structuredClone(defaultTopic) }
  const client = fakeClient({ topics })
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '编辑目标'))
    await ui.setTextarea(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), '我的本地草稿')
    topics[space.id] = { ...defaultTopic, goal: 'Obsidian 新目标', version: 'version-goal-2' }

    await ui.click(findButton(ui.directory(), '刷新目录'))
    const area = ui.directory().querySelector('textarea[aria-label="学习目标内容"]')
    assert.ok(area)
    assert.equal(area.value, '我的本地草稿')
    assert.match(ui.directory().querySelector('[aria-label="学习目标"]').textContent, /磁盘.*更新|草稿.*保留/)
  } finally {
    await ui.unmount()
  }
})

test('目标冲突后只有显式重新加载才替换草稿，并说明会放弃修改', async () => {
  const conflict = new ClassroomClientError('topic-conflict', '学习目标文件已被外部修改，保存已被拒绝。请重新加载后再保存。', 409)
  const client = fakeClient({ saveTopicError: conflict })
  const ui = await mount(client)
  try {
    const goal = () => ui.directory().querySelector('[aria-label="学习目标"]')
    await ui.click(findButton(goal(), '编辑目标'))
    await ui.setTextarea(goal().querySelector('textarea[aria-label="学习目标内容"]'), '冲突时保留的草稿')
    await ui.click(findButton(goal(), '保存目标'))

    assert.equal(goal().querySelector('textarea[aria-label="学习目标内容"]').value, '冲突时保留的草稿')
    const reload = findButton(goal(), '重新加载目标')
    assert.ok(reload, '冲突后必须提供显式的重新加载动作')
    assert.match(reload.textContent, /放弃|重新加载/)

    await ui.click(reload)
    const loaded = goal().querySelector('textarea[aria-label="学习目标内容"]')
    assert.equal(loaded.value, defaultTopic.goal)
    assert.equal(goal().querySelector('[role="alert"]'), null)
  } finally {
    await ui.unmount()
  }
})

test('A 保存成功不会作废 B 正在读取的目标（旧主题不污染当前加载令牌）', async () => {
  const client = twoTopicClient()
  let releaseSave, releaseRead
  const saveGate = new Promise(resolve => { releaseSave = resolve })
  const readGate = new Promise(resolve => { releaseRead = resolve })
  const realSave = client.saveTopicGoal.bind(client)
  const realRead = client.readTopic.bind(client)
  let firstReadOfB = true
  client.saveTopicGoal = async input => { await saveGate; return realSave(input) }
  client.readTopic = async spaceId => {
    if (spaceId === otherSpace.id && firstReadOfB) {
      firstReadOfB = false
      await readGate
    }
    return realRead(spaceId)
  }
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '编辑目标'))
    await ui.setTextarea(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), 'A 主题保存中')
    await ui.click(findButton(ui.directory(), '保存目标'))

    await switchSpace(ui, otherSpace.title)
    assert.match(ui.directory().textContent, /正在读取学习目标/)

    releaseSave()
    await settle()
    // A's late success must leave B's pending read alive.
    releaseRead()
    await settle()
    const goalText = ui.directory().querySelector('[aria-label="学习目标"]').textContent
    assert.match(goalText, /线代主题目标/)
    assert.doesNotMatch(goalText, /正在读取学习目标/)
  } finally {
    await ui.unmount()
  }
})

test('A、B 两个保存都 pending 时回 A：A 仍 busy，结束只清自己提交版本的草稿', async () => {
  const client = twoTopicClient()
  const gates = {}
  const released = {
    [space.id]: () => {},
    [otherSpace.id]: () => {},
  }
  for (const id of [space.id, otherSpace.id]) {
    gates[id] = new Promise(resolve => { released[id] = resolve })
  }
  const realSave = client.saveTopicGoal.bind(client)
  client.saveTopicGoal = async input => { await gates[input.spaceId]; return realSave(input) }
  const ui = await mount(client)
  try {
    await ui.click(findButton(ui.directory(), '编辑目标'))
    await ui.setTextarea(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), 'A 提交草稿')
    await ui.click(findButton(ui.directory(), '保存目标'))

    await switchSpace(ui, otherSpace.title)
    await ui.click(findButton(ui.directory(), '编辑目标'))
    await ui.setTextarea(ui.directory().querySelector('textarea[aria-label="学习目标内容"]'), 'B 提交草稿')
    await ui.click(findButton(ui.directory(), '保存目标'))

    // Back on A while its own request is still pending: it is still owned and busy.
    await switchSpace(ui, space.title)
    const areaA = ui.directory().querySelector('textarea[aria-label="学习目标内容"]')
    assert.ok(areaA)
    assert.equal(areaA.disabled, true, 'A 自己的保存仍 pending 时不能编辑新草稿')
    assert.equal(areaA.value, 'A 提交草稿')

    released[space.id]()
    await settle()
    assert.match(ui.directory().querySelector('[aria-label="学习目标"]').textContent, /A 提交草稿/)
    assert.equal(findButton(ui.directory(), '编辑目标').disabled, false)

    // B's request is still owned by B, not cleared by A's success.
    await switchSpace(ui, otherSpace.title)
    const areaB = ui.directory().querySelector('textarea[aria-label="学习目标内容"]')
    assert.ok(areaB)
    assert.equal(areaB.disabled, true)
    released[otherSpace.id]()
    await settle()
    assert.match(ui.directory().querySelector('[aria-label="学习目标"]').textContent, /B 提交草稿/)
  } finally {
    await ui.unmount()
  }
})
