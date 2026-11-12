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

function memoryDrafts() {
  const files = new Map()
  const key = (spaceId, path) => `${spaceId}\u0000${path}`
  return {
    files,
    read(spaceId, path) { return files.get(key(spaceId, path)) ?? null },
    write(spaceId, path, draft) { files.set(key(spaceId, path), draft) },
    remove(spaceId, path) { files.delete(key(spaceId, path)) },
  }
}

async function mount(store, props = {}) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  const render = nextSpace => root.render(h(NotesZone, { client: store.client, space: nextSpace, debounceMs: 10, ...props }))
  await act(async () => { render(space) })
  await settle()
  return {
    document: dom.window.document,
    container,
    text: () => container.textContent,
    status: () => container.querySelector('[role="status"]')?.textContent ?? '',
    textarea: () => container.querySelector('textarea'),
    async rerender(nextSpace) {
      await act(async () => { render(nextSpace) })
      await settle()
    },
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
    const compare = ui.container.querySelector('[aria-label="保存冲突比较"]')
    assert.ok(compare, '冲突时展示双方内容')
    assert.match(compare.querySelector('[aria-label="我的编辑内容"]').textContent, /我的想法/)
    assert.match(compare.querySelector('[aria-label="磁盘上的内容"]').textContent, /外部版本/)
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

test('显式覆盖失败时仍保留我的输入和磁盘上的原版本，可再次处理', async () => {
  const drafts = memoryDrafts()
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原文\n' })
  const ui = await mount(store, { drafts })
  try {
    store.set('笔记/我的笔记.md', '# 外部版本\n')
    store.setNextSaveError(Object.assign(new Error('磁盘上的笔记已被外部修改，保存已被拒绝。'), { code: 'note-conflict' }))
    await ui.type('# 我的想法\n')
    await ui.wait(30)
    assert.match(ui.status(), /冲突/)

    store.setNextSaveError(Object.assign(new Error('保存失败：磁盘暂时不可写。'), { code: 'note-save-failed' }))
    await ui.click('用我的覆盖')

    assert.equal(ui.textarea().value, '# 我的想法\n', '覆盖失败不丢输入')
    assert.match(ui.status(), /保存失败/)
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 外部版本\n', '覆盖失败不动磁盘')
    assert.match(ui.container.textContent, /磁盘暂时不可写/)
    assert.ok(drafts.read('space-1', '笔记/我的笔记.md'), '覆盖失败留下可恢复草稿')
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

test('编辑与预览共用同一正文：预览渲染当前未保存的修改，切回编辑内容不变', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原文\n' })
  const ui = await mount(store)
  try {
    const edited = '# 我的笔记\n\n## 新小节\n\n**加粗的理解**，还有 `代码`。\n\n- 第一点\n- 第二点\n'
    await ui.type(edited)
    await ui.click('预览')

    const preview = ui.container.querySelector('[aria-label="笔记预览"]')
    assert.ok(preview, '预览区应存在')
    assert.match(preview.textContent, /新小节/)
    assert.equal(preview.querySelector('h4')?.textContent, '新小节')
    assert.equal(preview.querySelector('strong')?.textContent, '加粗的理解')
    assert.equal(preview.querySelector('code')?.textContent, '代码')
    assert.equal(preview.querySelectorAll('li').length, 2)
    assert.doesNotMatch(preview.textContent, /## 新小节/)
    assert.equal(ui.textarea(), null, '预览时不显示原始编辑框')

    await ui.click('编辑')
    assert.equal(ui.textarea().value, edited, '预览不改变正文')
  } finally {
    await ui.unmount()
  }
})

test('保存进行中继续编辑：第二个保存排队，前一个完成后才发，磁盘最终是最新正文', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原文\n' })
  const ui = await mount(store)
  try {
    const release = store.gateNextSave()
    await ui.type('# 第一次修改\n')
    await ui.wait(30)
    assert.match(ui.status(), /保存中/)

    await ui.type('# 第二次修改\n')
    await ui.wait(30)
    assert.equal(store.calls.filter(call => call.type === 'save').length, 1, '前一个保存未完成时不应开始第二个')

    release()
    await ui.wait(60)
    const saves = store.calls.filter(call => call.type === 'save')
    assert.deepEqual(saves.map(call => call.content), ['# 第一次修改\n', '# 第二次修改\n'])
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 第二次修改\n')
    assert.match(ui.status(), /已保存/)
  } finally {
    await ui.unmount()
  }
})

test('保存失败后切换文件：我的输入不丢，切回来恢复为可保存的草稿', async () => {
  const drafts = memoryDrafts()
  const store = noteStore({
    '笔记/我的笔记.md': '# 我的笔记\n\n原文\n',
    '笔记/第二份.md': '# 第二份\n\n另一个文件\n',
  })
  const ui = await mount(store, { drafts })
  try {
    store.setNextSaveError(Object.assign(new Error('保存失败：磁盘暂时不可写。'), { code: 'note-save-failed' }))
    await ui.type('# 我的笔记\n\n未保存的修改\n')
    await ui.wait(30)
    assert.match(ui.status(), /保存失败/)

    await ui.select('笔记/第二份.md')
    assert.equal(ui.textarea().value, '# 第二份\n\n另一个文件\n')
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 我的笔记\n\n原文\n', '失败时磁盘保持原样')

    await ui.select('笔记/我的笔记.md')
    assert.equal(ui.textarea().value, '# 我的笔记\n\n未保存的修改\n', '切回来恢复草稿')
    assert.match(ui.text(), /草稿/)
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 我的笔记\n\n原文\n')
  } finally {
    await ui.unmount()
  }
})

test('离开课堂时保存失败：重新进入仍恢复未保存的输入', async () => {
  const drafts = memoryDrafts()
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原文\n' })
  const first = await mount(store, { drafts })
  store.setNextSaveError(Object.assign(new Error('保存失败：磁盘暂时不可写。'), { code: 'note-save-failed' }))
  await first.type('# 我的笔记\n\n离开前没保存上的内容\n')
  await first.wait(30)
  assert.match(first.status(), /保存失败/)
  await first.unmount()

  const second = await mount(store, { drafts })
  try {
    assert.equal(second.textarea().value, '# 我的笔记\n\n离开前没保存上的内容\n')
    assert.match(second.text(), /草稿/)
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 我的笔记\n\n原文\n')
  } finally {
    await second.unmount()
  }
})

test('切换学习主题：两个主题的草稿互不串，回到原主题可恢复', async () => {
  const drafts = memoryDrafts()
  const otherSpace = { ...space, id: 'space-2', title: '概率论', directory: '概率论', notePath: '笔记/概率笔记.md' }
  const store = noteStore({
    '笔记/我的笔记.md': '# 我的笔记\n\n原文\n',
    '笔记/概率笔记.md': '# 概率笔记\n\n主题二原文\n',
  })
  const ui = await mount(store, { drafts })
  try {
    store.setNextSaveError(Object.assign(new Error('保存失败：磁盘暂时不可写。'), { code: 'note-save-failed' }))
    await ui.type('# 我的笔记\n\n主题一未保存\n')
    await ui.wait(30)
    assert.match(ui.status(), /保存失败/)

    await ui.rerender(otherSpace)
    assert.equal(ui.textarea().value, '# 概率笔记\n\n主题二原文\n')
    assert.doesNotMatch(ui.text(), /主题一未保存/)

    await ui.rerender(space)
    assert.equal(ui.textarea().value, '# 我的笔记\n\n主题一未保存\n')
    assert.match(ui.text(), /草稿/)
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 我的笔记\n\n原文\n')
    assert.equal(store.files.get('笔记/概率笔记.md'), '# 概率笔记\n\n主题二原文\n')
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
