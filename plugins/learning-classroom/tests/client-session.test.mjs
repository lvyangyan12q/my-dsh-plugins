import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

/**
 * Seam under test: the classroom panel rendered in jsdom with an injected fake
 * Session service and a fake slot runtime. These stand in for the Host's
 * public `sessions.retain/create` contract and for `SessionProvider` +
 * `renderSlot`/`renderFactorySlot`, so the reference lifecycle, session
 * switching, error/retry and single-composer behavior are observable without a
 * running Host. Real streaming, Stop, questions and approval stay unverified
 * here (ticket 09 browser acceptance).
 */
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
const { ClassroomPanel, apply, panelId } = await import('../src/classroom-panel.tsx')
const { teacherSessionSeat, teacherSessionSource, TeacherConversationSeat } = await import('../src/session-zone.tsx')

const vault = { path: 'D:/知识库', status: 'ready', reason: null, hint: '' }

function space(overrides) {
  return {
    id: 'space-1',
    title: '线性代数',
    directory: '线性代数',
    notePath: '笔记/我的笔记.md',
    createdAt: '2026-11-09T00:00:00.000Z',
    sessionId: null,
    cwd: 'D:/知识库/线性代数',
    ...overrides,
  }
}

function readyView(spaces, currentSpaceId) {
  return { vault: { ...vault }, spaces, currentSpaceId }
}

function fakeClient(initial) {
  let view = structuredClone(initial)
  const calls = []
  return {
    calls,
    async load() { return structuredClone(view) },
    async listLectures(spaceId) {
      return { spaceId, lectures: [], selectedPath: null, missingSelection: null, folderMissing: false }
    },
    async readLecture() { throw new Error('本测试不使用讲义读取') },
    async listNotes() { return { notes: [], defaultPath: '笔记/我的笔记.md' } },
    async readNote() { throw new Error('本测试不使用笔记读取') },
    async saveNote() { throw new Error('本测试不使用笔记保存') },
    async saveLayout(input) {
      calls.push(structuredClone(input))
      return structuredClone(view)
    },
    async command(input) {
      calls.push(structuredClone(input))
      if (input.action === 'space-open') {
        if (!view.spaces.some(row => row.id === input.spaceId)) throw new Error(`学习空间不存在：${input.spaceId}`)
        view = { ...view, currentSpaceId: input.spaceId }
      } else if (input.action === 'session-open') {
        if (!view.spaces.some(row => row.id === input.spaceId)) throw new Error(`学习空间不存在：${input.spaceId}`)
        view = {
          ...view,
          currentSpaceId: input.spaceId,
          spaces: view.spaces.map(row => row.id === input.spaceId ? { ...row, sessionId: input.sessionId } : row),
        }
      } else {
        throw new Error(`未知命令：${String(input.action)}`)
      }
      return structuredClone(view)
    },
  }
}

/** Fake `sessions` service: owns reference counting and a per-session turn state. */
function createSessionService(options = {}) {
  const retains = []
  const releases = []
  const creates = []
  const cancels = []
  const turns = new Map()
  const turn = id => {
    if (!turns.has(id)) turns.set(id, { running: false, messages: [], failReadyTimes: 0, readyError: `会话 ${id} 不可用` })
    return turns.get(id)
  }
  const service = {
    async create(input) {
      creates.push({ ...input })
      const id = options.createdId?.() ?? `created-${creates.length}`
      turn(id)
      return id
    },
    retain(id, retainOptions) {
      retains.push({ id, options: retainOptions })
      const state = turn(id)
      return {
        sessionId: id,
        ready: Promise.resolve().then(() => {
          if (state.failReadyTimes > 0) {
            state.failReadyTimes -= 1
            throw new Error(state.readyError)
          }
          return { sessionId: id }
        }),
        release() { releases.push(id) },
      }
    },
    cancel(id) { cancels.push(id) },
  }
  return { service, retains, releases, creates, cancels, turn }
}

/** Fake host slot runtime: `SessionProvider` scopes the seat, `renderSlot` renders it, factory renders one composer. */
function createSlotRuntime(sessions) {
  const slotCalls = []
  const factoryCalls = []
  const providerSessions = []
  const SessionContext = React.createContext(undefined)
  function SessionProvider({ session, children }) {
    providerSessions.push(session?.sessionId)
    return h(SessionContext.Provider, { value: session }, children)
  }
  function SlotSeat() {
    const session = React.useContext(SessionContext)
    const id = session?.sessionId
    const state = id === undefined ? undefined : sessions.turn(id)
    const snapshot = state === undefined ? undefined : {
      blank: state.messages.length === 0,
      awaitingFirstTurn: false,
      running: state.running === true,
      promptAttempted: state.messages.length > 0,
      openState: 'open',
    }
    return h('div', { 'data-fake-session': id }, h(TeacherConversationSeat, {
      sessionId: id,
      useSession: selector => selector(snapshot),
      useConversation: selector => selector({ activeTargets: new Set() }),
      renderFactorySlot: (name, input) => {
        factoryCalls.push({ name, input })
        return h('div', { 'data-testid': 'conversation-content', 'data-phase': input.phase },
          h('textarea', { 'data-testid': 'composer', 'aria-label': '老师输入' }))
      },
    }))
  }
  return {
    renderSlot: (name, owner) => { slotCalls.push({ name, owner }); return h(SlotSeat) },
    SessionProvider,
    slotCalls,
    factoryCalls,
    providerSessions,
  }
}

async function settle() {
  for (let index = 0; index < 4; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

async function mount(props) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(h(ClassroomPanel, props)) })
  await settle()
  return {
    document: dom.window.document,
    text: () => container.textContent,
    async click(button) { await act(async () => { button.click() }); await settle() },
    async unmount() { await act(async () => { root.unmount() }) },
  }
}

function findButton(document, label) {
  return [...document.querySelectorAll('button')].find(button => button.textContent.includes(label))
}

function chatComposers(document) {
  return document.querySelectorAll('[data-testid="composer"]')
}

test('已绑定会话的学习空间取得自有引用，并在课堂内渲染唯一真实会话入口', async () => {
  const sessions = createSessionService()
  const runtime = createSlotRuntime(sessions)
  const client = fakeClient(readyView([space({ sessionId: 'session-1' })], 'space-1'))
  const ui = await mount({ client, sessions: sessions.service, renderSlot: runtime.renderSlot, SessionProvider: runtime.SessionProvider })
  try {
    assert.equal(sessions.retains.length, 1)
    assert.equal(sessions.retains[0].id, 'session-1')
    assert.equal(sessions.retains[0].options.source, teacherSessionSource)
    assert.equal(runtime.slotCalls.length, 1)
    assert.equal(runtime.slotCalls[0].name, teacherSessionSeat)
    assert.deepEqual(runtime.providerSessions, ['session-1'])
    assert.equal(runtime.factoryCalls.length, 1)
    assert.equal(runtime.factoryCalls[0].name, 'conversation.content')
    assert.equal(runtime.factoryCalls[0].input.variant, 'embedded')
    assert.equal(chatComposers(ui.document).length, 1)
    assert.ok(ui.document.querySelector('[data-fake-session="session-1"]'))
    assert.match(ui.text(), /老师对话/)
    assert.doesNotMatch(ui.text(), /伪造|尚未连接|我是老师/)
  } finally {
    await ui.unmount()
  }
})

test('切换学习空间释放旧引用、取得新引用，页面只保留新会话', async () => {
  const sessions = createSessionService()
  const runtime = createSlotRuntime(sessions)
  const spaces = [
    space({ id: 'space-1', title: '第一课', directory: '第一课', sessionId: 'session-first', cwd: 'D:/知识库/第一课' }),
    space({ id: 'space-2', title: '第二课', directory: '第二课', sessionId: 'session-second', cwd: 'D:/知识库/第二课' }),
  ]
  const client = fakeClient(readyView(spaces, 'space-1'))
  const ui = await mount({ client, sessions: sessions.service, renderSlot: runtime.renderSlot, SessionProvider: runtime.SessionProvider })
  try {
    assert.deepEqual(sessions.retains.map(row => row.id), ['session-first'])
    await ui.click(findButton(ui.document, '第二课'))

    assert.deepEqual(sessions.retains.map(row => row.id), ['session-first', 'session-second'])
    assert.deepEqual(sessions.releases, ['session-first'])
    assert.equal(runtime.providerSessions.at(-1), 'session-second')
    assert.equal(ui.document.querySelectorAll('[data-fake-session]').length, 1)
    assert.ok(ui.document.querySelector('[data-fake-session="session-second"]'))
    assert.equal(chatComposers(ui.document).length, 1)
  } finally {
    await ui.unmount()
  }
})

test('离开课堂只释放引用而不取消回合，回来重新取得同一会话', async () => {
  const sessions = createSessionService()
  const runtime = createSlotRuntime(sessions)
  sessions.turn('session-1').running = true
  const client = fakeClient(readyView([space({ sessionId: 'session-1' })], 'space-1'))
  const first = await mount({ client, sessions: sessions.service, renderSlot: runtime.renderSlot, SessionProvider: runtime.SessionProvider })
  await first.unmount()

  assert.deepEqual(sessions.releases, ['session-1'])
  assert.deepEqual(sessions.cancels, [])
  assert.equal(runtime.factoryCalls.at(-1).input.phase, 'active')

  const second = await mount({ client, sessions: sessions.service, renderSlot: runtime.renderSlot, SessionProvider: runtime.SessionProvider })
  try {
    assert.deepEqual(sessions.retains.map(row => row.id), ['session-1', 'session-1'])
    assert.deepEqual(sessions.cancels, [])
    assert.equal(runtime.factoryCalls.at(-1).input.phase, 'active')
    assert.equal(chatComposers(second.document).length, 1)
  } finally {
    await second.unmount()
  }
})

test('收起老师对话只隐藏、不释放引用也不停止回合，展开后仍是同一个真实会话', async () => {
  const sessions = createSessionService()
  const runtime = createSlotRuntime(sessions)
  sessions.turn('session-1').running = true
  const client = fakeClient(readyView([space({ sessionId: 'session-1' })], 'space-1'))
  const ui = await mount({ client, sessions: sessions.service, renderSlot: runtime.renderSlot, SessionProvider: runtime.SessionProvider })
  try {
    const before = ui.document.querySelector('[data-fake-session="session-1"]')
    assert.ok(before)
    const hide = ui.document.querySelector('button[aria-label="收起老师对话"]')
    assert.ok(hide)
    await ui.click(hide)
    assert.deepEqual(sessions.releases, [], '隐藏对话不释放会话引用')
    assert.deepEqual(sessions.cancels, [], '隐藏对话不取消正在进行的回合')
    assert.equal(ui.document.querySelector('[data-fake-session="session-1"]'), before, '隐藏用 CSS，不卸载会话')
    assert.equal(chatComposers(ui.document).length, 1, '原生输入根仍在')
    assert.equal(runtime.factoryCalls.at(-1).input.phase, 'active', '恢复时保持真实回合状态')

    const show = ui.document.querySelector('button[aria-label="显示老师对话"]')
    assert.ok(show)
    await ui.click(show)
    assert.equal(ui.document.querySelector('[data-fake-session="session-1"]'), before, '展开复用同一挂载，不新建会话')
    assert.equal(sessions.retains.length, 1, '隐藏/展开不重复 retain')
    assert.deepEqual(sessions.releases, [])
    assert.deepEqual(sessions.cancels, [])
  } finally {
    await ui.unmount()
  }
})

test('显式打开老师会话时创建标准预设会话并保存到学习空间绑定', async () => {
  const sessions = createSessionService()
  const runtime = createSlotRuntime(sessions)
  const client = fakeClient(readyView([space()], 'space-1'))
  const ui = await mount({ client, sessions: sessions.service, renderSlot: runtime.renderSlot, SessionProvider: runtime.SessionProvider })
  try {
    assert.equal(sessions.retains.length, 0)
    assert.equal(chatComposers(ui.document).length, 0)
    assert.match(ui.text(), /打开老师会话/)

    await ui.click(findButton(ui.document, '打开老师会话'))

    assert.deepEqual(sessions.creates, [{ cwd: 'D:/知识库/线性代数', agentPreset: 'standard' }])
    assert.deepEqual(client.calls.at(-1), { action: 'session-open', spaceId: 'space-1', sessionId: 'created-1' })
    assert.deepEqual(sessions.retains.map(row => row.id), ['created-1'])
    assert.equal(runtime.providerSessions.at(-1), 'created-1')
    assert.equal(chatComposers(ui.document).length, 1)
    assert.doesNotMatch(ui.text(), /打开老师会话/)
  } finally {
    await ui.unmount()
  }
})

test('会话不可用时显示真实错误与重试，重试后才出现会话，不出现假聊天', async () => {
  const sessions = createSessionService()
  const runtime = createSlotRuntime(sessions)
  const failed = sessions.turn('session-gone')
  failed.failReadyTimes = 1
  failed.readyError = '会话已被删除或不可用'
  const client = fakeClient(readyView([space({ sessionId: 'session-gone' })], 'space-1'))
  const ui = await mount({ client, sessions: sessions.service, renderSlot: runtime.renderSlot, SessionProvider: runtime.SessionProvider })
  try {
    const conversation = ui.document.querySelector('[aria-label="老师对话"]')
    const alert = conversation.querySelector('[role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /会话已被删除或不可用/)
    assert.equal(chatComposers(ui.document).length, 0)
    assert.doesNotMatch(conversation.textContent, /尚未连接|我是老师/)

    await ui.click(findButton(conversation, '重试'))

    assert.deepEqual(sessions.retains.map(row => row.id), ['session-gone', 'session-gone'])
    assert.equal(conversation.querySelector('[role="alert"]'), null)
    assert.equal(chatComposers(ui.document).length, 1)
  } finally {
    await ui.unmount()
  }
})

test('缺少会话渲染位置时给出真实错误，不退回假聊天', async () => {
  const sessions = createSessionService()
  const client = fakeClient(readyView([space({ sessionId: 'session-1' })], 'space-1'))
  const ui = await mount({ client, sessions: sessions.service })
  try {
    assert.equal(chatComposers(ui.document).length, 0)
    const alert = ui.document.querySelector('[aria-label="老师对话"] [role="alert"]')
    assert.ok(alert)
    assert.match(alert.textContent, /老师会话界面不可用/)
  } finally {
    await ui.unmount()
  }
})

test('主面板登记自有 session 子 seat，并在其中登记会话内容组件', async () => {
  const sessions = createSessionService()
  const registrations = []
  const disposers = []
  const ctx = {
    sessions: sessions.service,
    slots: {
      inject: (_name, install) => install(),
      register: (spec, component) => { registrations.push({ spec, component }); return () => {} },
    },
    effect: install => { const dispose = install(); if (typeof dispose === 'function') disposers.push(dispose) },
  }
  apply(ctx)
  const main = registrations.find(row => row.spec.name === 'main')
  assert.ok(main)
  assert.equal(main.spec.key, panelId)
  assert.deepEqual(main.spec.children[teacherSessionSeat], { kind: 'single', scope: 'session' })
  assert.equal(main.spec.inject().sessions, sessions.service)
  assert.equal(main.component, ClassroomPanel)

  const seat = registrations.find(row => row.spec.name === teacherSessionSeat)
  assert.ok(seat)
  assert.equal(seat.component, TeacherConversationSeat)

  const sidebar = registrations.find(row => row.spec.name === 'sidebar.panellist')
  assert.ok(sidebar)
  assert.equal(sidebar.spec.id, panelId)
  for (const dispose of disposers.reverse()) dispose()
})
