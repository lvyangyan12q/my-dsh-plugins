import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import type {ReactNode} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser, IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

const dashboard = {today: '2026-11-09', daysToExam: 100, pastDonePct: 0, pastDone: 0, pastDays: 1, accuracyRate: 0, totalQuestions: 0, knowledgeTotal: 0, bankTotal: 0, todayPlan: {phase: 'foundation', items: []}, modules: [], weakPoints: [], recentKnowledge: []}

function installFetch() {
  const original = globalThis.fetch
  const requested: string[] = []
  globalThis.fetch = async (input) => {
    const url = String(input)
    requested.push(url)
    return Response.json(url.includes('/dashboard') ? dashboard : url.includes('/lesson/current') ? null : url.includes('/lesson/list') ? [] : {entries: []})
  }
  return {requested, restore() { globalThis.fetch = original }}
}

async function mountStudy(options: {panel?: boolean; ensure?: (roleId: string) => Promise<{phase: 'ready'; sessionId: string; revision: number}>; renderTeacherSession?: (sessionId: string) => ReactNode} = {}) {
  const {dom, restore} = environment()
  const http = installFetch()
  const root = createRoot(window.document.getElementById('root')!)
  const ensured: string[] = []
  const embedded: string[] = []
  const roles = {
    read: async () => null,
    ensure: async (roleId: string) => {
      ensured.push(roleId)
      return options.ensure ? options.ensure(roleId) : {phase: 'ready' as const, sessionId: 'native-teacher-' + roleId, revision: 2}
    },
    open: async () => {},
  }
  const renderTeacherSession = (sessionId: string) => {
    embedded.push(sessionId)
    return <div data-teacher-embed={sessionId}>原生的老师会话</div>
  }
  const props = {
    profile: {id: 'embed-profile', kind: 'learner', title: '备考', revision: 1},
    view: {id: 'embed-view', profileId: 'embed-profile'},
    roles,
    ...(options.panel ? {panel: true} : {}),
    ...(options.renderTeacherSession === undefined ? {renderTeacherSession} : {renderTeacherSession: options.renderTeacherSession}),
  }
  const {ScopedStudyView} = await import('../src/client.tsx')
  await act(async () => root.render(<ScopedStudyView {...(props as never)} />))
  const buttons = () => [...document.querySelectorAll('nav[aria-label="学习页面"] button')].map(node => node.textContent)
  const click = async (title: string) => {
    const node = [...document.querySelectorAll('button')].find(button => button.textContent === title)
    assert.ok(node, `找不到按钮：${title}（可用：${buttons().join(' / ')}）`)
    await act(async () => node.click())
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
  return {
    dom,
    ensured,
    embedded,
    click,
    body: () => dom.window.document.body.textContent ?? '',
    embeds: () => [...dom.window.document.querySelectorAll('[data-teacher-embed]')].map(node => node.getAttribute('data-teacher-embed')),
    async unmount() {
      await act(async () => root.unmount())
      http.restore()
      dom.window.close()
      restore()
    },
  }
}

test('课堂页按老师角色绑定挂载唯一的内嵌原生会话，离开课堂就卸载', async () => {
  const ui = await mountStudy()
  try {
    await ui.click('课堂')
    assert.deepEqual(ui.ensured, ['teacher'], '老师会话来自固定角色绑定，不需要用户选角色或新建课堂')
    assert.deepEqual(ui.embedded, ['native-teacher-teacher'])
    assert.deepEqual(ui.embeds(), ['native-teacher-teacher'])
    assert.match(ui.body(), /老师答疑/)

    await ui.click('今日')
    assert.deepEqual(ui.embeds(), [], '离开课堂即卸载内嵌会话，不留下占位')
    await ui.click('课堂')
    assert.deepEqual(ui.embeds(), ['native-teacher-teacher'], '回到课堂仍是同一个绑定会话')
    assert.equal(ui.embeds().length, 1, '同一会话只能有一个内嵌会话')
  } finally {
    await ui.unmount()
  }
})

test('课堂答疑跟随当前教师科目绑定的会话，不猜全局当前会话', async () => {
  const ui = await mountStudy()
  try {
    const select = ui.dom.window.document.querySelector<HTMLSelectElement>('[aria-label="教师科目"]')
    assert.ok(select, '找不到教师科目选择器')
    await act(async () => {
      select.value = '行测-资料分析'
      select.dispatchEvent(new ui.dom.window.Event('change', {bubbles: true}))
    })
    await ui.click('课堂')
    assert.deepEqual(ui.ensured, ['teacher.data-analysis'])
    assert.deepEqual(ui.embeds(), ['native-teacher-teacher.data-analysis'])
    await ui.click('今日')
    assert.deepEqual(ui.embeds(), [])
  } finally {
    await ui.unmount()
  }
})

test('右栏课堂面板不挂内嵌会话：原生会话页仍是唯一输入所有者', async () => {
  const ui = await mountStudy({panel: true})
  try {
    assert.match(ui.body(), /课堂学习面板/)
    assert.deepEqual(ui.embedded, [], '原生会话页旁的课堂面板不能再出现第二个输入框')
    assert.deepEqual(ui.ensured, [], '右栏面板甚至不创建/绑定老师会话')
  } finally {
    await ui.unmount()
  }
})

test('老师会话绑定失败时显示真实错误，不挂载模拟对话', async () => {
  const ui = await mountStudy({ensure: async () => { throw new Error('请先在原生DSH登记角色工作目录') }})
  try {
    await ui.click('课堂')
    assert.deepEqual(ui.embedded, [])
    assert.match(ui.body(), /请先在原生DSH登记角色工作目录/)
    assert.equal(ui.dom.window.document.querySelector('[contenteditable="true"]'), null)
  } finally {
    await ui.unmount()
  }
})
