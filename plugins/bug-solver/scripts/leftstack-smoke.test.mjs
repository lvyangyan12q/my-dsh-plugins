/** 左列多窗（left + leftMore）渲染冒烟测试：直接跑安装版/构建产物 client.js，
 *  真正 mount 分栏浮层并检查三个窗格都渲染出来（能抓住 TDZ / 渲染期异常这类“打开就空白”的问题）。
 *
 *  用法：node scripts/leftstack-smoke.test.mjs [bundle 路径]
 *  默认 bundle：<worktable>/01_content/lib/client.js
 */
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const worktableRoot = 'F:/ai-project/my-dsh-plugins/plugins/worktable/01_content'
const require = createRequire(new URL('file:///' + worktableRoot + '/package.json'))
const { JSDOM } = require('jsdom')
const React = require('react')
const { create, act } = require('react-test-renderer')

const bundle = process.argv[2] ?? worktableRoot + '/lib/client.js'
if (!existsSync(bundle)) { console.error('找不到 bundle：' + bundle); process.exit(2) }

const dom = new JSDOM('<html><head></head><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true })
const saved = new Map()
const cleanup = []
const flush = () => new Promise((r) => setImmediate(r))

const globals = {
  window: dom.window, self: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element,
  CustomEvent: dom.window.CustomEvent, MutationObserver: dom.window.MutationObserver,
  ResizeObserver: class { observe() {} disconnect() {} },
  localStorage: dom.window.localStorage,
  requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
  cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  fetch: async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' }),
}
for (const [name, value] of Object.entries(globals)) {
  saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

let overlay = null
try {
  dom.window.HTMLCanvasElement.prototype.getContext = () => null
  let captured
  window.__ModuleLoader__ = { load: (d) => { captured = d } }
  new Function(readFileSync(bundle, 'utf8'))()
  assert.equal(captured.id, 'dsh-worktable')
  const exports = captured.factory((id) => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id)
    throw new Error('unexpected external ' + id)
  })

  const frameWidth = 1600
  function anchor() {
    document.querySelector('[data-phase]')?.remove()
    const el = document.createElement('div')
    el.dataset.phase = 'active'
    el.innerHTML = '<header></header><main><textarea>draft</textarea></main>'
    el.getBoundingClientRect = () => ({ left: 0, top: 0, right: frameWidth, bottom: 900, width: frameWidth, height: 900 })
    el.children[0].getBoundingClientRect = () => ({ left: 0, top: 0, right: frameWidth, bottom: 40, width: frameWidth, height: 40 })
    document.body.append(el)
  }
  anchor()

  let overlayComponent
  const layout = {
    panelInfo: { getSnapshot: () => ({ activePanelId: null }), subscribe: () => () => {} },
    selectPanel() {},
    beginNavigation() { return new AbortController().signal },
  }
  const ctx = {
    get: (name) => (name === 'layout' ? layout : name === 'uiWorkspace' ? { openSession() {} } : undefined),
    provide() {},
    effect: (f) => { const d = f(); if (typeof d === 'function') cleanup.push(d) },
    inject() {},
    sessions: { scope: () => ({}), list: { getSnapshot: () => ({ current: null, byId: {} }), subscribe: () => () => {} } },
    conversation: { input: { for: () => ({ state: { getSnapshot: () => ({ draft: '', draftRev: 0, phase: 'plain', occurrences: [] }) }, actions: { insertText: () => true } }) } },
    workspaces: {},
    slots: {
      entries: () => [], subscribe: () => () => {}, inject: (_n, fn) => fn(),
      register(options, component) { if (options.name === 'shell.overlay') overlayComponent = component; return () => {} },
    },
  }

  const PROJ = 'layout-smoke'
  const panel = (id, title) => ({ id, title, min: 200, content: null, active: 0, tabs: [] })
  const spec = {
    id: PROJ,
    title: 'smoke',
    left: panel('p1', '窗口1'),
    leftMore: [panel('p2', '窗口2')],
    top: null,
    main: [panel('p3', '窗口3')],
    leftWidth: { default: 620, min: 360, max: 1200 },
    chatWidth: { default: 340, min: 260, max: 560 },
    topHeight: { default: 200, min: 120, max: 480 },
    topHeightRatio: 0.35,
    chatSide: 'right',
    chatFullHeight: false,
  }
  localStorage.setItem('dsh.worktable.projects.v1', JSON.stringify({
    layouts: [spec], views: {}, bindings: {}, folders: {}, shortcuts: [], hidden: [],
  }))

  exports.apply(ctx)
  assert.ok(overlayComponent, 'plugin must register a shell.overlay component')

  await act(async () => { overlay = create(React.createElement(overlayComponent)); await flush() })

  const store = window.__dshWorktable.splitStore
  await act(async () => { store.open(spec); await flush() })
  await act(async () => { await flush() })

  const panes = overlay.root.findAll((n) => n.props && n.props.className === 'dsh-wt_pane')
  console.log('rendered panes:', panes.length)
  assert.equal(panes.length, 3, '左列两窗 + 主行一窗 = 3 个窗格，实际 ' + panes.length)

  // 左列第二窗（stacked）的操作路径：lockPane / setActiveTab / closeTab 都要能跑通
  await act(async () => { store.lockPane('left', 1, { kind: 'iframe', url: '/api/x', title: 'x' }); await flush() })
  const leftAfterLock = [...(store.spec.left ? [store.spec.left] : []), ...(store.spec.leftMore || [])]
  assert.equal(leftAfterLock.length, 2, 'lockPane 后左列仍应是 2 窗')
  assert.equal((leftAfterLock[1].tabs || []).length, 1, '标题应写进左列第二窗')
  assert.equal((leftAfterLock[0].tabs || []).length, 0, '不能误写到左列第一窗')
  const tabId = leftAfterLock[1].tabs[0].id
  await act(async () => { store.setActiveTab('left', 1, tabId); await flush() })
  assert.equal(store.spec.leftMore[0].active, 0)
  await act(async () => { store.closeTab('left', 1, tabId); await flush() })
  assert.equal((store.spec.leftMore[0].tabs || []).length, 0, 'closeTab 后左列第二窗应清空')
  console.log('OK: 左列第二窗的 lockPane / setActiveTab / closeTab 通过')

  // 顶行 + 主行 + 左列混排时的编号（窗口 1..3）不应崩
  await act(async () => { store.notify?.(); await flush() })
  // 聊天列必须被真正让出来：原生区左外边距 = 总宽 - chatW（否则聊天被窗格盖住）
  const main = document.querySelector('main')
  const marginLeft = Math.round(parseFloat(main.style.marginLeft || '0'))
  const expected = Math.round(frameWidth - store.chatW)
  console.log('native marginLeft:', marginLeft, 'expected:', expected, 'chatW:', Math.round(store.chatW))
  assert.equal(marginLeft, expected, '聊天列没有被让出（原生区左边距应为 总宽-chatW）')
  console.log('OK: 聊天列已让出（不会被窗格盖住）')
  console.log('OK: 左列多窗渲染通过（3 个窗格）')
} finally {
  try { window.__dshWorktable?.splitStore.close(false) } catch {}
  if (overlay) await act(async () => overlay.unmount())
  for (const f of cleanup.reverse()) { try { f() } catch {} }
  await flush()
  dom.window.close()
  for (const [name, descriptor] of saved) if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]
}
