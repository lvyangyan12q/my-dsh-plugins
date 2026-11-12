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
// jsdom does not implement scrolling; record the target so tests can prove the
// link actually navigated to the real heading/block anchor.
dom.window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
  this.setAttribute('data-scrolled', '1')
}

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const act = React.act ?? (await import('react-dom/test-utils')).act
const h = React.createElement
const { NotesZone } = await import('../src/notes-zone.tsx')

const space = { id: 'space-1', title: '概率论', directory: '概率论', notePath: '笔记/我的笔记.md', createdAt: '2026-11-09T00:00:00.000Z' }

function noteStore(initial) {
  const files = new Map(Object.entries(initial))
  const calls = []
  const resolveResults = new Map()
  return {
    calls,
    files,
    set(path, content) { files.set(path, content) },
    resolve(target, result) { resolveResults.set(target, result) },
    client: {
      async load() { return { vault: { path: 'D:/知识库', status: 'ready', reason: null, hint: '' }, spaces: [space], currentSpaceId: space.id } },
      async command() { throw new Error('not used') },
      async listNotes() {
        return { notes: [...files.keys()].map(path => ({ path, name: path.split('/').pop() })), defaultPath: '笔记/我的笔记.md' }
      },
      async readNote(spaceId, path) {
        calls.push({ type: 'read', spaceId, path })
        if (!files.has(path)) throw Object.assign(new Error(`笔记文件不存在：${path}`), { code: 'note-not-found' })
        const content = files.get(path)
        return { path, content, version: `version:${content}`, updatedAt: '2026-11-09T00:00:00.000Z' }
      },
      async saveNote(input) {
        calls.push({ type: 'save', ...input })
        if (input.version !== `version:${files.get(input.path)}`) {
          throw Object.assign(new Error('磁盘上的笔记已被外部修改，保存已被拒绝。'), { code: 'note-conflict' })
        }
        files.set(input.path, input.content)
        return { path: input.path, version: `version:${input.content}`, savedAt: '2026-11-09T00:01:00.000Z' }
      },
      async resolveLink(input) {
        calls.push({ type: 'resolve', ...input })
        const result = resolveResults.get(input.target)
        if (result === undefined) throw new Error(`测试没有准备解析结果：${input.target}`)
        return result
      },
    },
  }
}

function memoryDrafts() {
  const files = new Map()
  const key = (spaceId, path) => `${spaceId}\u0000${path}`
  return {
    read(spaceId, path) { return files.get(key(spaceId, path)) ?? null },
    write(spaceId, path, draft) {
      const storageKey = key(spaceId, path)
      const existing = files.get(storageKey)
      if (existing !== undefined && draft.revision <= (existing.revision ?? 0)) return 'stale'
      files.set(storageKey, draft)
      return 'session'
    },
    remove(spaceId, path) { files.delete(key(spaceId, path)) },
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
  const draftStore = memoryDrafts()
  const render = extra => {
    root.render(h(NotesZone, {
      client: store.client,
      space,
      debounceMs: 10,
      drafts: draftStore,
      ...props,
      ...extra,
    }))
  }
  await act(async () => { render({}) })
  await settle()
  return {
    container,
    text: () => container.textContent,
    textarea: () => container.querySelector('textarea'),
    async rerender(extra) {
      await act(async () => { render(extra) })
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
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

const blockOne = '> 样本空间可以缩小。\n>\n> 来源：[[概率论/讲义/第一章/01.md#第一节]]'

test('讲义选段批注追加到当前笔记末尾：保留原文、写真实来源并走既有保存', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n已有内容\n' })
  const ui = await mount(store)
  try {
    await ui.rerender({ appendRequest: { token: 1, spaceId: 'space-1', block: blockOne } })

    const expected = `# 我的笔记\n\n已有内容\n\n${blockOne}\n`
    assert.equal(ui.textarea().value, expected)
    assert.match(ui.text(), /已把带来源的批注追加到笔记末尾/)
    // 自动保存有 debounce；等它越过窗口后检查真实保存命令。
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
    await settle()
    const save = store.calls.find(call => call.type === 'save')
    assert.ok(save, '批注应通过既有笔记保存路径落盘')
    assert.equal(save.content, expected)
    assert.equal(save.version, 'version:# 我的笔记\n\n已有内容\n')
    assert.equal(store.files.get('笔记/我的笔记.md'), expected)
  } finally {
    await ui.unmount()
  }
})

test('笔记存在未解决的保存冲突时拒绝追加批注，不覆盖任何一方', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n原文\n' })
  const ui = await mount(store)
  try {
    // 磁盘被外部改写，本地再编辑触发既有冲突保护。
    store.set('笔记/我的笔记.md', '# 外部版本\n')
    await ui.type('# 我的笔记\n\n我的本地修改\n')
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)) })
    await settle()
    assert.match(ui.text(), /外部修改|冲突/)

    const before = ui.textarea().value
    await ui.rerender({ appendRequest: { token: 2, spaceId: 'space-1', block: blockOne } })
    assert.equal(ui.textarea().value, before)
    assert.equal(ui.textarea().value.includes('样本空间可以缩小'), false)
    assert.match(ui.text(), /冲突/)
    assert.equal(store.files.get('笔记/我的笔记.md'), '# 外部版本\n')
  } finally {
    await ui.unmount()
  }
})

test('同一 token 的追加请求只应用一次，重复渲染不会重复写入', async () => {  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n' })
  const ui = await mount(store)
  try {
    await ui.rerender({ appendRequest: { token: 3, spaceId: 'space-1', block: blockOne } })
    const once = ui.textarea().value
    await ui.rerender({ appendRequest: { token: 3, spaceId: 'space-1', block: blockOne } })
    assert.equal(ui.textarea().value, once)
  } finally {
    await ui.unmount()
  }
})

test('预览中的双链可回跳：讲义交给课堂打开，笔记直接切换，缺失明确提示', async () => {
  const store = noteStore({
    '笔记/我的笔记.md': '# 我的笔记\n\n[[概率论/讲义/第一章/01.md#第一节]]\n\n[[概率论/讲义/第二章/02.md#第二节]]\n\n[[笔记/另一篇.md]]\n\n[[找不到的文件]]\n',
    '笔记/另一篇.md': '# 另一篇\n\n正文\n',
  })
  const opens = []
  store.resolve('概率论/讲义/第一章/01.md#第一节', {
    spaceId: 'space-1', target: '概率论/讲义/第一章/01.md#第一节', status: 'ok',
    file: '概率论/讲义/第一章/01.md', spacePath: '讲义/第一章/01.md', kind: 'lecture',
    heading: '第一节', blockId: null, link: '[[概率论/讲义/第一章/01.md#第一节]]', candidates: [], message: null,
  })
  store.resolve('概率论/讲义/第二章/02.md#第二节', {
    spaceId: 'space-1', target: '概率论/讲义/第二章/02.md#第二节', status: 'ok',
    file: '概率论/讲义/第二章/02.md', spacePath: '讲义/第二章/02.md', kind: 'lecture',
    heading: '第二节', blockId: null, link: '[[概率论/讲义/第二章/02.md#第二节]]', candidates: [], message: null,
  })
  store.resolve('笔记/另一篇.md', {
    spaceId: 'space-1', target: '笔记/另一篇.md', status: 'ok',
    file: '概率论/笔记/另一篇.md', spacePath: '笔记/另一篇.md', kind: 'note',
    heading: null, blockId: null, link: '[[概率论/笔记/另一篇.md]]', candidates: [], message: null,
  })
  store.resolve('找不到的文件', {
    spaceId: 'space-1', target: '找不到的文件', status: 'missing',
    file: null, spacePath: null, kind: 'file', heading: null, blockId: null, link: null, candidates: [],
    message: '知识文件库里找不到文件或别名：找不到的文件',
  })
  const ui = await mount(store, { onOpenLecture: path => opens.push(path) })
  try {
    await ui.click('预览')

    const lectureLink = [...ui.container.querySelectorAll('[data-wikilink]')]
      .find(element => element.getAttribute('data-wikilink') === '概率论/讲义/第一章/01.md#第一节')
    assert.ok(lectureLink, '预览应渲染讲义双链')
    await act(async () => { lectureLink.click() })
    await settle()
    assert.deepEqual(opens, ['讲义/第一章/01.md'])

    // 第二个不同目录的引用同样回跳到各自真实文件，而不是同一个短名。
    const secondLecture = [...ui.container.querySelectorAll('[data-wikilink]')]
      .find(element => element.getAttribute('data-wikilink') === '概率论/讲义/第二章/02.md#第二节')
    assert.ok(secondLecture, '预览应渲染第二章双链')
    await act(async () => { secondLecture.click() })
    await settle()
    assert.deepEqual(opens, ['讲义/第一章/01.md', '讲义/第二章/02.md'])

    const missingLink = [...ui.container.querySelectorAll('[data-wikilink]')]
      .find(element => element.getAttribute('data-wikilink') === '找不到的文件')
    assert.ok(missingLink, '预览应保留无法解析的双链')
    await act(async () => { missingLink.click() })
    await settle()
    assert.match(ui.text(), /找不到文件或别名/)

    const noteLink = [...ui.container.querySelectorAll('[data-wikilink]')]
      .find(element => element.getAttribute('data-wikilink') === '笔记/另一篇.md')
    assert.ok(noteLink, '预览应渲染笔记双链')
    await act(async () => { noteLink.click() })
    await settle()
    assert.equal(ui.container.querySelector('select[aria-label="笔记文件"]').value, '笔记/另一篇.md')
    assert.match(ui.text(), /另一篇/)
    assert.match(ui.text(), /正文/)
  } finally {
    await ui.unmount()
  }
})

test('解析并插入双链：歧义列候选且不插入，解析成功才在光标处插入 Vault 相对链接', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n已有内容\n' })
  store.resolve('01', {
    spaceId: 'space-1', target: '01', status: 'ambiguous',
    file: null, spacePath: null, kind: 'file', heading: null, blockId: null, link: null,
    candidates: ['概率论/讲义/第一章/01.md', '概率论/资料/01.md'],
    message: '文件名「01」在不同目录同名出现了 2 次；请改用 Vault 相对路径。',
  })
  store.resolve('概率论/讲义/第一章/01.md', {
    spaceId: 'space-1', target: '概率论/讲义/第一章/01.md', status: 'ok',
    file: '概率论/讲义/第一章/01.md', spacePath: '讲义/第一章/01.md', kind: 'lecture',
    heading: null, blockId: null, link: '[[概率论/讲义/第一章/01.md]]', candidates: [], message: null,
  })
  const ui = await mount(store)
  try {
    const input = ui.container.querySelector('input[aria-label="双链目标"]')
    assert.ok(input, '笔记区应提供双链目标输入')
    const setValue = async value => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set
        setter.call(input, value)
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
      })
    }

    await setValue('01')
    await ui.click('解析')
    assert.match(ui.text(), /同名出现了 2 次/)
    assert.match(ui.text(), /概率论\/资料\/01\.md/)
    assert.equal([...ui.container.querySelectorAll('button')].some(button => button.textContent.includes('插入双链')), false)

    await setValue('概率论/讲义/第一章/01.md')
    await ui.click('解析')
    const editor = ui.textarea()
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
    await ui.click('插入双链')

    assert.match(ui.textarea().value, /^# 我的笔记\n\n已有内容\n\n\[\[概率论\/讲义\/第一章\/01\.md\]\]\n$/)
    const save = store.calls.filter(call => call.type === 'save').at(-1)
    assert.ok(save, '插入双链后应走既有保存')
    assert.match(save.content, /\[\[概率论\/讲义\/第一章\/01\.md\]\]/)
  } finally {
    await ui.unmount()
  }
})

test('两个学习空间共用同一相对笔记路径时，旧空间的批注不会写进新空间', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n已有内容\n' })
  const ui = await mount(store)
  try {
    const otherSpace = { ...space, id: 'space-2', title: '线性代数', directory: '线性代数' }
    await ui.rerender({ space: otherSpace })
    const before = ui.textarea().value

    await ui.rerender({
      space: otherSpace,
      appendRequest: {
        token: 7,
        block: blockOne,
        spaceId: 'space-1',
        path: '笔记/我的笔记.md',
      },
    })
    assert.equal(ui.textarea().value, before)
    assert.equal(store.files.get('笔记/我的笔记.md'), before)
    assert.match(ui.text(), /学习空间|空间/)
  } finally {
    await ui.unmount()
  }
})

test('同文件标题双链定位到真实标题，不把 fragment 丢掉', async () => {
  const store = noteStore({ '笔记/我的笔记.md': '# 我的笔记\n\n[[#小结]]\n\n## 小结\n\n正文\n' })
  store.resolve('#小结', {
    spaceId: 'space-1', target: '#小结', status: 'ok',
    file: '概率论/笔记/我的笔记.md', spacePath: '笔记/我的笔记.md', kind: 'note',
    heading: '小结', blockId: null, link: '[[概率论/笔记/我的笔记.md#小结]]', candidates: [], message: null,
  })
  const ui = await mount(store)
  try {
    await ui.click('预览')
    const link = ui.container.querySelector('[data-wikilink="#小结"]')
    assert.ok(link, '同文件双链应渲染')
    await act(async () => { link.click() })
    await settle()

    assert.equal(ui.container.querySelector('select[aria-label="笔记文件"]').value, '笔记/我的笔记.md')
    const heading = [...ui.container.querySelectorAll('h3, h4, h5, h6')]
      .find(element => element.textContent.trim() === '小结')
    assert.ok(heading, '预览里应有真实标题')
    assert.equal(heading.getAttribute('data-scrolled'), '1')
  } finally {
    await ui.unmount()
  }
})

test('跨笔记块引用打开真实文件并定位到含 ^块id 的段落', async () => {
  const store = noteStore({
    '笔记/我的笔记.md': '# 我的笔记\n\n[[笔记/另一篇.md#^block-1]]\n',
    '笔记/另一篇.md': '# 另一篇\n\n结论 ^block-1\n',
  })
  store.resolve('笔记/另一篇.md#^block-1', {
    spaceId: 'space-1', target: '笔记/另一篇.md#^block-1', status: 'ok',
    file: '概率论/笔记/另一篇.md', spacePath: '笔记/另一篇.md', kind: 'note',
    heading: null, blockId: 'block-1', link: '[[概率论/笔记/另一篇.md#^block-1]]', candidates: [], message: null,
  })
  const ui = await mount(store)
  try {
    await ui.click('预览')
    const link = ui.container.querySelector('[data-wikilink="笔记/另一篇.md#^block-1"]')
    assert.ok(link, '块引用双链应渲染')
    await act(async () => { link.click() })
    await settle()

    assert.equal(ui.container.querySelector('select[aria-label="笔记文件"]').value, '笔记/另一篇.md')
    const paragraph = [...ui.container.querySelectorAll('p')]
      .find(element => element.textContent.trimEnd().endsWith('^block-1'))
    assert.ok(paragraph, '另一篇笔记里的块段落应渲染')
    assert.equal(paragraph.getAttribute('data-scrolled'), '1')
  } finally {
    await ui.unmount()
  }
})
