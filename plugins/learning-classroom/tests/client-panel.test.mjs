import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
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
const { ClassroomPanel, apply, inject, panelId } = await import('../src/classroom-panel.tsx')

const unsetView = { vault: { path: null, status: 'unset', reason: null, hint: '请选择一个已存在的本地目录作为知识文件库。' }, spaces: [], currentSpaceId: null }
const readyView = { vault: { path: 'D:/知识库', status: 'ready', reason: null, hint: '' }, spaces: [], currentSpaceId: null }

function fakeClient(initial) {
  let view = structuredClone(initial)
  const calls = []
  const handlers = {
    'vault-choose': input => ({ ...view, vault: { ...view.vault, path: input.path, status: 'ready', reason: null, hint: '' } }),
    'space-create': input => {
      const space = { id: 'space-1', title: input.title, directory: input.title, notePath: '笔记/我的笔记.md', createdAt: '2026-11-09T00:00:00.000Z' }
      return { ...view, spaces: [...view.spaces, space], currentSpaceId: space.id }
    },
    'space-open': input => ({ ...view, currentSpaceId: input.spaceId }),
  }
  return {
    calls,
    async load() { return structuredClone(view) },
    async command(input) {
      calls.push(input)
      const handler = handlers[input.action]
      if (!handler) throw new Error(`未知命令：${input.action}`)
      view = handler(input)
      return structuredClone(view)
    },
    async listLectures(spaceId) {
      return { spaceId, lectures: [], selectedPath: null, missingSelection: null, folderMissing: false }
    },
    async readLecture(_spaceId, path) {
      throw new Error(`还没有讲义文件：${path}`)
    },
    async listNotes() {
      return { notes: [{ path: '笔记/我的笔记.md', name: '我的笔记.md' }], defaultPath: '笔记/我的笔记.md' }
    },
    async readNote(_spaceId, path) {
      return { path, content: '# 我的笔记\n\n', version: 'version-1', updatedAt: '2026-11-09T00:00:00.000Z' }
    },
    async saveNote(input) {
      return { path: input.path, version: 'version-2', savedAt: '2026-11-09T00:01:00.000Z' }
    },
    set(next) { view = structuredClone(next) },
  }
}

async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

async function mount(client) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(h(ClassroomPanel, { client })) })
  await settle()
  return {
    document: dom.window.document,
    text: () => container.textContent,
    async click(button) { await act(async () => { button.click() }); await settle() },
    async type(input, value) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
        setter.call(input, value)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      await settle()
    },
    async submit(form) { await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) }); await settle() },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

function findButton(document, label) {
  return [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))
}

test('未选择知识库时显示可操作空状态，不出现四区课堂', async () => {
  const client = fakeClient(unsetView)
  const ui = await mount(client)
  try {
    assert.match(ui.text(), /选择知识文件库/)
    assert.ok(ui.document.querySelector('input[aria-label="知识文件库路径"]'))
    assert.ok(findButton(ui.document, '选择此目录'))
    assert.equal(ui.document.querySelector('[aria-label="课程目录"]'), null)
    assert.equal(ui.document.querySelector('[aria-label="老师对话"]'), null)
  } finally {
    await ui.unmount()
  }
})

test('选择已存在目录后进入创建学习空间流程', async () => {
  const client = fakeClient(unsetView)
  const ui = await mount(client)
  try {
    const input = ui.document.querySelector('input[aria-label="知识文件库路径"]')
    await ui.type(input, 'D:/知识库')
    await ui.click(findButton(ui.document, '选择此目录'))
    assert.deepEqual(client.calls[0], { action: 'vault-choose', path: 'D:/知识库' })
    assert.match(ui.text(), /D:\/知识库/)
    assert.ok(ui.document.querySelector('input[aria-label="学习空间名称"]'))
  } finally {
    await ui.unmount()
  }
})

test('创建学习空间后显示四区骨架，会话服务缺失时是真实错误而不是假聊天', async () => {
  const client = fakeClient(readyView)
  const ui = await mount(client)
  try {
    const input = ui.document.querySelector('input[aria-label="学习空间名称"]')
    await ui.type(input, '线性代数')
    await ui.submit(ui.document.querySelector('form[aria-label="创建学习空间"]'))
    assert.deepEqual(client.calls[0], { action: 'space-create', title: '线性代数' })

    for (const label of ['课程目录', '讲义', '我的笔记', '老师对话']) {
      assert.ok(ui.document.querySelector(`[aria-label="${label}"]`), `${label} 区应存在`)
    }
    assert.match(ui.document.querySelector('[aria-label="讲义"]').textContent, /还没有讲义/)
    assert.match(ui.document.querySelector('[aria-label="我的笔记"]').textContent, /笔记\/我的笔记\.md/)
    const conversation = ui.document.querySelector('[aria-label="老师对话"]')
    assert.match(conversation.textContent, /老师会话服务不可用/)
    assert.doesNotMatch(conversation.textContent, /你好|我是老师|已连接/)
    assert.equal(conversation.querySelector('textarea, [contenteditable="true"]'), null)
    assert.equal(conversation.querySelector('[data-testid="composer"]'), null)
    assert.equal(ui.document.querySelectorAll('[aria-label="老师对话"]').length, 1)
  } finally {
    await ui.unmount()
  }
})

test('创建学习空间时可填写学习目标并随创建命令保存', async () => {
  const client = fakeClient(readyView)
  const ui = await mount(client)
  try {
    await ui.type(ui.document.querySelector('input[aria-label="学习空间名称"]'), '线性代数')
    await ui.type(ui.document.querySelector('input[aria-label="学习目标（可选）"]'), '会算行列式')
    await ui.submit(ui.document.querySelector('form[aria-label="创建学习空间"]'))
    assert.deepEqual(client.calls[0], { action: 'space-create', title: '线性代数', goal: '会算行列式' })
  } finally {
    await ui.unmount()
  }
})

test('操作失败时显示可操作错误而不是裸异常', async () => {
  const client = fakeClient(readyView)
  client.command = async () => { throw new Error('知识文件库目录不可写：D:/知识库') }
  const ui = await mount(client)
  try {
    await ui.type(ui.document.querySelector('input[aria-label="学习空间名称"]'), '线性代数')
    await ui.submit(ui.document.querySelector('form[aria-label="创建学习空间"]'))
    const alert = ui.document.querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /不可写/)
  } finally {
    await ui.unmount()
  }
})

test('读取状态失败时可重试', async () => {
  const client = fakeClient(unsetView)
  let attempts = 0
  const load = client.load
  client.load = async () => { if (attempts++ === 0) throw new Error('连接学习课堂失败'); return load() }
  const ui = await mount(client)
  try {
    assert.match(ui.document.querySelector('[role="alert"]').textContent, /连接学习课堂失败/)
    await ui.click(findButton(ui.document, '重试'))
    assert.match(ui.text(), /选择知识文件库/)
    assert.equal(ui.document.querySelector('[role="alert"]'), null)
  } finally {
    await ui.unmount()
  }
})

test('侧栏登记「学习课堂」，主面板使用同名 key 并声明自有 session 子 seat', async () => {
  const registrations = [], disposers = []
  const remoteSession = {
    async canOpenWorkspacePath() { return { ok: true, value: true } },
    async openWorkspacePath() { return { ok: true, value: { opened: true } } },
  }
  const ctx = {
    sessions: { async create() { return 'session-1' }, retain() { throw new Error('测试不应取得引用') } },
    get: name => (name === 'remote.session' ? remoteSession : undefined),
    slots: {
      inject: (_name, install) => install(),
      register: (spec, component) => { registrations.push({ spec, component }); return () => {} },
    },
    effect: install => { const dispose = install(); if (typeof dispose === 'function') disposers.push(dispose) },
  }
  apply(ctx)
  const sidebar = registrations.find(row => row.spec.name === 'sidebar.panellist')
  assert.ok(sidebar)
  assert.equal(sidebar.spec.id, panelId)
  assert.equal(sidebar.spec.label(), '学习课堂')
  const main = registrations.find(row => row.spec.name === 'main')
  assert.ok(main)
  assert.equal(main.spec.key, panelId)
  assert.equal(main.component, ClassroomPanel)
  // The public Client composition contract: a package that reads
  // `ctx.remote.session` must declare both `remote` and `remote.session`, and
  // its client bundle must load the Gateway/Remote/Session-controller rows first.
  assert.ok(inject.includes('remote'), `inject 缺少 remote：${inject.join('、')}`)
  assert.ok(inject.includes('remote.session'), `inject 缺少 remote.session：${inject.join('、')}`)
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const clientInject = manifest.dsh?.client?.inject ?? []
  for (const packageName of [
    '@deepseek-ai/dsh-api-gateway',
    '@deepseek-ai/dsh-api-remotes',
    '@deepseek-ai/dsh-api-session-controller',
  ]) {
    assert.ok(clientInject.includes(packageName), `dsh.client.inject 缺少 ${packageName}：${clientInject.join('、')}`)
  }
  // The main panel receives the public Remote-backed native-open seam, and its
  // capability probe reaches the documented Session Remote method.
  const injected = main.spec.inject()
  assert.deepEqual(await injected.nativeOpen.probe(), { available: true, reason: null })
  for (const dispose of disposers.reverse()) dispose()
})
