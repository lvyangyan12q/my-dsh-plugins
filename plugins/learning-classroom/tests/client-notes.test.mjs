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
const { createSessionDraftStore } = await import('../src/note-drafts.ts')

const space = { id: 'space-1', title: '线性代数', directory: '线性代数', notePath: '笔记/我的笔记.md', createdAt: '2026-11-09T00:00:00.000Z' }

function noteStore(initial) {
  const files = new Map(Object.entries(initial))
  const calls = []
  const saveGates = []
  const saveErrors = []
  let readGate = null
  let nextReadError = null
  return {
    calls,
    files,
    set(path, content) { files.set(path, content) },
    setNextSaveError(error) { saveErrors.push(error) },
    setNextReadError(error) { nextReadError = error },
    gateNextSave() {
      let release
      const promise = new Promise(resolve => { release = resolve })
      const gate = { promise }
      saveGates.push(gate)
      return () => {
        const index = saveGates.indexOf(gate)
        if (index >= 0) saveGates.splice(index, 1)
        release()
      }
    },
    gateNextRead() {
      let release
      const promise = new Promise(resolve => { release = resolve })
      readGate = { promise }
      return () => { readGate = null; release() }
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
        // Snapshot the disk state before the optional delay, like a real read
        // that started before a concurrent save completed.
        const content = files.get(path)
        const snapshot = { path, content, version: `version:${content}`, updatedAt: '2026-11-09T00:00:00.000Z' }
        if (readGate) {
          const gate = readGate
          readGate = null
          await gate.promise
        }
        if (nextReadError) {
          const error = nextReadError
          nextReadError = null
          throw error
        }
        return snapshot
      },
      async saveNote(input) {
        calls.push({ type: 'save', ...input })
        if (saveGates.length > 0) {
          const gate = saveGates.shift()
          await gate.promise
        }
        if (saveErrors.length > 0) {
          const error = saveErrors.shift()
          throw error
        }
        if (input.overwrite !== true) {
          if (!files.has(input.path)) {
            throw Object.assign(new Error('笔记文件不存在'), { code: 'note-not-found' })
          }
          // The fake must enforce the real contract: the save carries the
          // version it expects, and a stale version is a real conflict.
          if (input.version !== `version:${files.get(input.path)}`) {
            throw Object.assign(new Error('磁盘上的笔记已被外部修改，保存已被拒绝。'), { code: 'note-conflict' })
          }
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
    write(spaceId, path, draft) {
      const storageKey = key(spaceId, path)
      const existing = files.get(storageKey)
      if (existing !== undefined && draft.revision <= (existing.revision ?? 0)) return 'stale'
      files.set(storageKey, draft)
      return 'memory'
    },
    remove(spaceId, path) { files.delete(key(spaceId, path)) },
  }
}

async function mount(store, props = {}) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  // Every mount gets its own draft store unless a test explicitly shares one,
  // so failures in one test cannot leak into the next.
  const draftStore = props.drafts ?? memoryDrafts()
  const initialSpace = props.space ?? space
  const { drafts: _sharedDrafts, space: _overrideSpace, ...rest } = props
  const render = nextSpace => root.render(h(NotesZone, { client: store.client, space: nextSpace, debounceMs: 10, ...rest, drafts: draftStore }))
  await act(async () => { render(initialSpace) })
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

test('草稿基于旧磁盘版本时：恢复为显式冲突，不把旧草稿绑到新版本自动覆盖外部修改', async () => {
  const drafts = memoryDrafts()
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原始\n' })
  const first = await mount(store, { drafts })
  store.setNextSaveError(Object.assign(new Error('保存失败：磁盘暂时不可写。'), { code: 'note-save-failed' }))
  await first.type('# 我的笔记\n\n我的旧草稿\n')
  await first.wait(30)
  assert.match(first.status(), /保存失败/)
  await first.unmount()

  // External editor moved the file on after the draft was parked.
  store.set('笔记/我的笔记.md', '# 外部新版本\n')
  const savesBeforeReentry = store.calls.filter(call => call.type === 'save').length

  let secondLive = true
  const second = await mount(store, { drafts })
  try {
    assert.match(second.status(), /冲突/)
    const compare = second.container.querySelector('[aria-label="保存冲突比较"]')
    assert.ok(compare, '恢复旧草稿时应展示双方内容')
    assert.match(compare.querySelector('[aria-label="我的编辑内容"]').textContent, /我的旧草稿/)
    assert.match(compare.querySelector('[aria-label="磁盘上的内容"]').textContent, /外部新版本/)
    assert.equal(second.textarea().value, '# 我的笔记\n\n我的旧草稿\n', '本地草稿仍可比较')
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 外部新版本\n', '未确认前不覆盖外部修改')

    await second.wait(40)
    assert.equal(store.calls.filter(call => call.type === 'save').length, savesBeforeReentry, '冲突草稿不得自动保存')
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 外部新版本\n')

    // Editing while comparing and leaving must not rebind the draft to the
    // external disk version; it has to come back as the same explicit conflict.
    const edited = '# 我的笔记\n\n我的旧草稿\n\n继续补充\n'
    await second.type(edited)
    await second.unmount()
    secondLive = false

    const savesBeforeThirdEntry = store.calls.filter(call => call.type === 'save').length
    const third = await mount(store, { drafts })
    try {
      assert.match(third.status(), /冲突/, '冲突中继续编辑后再进入仍是冲突')
      assert.equal(third.textarea().value, edited)
      assert.match(third.container.querySelector('[aria-label="磁盘上的内容"]').textContent, /外部新版本/)
      await third.wait(40)
      assert.equal(store.calls.filter(call => call.type === 'save').length, savesBeforeThirdEntry, '不得绕过冲突自动保存')
      assert.equal(store.files.get('笔记/我的笔记.md'), '# 外部新版本\n')

      await third.click('用我的覆盖')
      assert.equal(store.files.get('笔记/我的笔记.md'), edited)
      assert.match(third.status(), /已保存/)
    } finally {
      await third.unmount()
    }
  } finally {
    if (secondLive) await second.unmount()
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

test('切到加载失败的笔记：清空上一文件的正文与版本，不用 A 的正文写 B', async () => {
  const drafts = memoryDrafts()
  const store = noteStore({
    '笔记/我的笔记.md': '# A 的正文\n',
    '笔记/损坏.md': '# B 的磁盘正文\n',
  })
  const ui = await mount(store, { drafts })
  try {
    const originalRead = store.client.readNote
    let brokenRead = true
    store.client.readNote = async (spaceId, path) => {
      if (brokenRead && path === '笔记/损坏.md') {
        throw Object.assign(new Error('无法读取损坏.md'), { code: 'note-not-found' })
      }
      return originalRead(spaceId, path)
    }

    await ui.select('笔记/损坏.md')
    assert.match(ui.status(), /失败/)
    assert.equal(ui.textarea().value, '', '加载失败时不得把 A 的正文显示在新路径下')
    assert.equal(ui.container.querySelector('.lc-note-file').textContent, '笔记/损坏.md')

    const savesBefore = store.calls.filter(call => call.type === 'save').length
    await ui.click('保存')
    assert.equal(store.calls.filter(call => call.type === 'save').length, savesBefore, '没有 B 的版本不能写 B')
    assert.equal(store.files.get('笔记/损坏.md'), '# B 的磁盘正文\n', 'B 的磁盘内容不被 A 覆盖')

    await ui.select('笔记/我的笔记.md')
    assert.equal(ui.textarea().value, '# A 的正文\n')
    assert.match(ui.status(), /已保存/)

    // The failed load must not have parked an empty draft that would later
    // look like a conflict for the healthy file.
    brokenRead = false
    await ui.select('笔记/损坏.md')
    assert.equal(ui.textarea().value, '# B 的磁盘正文\n')
    assert.match(ui.status(), /已保存/)
    assert.equal(ui.container.querySelector('[aria-label="保存冲突比较"]'), null)
  } finally {
    await ui.unmount()
  }
})

test('冲突比较尚在读取或读取失败时禁用覆盖；重试读出双方内容后才允许覆盖', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 原始\n' })
  const ui = await mount(store)
  try {
    store.set('笔记/我的笔记.md', '# 外部版本\n')
    store.setNextSaveError(Object.assign(new Error('磁盘上的笔记已被外部修改，保存已被拒绝。'), { code: 'note-conflict' }))
    const releaseRead = store.gateNextRead()
    await ui.type('# 我的想法\n')
    await ui.wait(30)

    const overwrite = () => [...ui.container.querySelectorAll('button')].find(button => button.textContent.includes('用我的覆盖'))
    assert.match(ui.status(), /冲突/)
    assert.equal(overwrite().disabled, true, '磁盘版本未读出前不能覆盖')
    assert.match(ui.container.querySelector('[aria-label="磁盘上的内容"]').textContent, /正在读取/)

    store.setNextReadError(Object.assign(new Error('磁盘暂时无法读取'), { code: 'note-read-failed' }))
    releaseRead()
    await ui.wait(30)
    assert.equal(overwrite().disabled, true, '比较读取失败时不能覆盖')
    assert.match(ui.container.querySelector('[aria-label="磁盘上的内容"]').textContent, /磁盘暂时无法读取/)

    await ui.click('重试读取磁盘版本')
    assert.equal(overwrite().disabled, false, '双方内容都读出后才允许覆盖')
    assert.match(ui.container.querySelector('[aria-label="磁盘上的内容"]').textContent, /外部版本/)
    assert.match(ui.container.querySelector('[aria-label="我的编辑内容"]').textContent, /我的想法/)

    await ui.click('用我的覆盖')
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 我的想法\n')
  } finally {
    await ui.unmount()
  }
})

test('曾成功读 B 后再读失败：空版本请求不得用 map 里的旧版本把 B 清空', async () => {
  const drafts = memoryDrafts()
  const noteSpace = { ...space, id: 'space-revive', notePath: '笔记/A.md' }
  const store = noteStore({
    '笔记/A.md': '# A 的正文\n',
    '笔记/B.md': '# B 的磁盘正文\n',
  })
  const ui = await mount(store, { drafts, space: noteSpace })
  try {
    // A real successful read of B puts VB in the per-file version map.
    await ui.select('笔记/B.md')
    assert.equal(ui.textarea().value, '# B 的磁盘正文\n')
    await ui.select('笔记/A.md')
    assert.equal(ui.textarea().value, '# A 的正文\n')

    // Now B becomes unreadable; the editor is empty and has no version.
    const originalRead = store.client.readNote
    store.client.readNote = async (spaceId, path) => {
      if (path === '笔记/B.md') throw Object.assign(new Error('无法读取 B.md'), { code: 'note-not-found' })
      return originalRead(spaceId, path)
    }
    await ui.select('笔记/B.md')
    assert.match(ui.status(), /失败/)
    assert.equal(ui.textarea().value, '')

    const savesBefore = store.calls.filter(call => call.type === 'save').length
    await ui.click('保存')
    assert.equal(store.calls.filter(call => call.type === 'save').length, savesBefore, '无成功读取身份的请求不得进入保存队列')
    assert.equal(store.files.get('笔记/B.md'), '# B 的磁盘正文\n', '不得用 map 旧版本把 B 清空')
    assert.match(ui.status(), /保存失败/)
  } finally {
    await ui.unmount()
  }
})

test('旧 A 保存失败晚到不得覆盖切换时留下的更新草稿', async () => {
  const drafts = memoryDrafts()
  const noteSpace = { ...space, id: 'space-race-draft', notePath: '笔记/A.md' }
  const store = noteStore({
    '笔记/A.md': '# A 的正文\n',
    '笔记/B.md': '# B 的正文\n',
  })
  const ui = await mount(store, { drafts, space: noteSpace })
  try {
    const releaseX = store.gateNextSave()
    const releaseY = store.gateNextSave()
    store.setNextSaveError(Object.assign(new Error('X 保存失败'), { code: 'note-save-failed' }))

    await ui.type('# A 的正文\n\nX 旧内容\n')
    await ui.wait(30)
    assert.match(ui.status(), /保存中/)

    await ui.type('# A 的正文\n\nY 新内容\n')
    await ui.select('笔记/B.md')
    assert.equal(ui.textarea().value, '# B 的正文\n')

    // X fails after the newer Y draft was parked. Its older snapshot must not
    // replace Y; the queued Y write is gated so this is a draft-only race.
    releaseX()
    await ui.wait(30)

    await ui.select('笔记/A.md')
    assert.equal(ui.textarea().value, '# A 的正文\n\nY 新内容\n', '重进 A 恢复的是 Y 草稿而不是旧 X')

    releaseY()
    await ui.wait(40)
    assert.equal(ui.textarea().value, '# A 的正文\n\nY 新内容\n')
    assert.notEqual(store.files.get('笔记/A.md'), '# A 的正文\n\nX 旧内容\n', '磁盘不得留下旧 X 的快照覆盖')
  } finally {
    await ui.unmount()
  }
})

test('旧 A 保存成功在 A 重新读取期间不得污染新 view，并让读取重同步到新版本', async () => {
  const drafts = memoryDrafts()
  const noteSpace = { ...space, id: 'space-race-view', notePath: '笔记/A.md' }
  const store = noteStore({
    '笔记/A.md': '# A 旧正文\n',
    '笔记/B.md': '# B 正文\n',
  })
  const ui = await mount(store, { drafts, space: noteSpace })
  try {
    const releaseSave = store.gateNextSave()
    await ui.type('# A 旧正文\n\nX 保存内容\n')
    await ui.wait(30)
    assert.match(ui.status(), /保存中/)

    await ui.select('笔记/B.md')
    const releaseRead = store.gateNextRead()
    await ui.select('笔记/A.md')
    assert.match(ui.status(), /读取|保存中/)

    // The old save completes while A is still loading. Its callback must not
    // write versionRef/status into the new view or schedule an empty autosave.
    const savesBefore = store.calls.filter(call => call.type === 'save').length
    releaseSave()
    await ui.wait(30)
    releaseRead()
    await ui.wait(80)

    assert.equal(store.calls.filter(call => call.type === 'save').length, savesBefore, '旧成功回调不得再排队保存空正文')
    assert.equal(ui.textarea().value, '# A 旧正文\n\nX 保存内容\n', '读取重同步到旧保存写下的版本')
    assert.match(ui.status(), /已保存/)
    assert.equal(store.files.get('笔记/A.md'), '# A 旧正文\n\nX 保存内容\n')
  } finally {
    await ui.unmount()
  }
})

test('浏览器存储写入失败：跨挂载仍从共享内存恢复草稿，并明确提示只在内存', async () => {
  const throwing = {
    getItem() { return null },
    setItem() { throw new Error('quota exceeded') },
    removeItem() {},
  }
  const firstStore = createSessionDraftStore(throwing)
  const secondStore = createSessionDraftStore(throwing)
  const fallbackSpace = { ...space, id: 'space-fallback', title: '回退空间', notePath: '笔记/回退.md' }
  const store = noteStore({ '笔记/回退.md': '# 原始\n' })
  const first = await mount(store, { drafts: firstStore, space: fallbackSpace })
  try {
    store.setNextSaveError(Object.assign(new Error('保存失败：磁盘暂时不可写。'), { code: 'note-save-failed' }))
    await first.type('# 回退\n\n只在内存的草稿\n')
    await first.wait(30)
    assert.match(first.status(), /保存失败/)
  } finally {
    await first.unmount()
  }

  const second = await mount(store, { drafts: secondStore, space: fallbackSpace })
  try {
    assert.equal(second.textarea().value, '# 回退\n\n只在内存的草稿\n')
    assert.match(second.text(), /内存/)
    assert.match(second.text(), /关闭或刷新页面会丢失|浏览器存储/)
  } finally {
    secondStore.remove(fallbackSpace.id, fallbackSpace.notePath)
    await second.unmount()
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
