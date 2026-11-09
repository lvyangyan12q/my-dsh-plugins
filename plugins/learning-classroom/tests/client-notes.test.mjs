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
  HTMLSelectElement: dom.window.HTMLSelectElement,
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
const { NotesZone } = await import('../src/notes-zone.tsx')

const space = { id: 'space-1', title: '线性代数', directory: '线性代数', notePath: '笔记/我的笔记.md', createdAt: '2026-11-09T00:00:00.000Z' }

function noteStore(initial) {
  const files = new Map(Object.entries(initial))
  const calls = []
  let saveGate = null
  let nextSaveError = null
  return {
    calls,
    files,
    set(path, content) { files.set(path, content) },
    setNextSaveError(error) { nextSaveError = error },
    gateNextSave() {
      let release
      const promise = new Promise(resolve => { release = resolve })
      saveGate = { promise }
      return () => { saveGate = null; release() }
    },
    client: {
      async load() { return { vault: { path: 'D:/知识库', status: 'ready', reason: null, hint: '' }, spaces: [space], currentSpaceId: space.id } },
      async command() { throw new Error('not used') },
      async listNotes(spaceId) {
        calls.push({ type: 'list', spaceId })
        return { notes: [...files.keys()].map(path => ({ path, name: path.split('/').pop() })), defaultPath: '笔记/我的笔记.md' }
      },
      async readNote(spaceId, path) {
        calls.push({ type: 'read', spaceId, path })
        if (!files.has(path)) {
          throw Object.assign(new Error(`笔记文件不存在：${path}`), { code: 'note-not-found' })
        }
        const content = files.get(path)
        return { path, content, version: `version:${content}`, updatedAt: '2026-11-09T00:00:00.000Z' }
      },
      async saveNote(input) {
        calls.push({ type: 'save', ...input })
        if (nextSaveError) {
          const error = nextSaveError
          nextSaveError = null
          throw error
        }
        if (saveGate) await saveGate.promise
        if (typeof input.overwrite !== 'boolean' && !files.has(input.path)) {
          throw Object.assign(new Error('笔记文件不存在'), { code: 'note-not-found' })
        }
        files.set(input.path, input.content)
        return { path: input.path, version: `version:${input.content}`, savedAt: '2026-11-09T00:01:00.000Z' }
      },
    },
  }
}

async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

async function mount(store, props = {}) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(h(NotesZone, { client: store.client, space, debounceMs: 10, ...props })) })
  await settle()
  return {
    document: dom.window.document,
    container,
    text: () => container.textContent,
    status: () => container.querySelector('[role="status"]')?.textContent ?? '',
    textarea: () => container.querySelector('textarea'),
    async type(value) {
      const editor = container.querySelector('textarea')
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set
        setter.call(editor, value)
        editor.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
      await settle(1)
    },
    async click(label) {
      const button = [...container.querySelectorAll('button')].find(row => row.textContent.includes(label))
      assert.ok(button, `找不到按钮：${label}`)
      await act(async () => { button.click() })
      await settle()
    },
    async select(value) {
      const select = container.querySelector('select[aria-label="笔记文件"]')
      assert.ok(select, '找不到笔记文件选择器')
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value').set
        setter.call(select, value)
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
      })
      await settle()
    },
    async wait(ms) {
      await act(async () => { await new Promise(resolve => setTimeout(resolve, ms)) })
      await settle()
    },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

test('打开笔记显示磁盘内容；编辑后自动保存，保存中与已保存可见', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原有内容\n' })
  const ui = await mount(store, { debounceMs: 60 })
  try {
    assert.equal(ui.textarea().value, '# 我的笔记\n\n原有内容\n')
    assert.match(ui.text(), /笔记\/我的笔记\.md/)
    assert.match(ui.status(), /已保存/)

    const release = store.gateNextSave()
    await ui.type('# 我的笔记\n\n新的理解\n')
    assert.match(ui.status(), /未保存/)
    await ui.wait(90)
    assert.match(ui.status(), /保存中/)

    const save = store.calls.find(call => call.type === 'save')
    assert.deepEqual(
      { spaceId: save.spaceId, path: save.path, content: save.content, version: save.version },
      { spaceId: 'space-1', path: '笔记/我的笔记.md', content: '# 我的笔记\n\n新的理解\n', version: 'version:# 我的笔记\n\n原有内容\n' },
    )
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 我的笔记\n\n原有内容\n', '保存完成前磁盘不应先被改写')

    release()
    await ui.wait(10)
    assert.match(ui.status(), /已保存/)
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 我的笔记\n\n新的理解\n')
  } finally {
    await ui.unmount()
  }
})

test('外部修改后保存被拒绝，界面给出「重新加载」与「用我的覆盖」，重新加载取回磁盘内容', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原文\n' })
  const ui = await mount(store)
  try {
    store.set('笔记/我的笔记.md', '# 外部版本\n', 'utf8')
    store.setNextSaveError(Object.assign(new Error('磁盘上的笔记已被外部修改，保存已被拒绝。'), { code: 'note-conflict' }))
    await ui.type('# 我的想法\n')
    await ui.wait(30)

    assert.match(ui.status(), /冲突/)
    const alert = ui.container.querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /外部修改/)
    assert.ok([...alert.querySelectorAll('button')].some(button => button.textContent.includes('重新加载')))
    assert.ok([...alert.querySelectorAll('button')].some(button => button.textContent.includes('用我的覆盖')))
    assert.equal(ui.textarea().value, '# 我的想法\n', '冲突时保留我的编辑内容')
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 外部版本\n', '冲突时磁盘文件不被覆盖')

    await ui.click('重新加载')
    assert.equal(ui.textarea().value, '# 外部版本\n')
    assert.match(ui.status(), /已保存/)
    assert.equal(ui.container.querySelector('[role="alert"]'), null)
  } finally {
    await ui.unmount()
  }
})

test('冲突后选择「用我的覆盖」才写入我的内容，并带上显式覆盖标记', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原文\n' })
  const ui = await mount(store)
  try {
    store.set('笔记/我的笔记.md', '# 外部版本\n')
    store.setNextSaveError(Object.assign(new Error('磁盘上的笔记已被外部修改，保存已被拒绝。'), { code: 'note-conflict' }))
    await ui.type('# 我的想法\n')
    await ui.wait(30)
    assert.match(ui.status(), /冲突/)

    await ui.click('用我的覆盖')
    const overwrite = store.calls.filter(call => call.type === 'save').at(-1)
    assert.equal(overwrite.overwrite, true)
    assert.equal(overwrite.content, '# 我的想法\n')
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 我的想法\n')
    assert.equal(ui.textarea().value, '# 我的想法\n')
    assert.match(ui.status(), /已保存/)
  } finally {
    await ui.unmount()
  }
})

test('保存失败时保留编辑内容并说明原因，可以重试保存', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原文\n' })
  const ui = await mount(store)
  try {
    store.setNextSaveError(Object.assign(new Error('保存失败：目录不存在（线性代数/笔记）。内容仍保留在编辑器里。'), { code: 'note-save-failed' }))
    await ui.type('# 没保存上的内容\n')
    await ui.wait(30)

    assert.equal(ui.textarea().value, '# 没保存上的内容\n')
    assert.match(ui.status(), /保存失败/)
    const alert = ui.container.querySelector('[role="alert"]')
    assert.match(alert.textContent, /目录不存在/)

    await ui.click('重试保存')
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 没保存上的内容\n')
    assert.match(ui.status(), /已保存/)
  } finally {
    await ui.unmount()
  }
})

test('可以在 笔记/ 目录下的多个 Markdown 文件之间切换', async () => {
  const store = noteStore({
    '笔记/我的笔记.md': '# 我的笔记\n',
    '笔记/第二份.md': '# 第二份\n\n另一个文件\n',
  })
  const ui = await mount(store)
  try {
    assert.equal(ui.textarea().value, '# 我的笔记\n')
    await ui.select('笔记/第二份.md')
    assert.equal(ui.textarea().value, '# 第二份\n\n另一个文件\n')
    assert.match(ui.text(), /笔记\/第二份\.md/)
    assert.equal(store.calls.filter(call => call.type === 'read').at(-1).path, '笔记/第二份.md')
    assert.match(ui.status(), /已保存/)
  } finally {
    await ui.unmount()
  }
})

test('没有成功读到笔记时编辑会显式失败，不假装保存成功', async () => {
  const store = noteStore({})
  const ui = await mount(store)
  try {
    assert.match(ui.status(), /失败|读取/)
    await ui.type('# 新想法\n')
    await ui.wait(30)
    assert.equal(ui.textarea().value, '# 新想法\n')
    assert.match(ui.status(), /保存失败/)
    assert.match(ui.container.querySelector('[role="alert"]').textContent, /无法安全保存/)
    assert.equal(store.calls.filter(call => call.type === 'save').length, 0)
  } finally {
    await ui.unmount()
  }
})
