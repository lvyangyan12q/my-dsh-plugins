import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

/**
 * The create form is rendered inside the host shell; the plugin's own style
 * block is the only owner of its sizing. A flex basis meant for the wrapping
 * row used to sit on the input inside a column label, which made each text
 * input 240px tall on a 1340x900 desktop and pushed the reading area below the
 * fold. These checks keep row sizing on the label and the control compact.
 */
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

const unsetView = {
  vault: { path: null, status: 'unset', reason: null, hint: '请选择一个已存在的本地目录作为知识文件库。' },
  spaces: [],
  currentSpaceId: null,
}

/** Minimal client: this test only needs the panel's rendered style blocks. */
const client = {
  async load() { return structuredClone(unsetView) },
  async command() { return structuredClone(unsetView) },
}

const space = {
  id: 'space-1',
  title: '概率论',
  directory: '概率论',
  notePath: '笔记/我的笔记.md',
  createdAt: '2026-11-09T00:00:00.000Z',
  lecturePath: null,
  linkedLectures: [],
}

const readyView = {
  vault: { path: 'D:/知识库', status: 'ready', reason: null, hint: '' },
  spaces: [space],
  currentSpaceId: space.id,
}

const readyClient = {
  async load() { return structuredClone(readyView) },
  async command() { return structuredClone(readyView) },
  async listLectures() { return { spaceId: space.id, lectures: [], selectedPath: null, missingSelection: null, folderMissing: false } },
  async readTopic() {
    return {
      spaceId: space.id,
      path: '学习目标.md',
      title: space.title,
      goal: '目标',
      version: 'v1',
      updatedAt: '2026-11-12T00:00:00.000Z',
      fileMissing: false,
    }
  },
  async listNotes() { return { notes: [], defaultPath: space.notePath } },
}

async function mount(withClient = client) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(h(ClassroomPanel, { client: withClient })) })
  for (let index = 0; index < 4; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
  const styles = [...container.querySelectorAll('style')]
  assert.ok(styles.length > 0, '面板应渲染自己的样式块')
  return { root, css: styles.map(style => style.textContent).join('\n') }
}

function declarations(css, selector) {
  const start = css.indexOf(`${selector}{`)
  assert.notEqual(start, -1, `缺少样式规则：${selector}`)
  const bodyStart = start + selector.length + 1
  const end = css.indexOf('}', bodyStart)
  assert.notEqual(end, -1, `样式规则未闭合：${selector}`)
  return css.slice(bodyStart, end)
}

test('创建表单的伸缩基准在 label 上，输入框本身紧凑且不继承行 flex 基准', async () => {
  const ui = await mount()
  try {
    const form = declarations(ui.css, '.lc-form')
    const label = declarations(ui.css, '.lc-form label')
    const input = declarations(ui.css, '.lc-form input')

    assert.match(label, /flex:1 1 240px|flex:1 1 240px;/, '行内伸缩基准应属于 label')
    assert.match(label, /min-width:0/)

    assert.doesNotMatch(input, /flex:1 1 240px/, '输入框不能再把 240px 作为垂直 flex-basis')
    assert.match(input, /flex:none/, '输入框不应参与列方向伸缩')
    assert.match(input, /width:100%/)
    assert.match(input, /min-height:3[0-9]px|height:3[0-9]px/, '输入框应有紧凑显式高度')
    assert.match(input, /padding:[3-6]px 8px/)

    // The form itself stays compact: no large vertical padding.
    const padding = /padding:(\d+)px/.exec(form)
    assert.ok(padding)
    assert.ok(Number(padding[1]) <= 8, `表单内边距应紧凑（当前 ${padding[1]}px）`)
  } finally {
    await act(async () => { ui.root.unmount() })
  }
})

test('目标编辑 textarea 有独立的紧凑尺寸，不依赖宿主或父级 flex', async () => {
  const ui = await mount(readyClient)
  try {
    const textarea = declarations(ui.css, '.lc-goal-form textarea')
    assert.match(textarea, /box-sizing:border-box/)
    assert.match(textarea, /width:100%/)
    assert.match(textarea, /flex:none/)
    assert.match(textarea, /min-height:\d+px/)
    assert.match(textarea, /max-height:\d+px/)

    // No input/textarea in this stylesheet may take the old vertical 240px basis.
    assert.doesNotMatch(ui.css, /(?:input|textarea)[^{}]*\{[^}]*flex:1 1 240px/)
  } finally {
    await act(async () => { ui.root.unmount() })
  }
})
