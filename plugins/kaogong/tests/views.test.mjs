import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Test tools are development-only; the official runtime remains an explicit integration input.
const runtime = createRequire(process.env.KAOGONG_TEST_TOOLS ? `${process.env.KAOGONG_TEST_TOOLS}/package.json` : import.meta.url)
const { JSDOM } = runtime('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLImageElement', 'DOMParser']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
}
const testingRequire = createRequire(runtime.resolve('@testing-library/react'))
const React = testingRequire('react')
const { render, fireEvent, screen, waitFor, cleanup, act } = runtime('@testing-library/react')
let client, platform
window.__ModuleLoader__ = { load({ id, factory }) {
  const exported = factory(name => name === '@deepseek-ai/dsh-personal-workbench/client' ? platform : testingRequire(name))
  if (id === '@deepseek-ai/dsh-personal-workbench') platform = exported
  else client = exported
} }
vm.runInThisContext(readFileSync(new URL('../../personal-workbench/lib/client.js', import.meta.url), 'utf8'))
vm.runInThisContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
function captureTasks(state, rows) {
  const emptyTasks = new Map()
  const tasks = { prepare: (task, options) => rows.push({ key: task.key, task, options }), getSnapshot: () => emptyTasks, subscribe: () => () => {} }
  state.cell('tasks', null).set(tasks)
  return { get: name => name === 'personalWorkbenchTasks' ? tasks : undefined }
}
afterEach(() => { cleanup(); window.localStorage.clear() })

const subject = '行测-资料分析'
const dashboard = {
  today: '2026-10-01', daysToExam: 100, pastDonePct: 0, pastDone: 0, pastDays: 1,
  accuracyRate: 0, totalQuestions: 0, knowledgeTotal: 1, bankTotal: 1,
  todayPlan: { phase: 'foundation', items: [{ subject, kind: 'learn', title: '学习：增长率', done: false }] },
  modules: [{ subject, availableCount: 1, practicedCount: 0, accuracyRate: 0 }], weakPoints: [],
}
let calls
const fixtureRoundId = '00000000-0000-4000-8000-000000000001'
function mockApi() {
  calls = []
  let round
  const score = { roundId: fixtureRoundId, projection: 'complete', review: 'ready', totalCount: 1, correctCount: 0, accuracyRate: 0,
    results: [{ id: 'fixture-1', subject, stem: '原题材料', options: ['A. 10%', 'B. 20%'], source: '原题来源', userAnswer: 'A', knowledgePoint: '增长率', correct: false, correctAnswer: 'B', explanation: '测试解析' }] }
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ url, body })
    let value
    if (url === '/api/kaogong/dashboard') value = dashboard
    else if (url === '/api/kaogong/lesson/list') value = []
    else if (url === '/api/kaogong/lesson/current') value = null
    else if (url === '/api/kaogong/practice/start') value = {
      roundId: fixtureRoundId, context: { subject: body.subject, title: body.title ?? '模块练习', limit: 10, ...(body.knowledgePoint ? { knowledgePoint: body.knowledgePoint } : {}) }, result: null, reflections: [],
      reason: '练习', totalAvailable: 1, returned: 1, cycled: Boolean(body.previousRoundId),
      questions: [{ id: 'fixture-1', subject, knowledgePoint: '增长率', difficulty: 'easy',
        stem: '<table><tr><td>材料表格</td></tr></table>\n\n![材料](/api/kaogong/material-image?asset=verified%2Ffixture.png)', options: ['A. 10%', 'B. 20%'] }],
    }
    else if (url === '/api/kaogong/practice/submit') { value = { ...score }; round.result = value }
    else if (url === '/api/kaogong/practice/reflection') value = {
      result: round.result,
      summary: { totalQuestions: 1, totalWrong: 1, accuracyRate: 0, weakPoints: [] },
    }
    else if (url === '/api/kaogong/practice/read') value = round
    else if (url === '/api/kaogong/practice/review') { round.result = { ...score, review: body.action === 'claim' ? 'sending' : 'sent' }; value = round }
    else if (url === '/api/kaogong/practice/history') value = { rounds: [] }
    else if (url === '/api/kaogong/plan/done') value = {}
    else if (url.startsWith('/api/kaogong/knowledge?id=')) value = {
      title: '测试讲义', subject, kind: '讲义', source: '合成测试资料', content: '| 项目 | 数值 |\n| --- | --- |\n| 增长率 | 20 |',
    }
    else if (url.startsWith('/api/kaogong/knowledge?q=')) value = {
      entries: [{ id: 'fixture-note', title: '测试讲义', subject, kind: '讲义', source: '合成测试资料', content: '| 项目 | 数值 |\n| --- | --- |\n| 增长率 | 20 |' }],
    }
    else throw new Error(`Unexpected request: ${url}`)
    if (url === '/api/kaogong/practice/start') round = value
    return { ok: true, json: async () => value, text: async () => JSON.stringify(value) }
  }
}

test('embedded content uses one practice flow, real request payloads and safe materials', async () => {
  mockApi()
  const prompts = []
  const teachingRequests = []
  render(React.createElement(client.KaogongView, { onOpenTeacher: async (prompt, request, options) => { prompts.push(prompt); teachingRequests.push(request); await options?.beforeSend?.(); await options?.afterSend?.() } }))
  assert.equal(screen.queryByRole('dialog'), null)
  assert.equal(screen.queryByRole('button', { name: '关闭看板' }), null)
  fireEvent.click(await screen.findByRole('button', { name: '开始 10 题练习' }))
  const answer = await screen.findByRole('radio', { name: 'A. 10%' })
  assert.equal(screen.queryByText(/正确答案/), null)
  assert.equal(screen.getByRole('img', { name: '材料' }).getAttribute('src'), '/api/kaogong/material-image?asset=verified%2Ffixture.png')
  assert.ok(screen.getByRole('cell', { name: '材料表格' }))
  fireEvent.click(answer)
  fireEvent.click(screen.getByRole('button', { name: '提交判分' }))
  await screen.findByText('0/1 题正确，正确率 0%')
  assert.deepEqual(calls.find(call => call.url.endsWith('/submit')).body, { roundId: fixtureRoundId, answers: [{ id: 'fixture-1', answer: 'A' }] })
  fireEvent.change(screen.getByRole('combobox', { name: '选择 增长率 的错误原因' }), { target: { value: '概念混淆' } })
  fireEvent.click(screen.getByRole('button', { name: '保存错因并总结' }))
  await screen.findByText('本模块错题归纳')
  assert.deepEqual(calls.find(call => call.url.endsWith('/reflection')).body.entries, [{ id: 'fixture-1', errorReason: '概念混淆' }])
  fireEvent.click(screen.getByRole('button', { name: '辅导员讲评' }))
  await waitFor(() => assert.equal(teachingRequests[0].result.correctCount, 0))
  assert.equal(teachingRequests[0].kind, 'review')
  assert.equal(teachingRequests[0].context.subject, subject)
  assert.equal(teachingRequests[0].result.correctCount, 0)
  assert.equal(teachingRequests[0].result.results[0].id, 'fixture-1')
  await screen.findByRole('button', { name: '已交辅导员' })
  fireEvent.click(screen.getByRole('button', { name: '再来 10 题' }))
  await screen.findByRole('radio', { name: 'A. 10%' })
  assert.deepEqual(calls.filter(call => call.url.endsWith('/start')).map(call => call.body.previousRoundId), [undefined, fixtureRoundId])
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => assert.deepEqual(calls.find(call => call.url.endsWith('/done')).body, { date: dashboard.today, index: 0, done: true }))
})

test('new view owner restores an issued round and learner draft from refresh without trusting cached scores', async () => {
  mockApi()
  let mounted = render(React.createElement(client.KaogongView, { onOpenTeacher() {} }))
  fireEvent.click(await screen.findByRole('button', { name: '开始 10 题练习' }))
  fireEvent.click(await screen.findByRole('radio', { name: 'A. 10%' }))
  await waitFor(() => assert.equal(JSON.parse(window.localStorage.getItem('kaogong/default/practice-draft/v1')).answers['fixture-1'], 'A'))
  const draft = JSON.parse(window.localStorage.getItem('kaogong/default/practice-draft/v1'))
  window.localStorage.setItem('kaogong/default/practice-draft/v1', JSON.stringify({ ...draft, result: { correctCount: 999 } }))
  mounted.unmount()
  mounted = render(React.createElement(client.KaogongView, { onOpenTeacher() {} }))
  const radio = await screen.findByRole('radio', { name: 'A. 10%' })
  assert.equal(radio.checked, true)
  assert.equal(screen.queryByText(/999/), null)
  assert.equal(screen.queryByText(/正确答案/), null)
  assert.equal(calls.filter(call => call.url.endsWith('/start')).length, 1)
  assert.equal(calls.filter(call => call.url.endsWith('/read')).length, 1)
})

test('counselor receives committed Host facts with a subjectless key and preserves the native factory', async () => {
  mockApi()
  const state = new client.KaogongViewState(), teaching = []
  state.cell('roles', null).set({ open: async () => {}, teach: () => assert.fail('Prepare must not call immediate teach') })
  const taskCtx = captureTasks(state, teaching)
  render(React.createElement(client.KaogongStateContext.Provider, { value: state }, React.createElement(client.KaogongWorkbenchContent, {
    appId: 'kaogong', instanceId: 'default', pageId: 'practice', active: true, selectPage() {}, close() {}, ctx: taskCtx, renderFactorySlot: () => null,
  })))
  fireEvent.click(await screen.findByRole('button', { name: '开始 10 题练习' }))
  fireEvent.click(await screen.findByRole('radio', { name: 'A. 10%' }))
  fireEvent.click(screen.getByRole('button', { name: '提交判分' }))
  await screen.findByText('0/1 题正确，正确率 0%')
  act(() => state.cell('result', null).set(old => ({ ...old, correctCount: 999 })))
  fireEvent.click(screen.getByRole('button', { name: '辅导员讲评' }))
  await waitFor(() => assert.equal(teaching.length, 1))
  assert.equal(calls.filter(call => call.url.endsWith('/review')).length, 0)
  await act(async () => { await teaching[0].options.beforeSend(); await teaching[0].options.afterSend() })
  await screen.findByRole('button', { name: '已交辅导员' })
  assert.deepEqual(teaching[0].key, { appId: 'kaogong', instanceId: 'default', roleId: 'counselor' })
  assert.equal(JSON.parse(teaching[0].task.context[0].text).subject, subject)
  assert.equal(JSON.parse(teaching[0].task.context.find(row => row.id === 'teaching.result').text).correctCount, 0)
  const material = JSON.parse(teaching[0].task.context.find(row => row.id === 'teaching.result').text)
  assert.equal(material.roundId, fixtureRoundId)
  assert.equal(material.results[0].userAnswer, 'A')
  assert.equal(material.results[0].stem, '原题材料')
  assert.equal(material.results[0].source, '原题来源')
  assert.equal(state.cell('roles.selected', null).value.roleId, 'counselor')
  assert.equal(calls.filter(call => call.url.endsWith('/submit')).length, 1)
  assert.equal(calls.filter(call => call.url.endsWith('/reflection')).length, 0)
})

test('standalone entry stays idle until opened and retains practice and reader across close', async () => {
  mockApi()
  render(React.createElement(client.KaogongDashboard, { wide: true, ctx: { uiWorkspace: { startSession() {} } } }))
  assert.equal(calls.length, 0)
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  assert.ok(screen.getByRole('dialog', { name: '考公学习看板' }))
  fireEvent.click(await screen.findByRole('button', { name: '开始 10 题练习' }))
  fireEvent.click(await screen.findByRole('radio', { name: 'A. 10%' }))
  fireEvent.click(await screen.findByRole('button', { name: '测试讲义' }))
  await screen.findByText('合成测试资料', { exact: false })
  fireEvent.click(screen.getByRole('button', { name: '关闭看板' }))
  assert.equal(screen.queryByRole('dialog'), null)
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  assert.equal(screen.getByRole('radio', { name: 'A. 10%' }).checked, true)
  assert.ok(screen.getByRole('button', { name: '返回资料列表' }))
  assert.equal(calls.filter(call => call.url.endsWith('/start')).length, 1)
  assert.equal(calls.filter(call => call.url.includes('knowledge?id=')).length, 0)
})

test('missing optional teacher keeps standalone usable with zero main-session or clipboard calls', async () => {
  mockApi()
  let sessions = 0
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { assert.fail('No clipboard handoff') } } })
  render(React.createElement(client.KaogongDashboard, { wide: false, ctx: { uiWorkspace: { startSession() { sessions++ } } } }))
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await screen.findByText('固定老师或任务准备服务不可用；练习和讲义仍可使用。', { selector: 'div' })
  assert.equal(sessions, 0)
  assert.ok(screen.getByRole('dialog'))
  assert.equal(screen.queryByRole('textbox', { name: '教学提示' }), null)
})

test('missing optional roles does not use the main-session fallback', async () => {
  mockApi()
  render(React.createElement(client.KaogongDashboard, { wide: true, ctx: { uiWorkspace: { startSession() { throw Error('session unavailable') } } } }))
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await screen.findByText('固定老师或任务准备服务不可用；练习和讲义仍可使用。', { selector: 'div' })
  assert.ok(screen.getByRole('dialog'))
})

test('original sidebar registration opens the same view without requiring a workbench', async () => {
  mockApi()
  const registrations = [], disposers = []
  const ctx = {
    effect(action) { const dispose = action(); if (dispose) disposers.push(dispose) },
    inject() {},
    slots: {
      inject(name, callback) { assert.equal(name, 'sidebar.footer.action'); callback() },
      register(options, component) { registrations.push({ options, component }) },
    },
    uiWorkspace: { startSession() {} },
  }
  client.apply(ctx)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].options.id, 'kaogong-dashboard')
  render(React.createElement(registrations[0].component, { wide: true }))
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  await screen.findByRole('button', { name: '开始 10 题练习' })
  assert.equal(calls.filter(call => call.url === '/api/kaogong/dashboard').length, 1)
  for (const dispose of disposers.reverse()) dispose()
})

async function lifecycle() {
  const official = createRequire(`${process.env.KAOGONG_TEST_RUNTIME}/packages/client/ui-renderer/package.json`)
  const { Context } = official('@deepseek-ai/cordis')
  let renderer
  const loader = window.__ModuleLoader__
  window.__ModuleLoader__ = { load({ factory }) { renderer = factory(official) } }
  vm.runInThisContext(readFileSync(`${process.env.KAOGONG_TEST_RUNTIME}/packages/client/ui-renderer/lib/client.js`, 'utf8'))
  window.__ModuleLoader__ = loader
  const ctx = new Context()
  const registry = ctx.plugin(renderer.SlotRegistry)
  await registry
  const seed = ctx.plugin({ inject: ['slots'], apply: child => {
    child.slots.register({ name: 'root', children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' }, 'test.workbench': { kind: 'list', scope: 'root' } } }, () => null)
    child.effect(() => child.reflect.provide('uiWorkspace', { startSession() { assert.fail('No implicit Session') } }))
  } })
  await seed
  let consumer = ctx.plugin(client)
  await consumer
  const definitions = new Map(), opens = []
  let provider
  const enable = async () => {
    provider = ctx.plugin({ inject: ['slots'], apply: child => {
      child.slots.register({ name: 'test.workbench', id: 'provider', children: { 'personal-workbench.app': { kind: 'keyed', scope: 'root' } } }, () => null)
      child.effect(() => child.reflect.provide('personalWorkbench', {
        registerApp(definition) {
          assert.equal(definitions.has(definition.id), false)
          definitions.set(definition.id, definition)
          return () => definitions.delete(definition.id)
        },
        openApp(...args) { opens.push(args) }, openWorkspace() {},
      }))
    } })
    await provider
    await consumer
  }
  return { ctx, definitions, opens, enable,
    disable: () => provider.dispose(),
    reload: async () => { await consumer.dispose(); consumer = ctx.plugin(client); await consumer },
    dispose: async () => { await consumer.dispose(); await provider?.dispose(); await seed.dispose(); await registry.dispose(); await ctx.fiber.dispose() },
  }
}

test('real Cordis optional provider and official keyed slots dispose, reappear and hot reload without duplicates', async () => {
  const app = await lifecycle()
  try {
    assert.equal(app.ctx.slots.entries('sidebar.footer.action').length, 1)
    assert.equal(app.ctx.slots.entries('personal-workbench.app').length, 0)
    await app.enable()
    assert.deepEqual(app.definitions.get('kaogong').pages.map(page => page.id), ['classroom', 'practice', 'errors', 'materials', 'plan'])
    assert.equal(app.ctx.slots.entries('personal-workbench.app')[0].options.key, 'kaogong')
    await app.disable()
    assert.equal(app.definitions.size, 0)
    assert.equal(app.ctx.slots.entries('personal-workbench.app').length, 0)
    assert.equal(app.ctx.slots.entries('sidebar.footer.action').length, 1)
    await app.enable()
    await app.reload()
    assert.equal(app.definitions.size, 1)
    assert.equal(app.ctx.slots.entries('personal-workbench.app').length, 1)
    assert.equal(app.ctx.slots.entries('sidebar.footer.action').length, 1)
    assert.equal(app.opens.length, 0)
  } finally { await app.dispose() }
})

test('default instance preserves draft, reader, results and reflection through pages, close and service replacement', async () => {
  mockApi()
  const app = await lifecycle()
  const Footer = app.ctx.slots.entries('sidebar.footer.action')[0].component
  const footer = render(React.createElement(Footer, { wide: true }))
  let view
  try {
    fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
    fireEvent.click(await screen.findByRole('button', { name: '开始 10 题练习' }))
    fireEvent.click(await screen.findByRole('radio', { name: 'A. 10%' }))
    fireEvent.click(await screen.findByRole('button', { name: '测试讲义' }))
    await screen.findByText('合成测试资料', { exact: false })
    await act(() => app.enable())
    assert.equal(screen.queryByRole('dialog'), null)
    assert.deepEqual(app.opens.at(-1), ['kaogong', 'default'])
    const View = app.ctx.slots.entries('personal-workbench.app')[0].component
    const props = { appId: 'kaogong', instanceId: 'default', pageId: 'practice', active: true, selectPage() {}, close() {} }
    view = render(React.createElement(View, props))
    assert.equal(screen.getByRole('radio', { name: 'A. 10%' }).checked, true)
    view.rerender(React.createElement(View, { ...props, pageId: 'materials' }))
    assert.ok(screen.getByRole('button', { name: '返回资料列表' }))
    view.rerender(React.createElement(View, { ...props, pageId: 'plan' }))
    assert.ok(screen.getByRole('checkbox', { name: '完成 学习：增长率' }))
    view.rerender(React.createElement(View, { ...props, pageId: 'classroom' }))
    assert.ok(screen.getByText('距离考试'))
    assert.ok(screen.getByRole('button', { name: '讲解' }))
    view.rerender(React.createElement(View, { ...props, active: false }))
    assert.equal(screen.queryByRole('radio'), null)
    view.rerender(React.createElement(View, props))
    let release
    const api = fetch
    globalThis.fetch = async (url, options) => {
      const response = await api(url, options)
      if (url.endsWith('/submit')) await new Promise(resolve => { release = resolve })
      return response
    }
    fireEvent.click(screen.getByRole('button', { name: '提交判分' }))
    await waitFor(() => assert.ok(release))
    fireEvent.click(screen.getByRole('button', { name: '提交判分' }))
    await act(async () => { view.unmount(); await app.disable(); release() })
    await screen.findByText('0/1 题正确，正确率 0%')
    assert.equal(calls.filter(call => call.url.endsWith('/submit')).length, 1)
    fireEvent.change(screen.getByRole('combobox', { name: '选择 增长率 的错误原因' }), { target: { value: '概念混淆' } })
    fireEvent.click(screen.getByRole('button', { name: '保存错因并总结' }))
    await screen.findByText('本模块错题归纳')
    await act(() => app.enable())
    const Replacement = app.ctx.slots.entries('personal-workbench.app')[0].component
    view = render(React.createElement(Replacement, { ...props, pageId: 'errors' }))
    assert.ok(screen.getByText('本模块错题归纳'))
    assert.equal(screen.getByRole('combobox', { name: '选择 增长率 的错误原因' }).value, '概念混淆')
    assert.equal(calls.filter(call => call.url.endsWith('/start')).length, 1)
    assert.equal(calls.filter(call => call.url.includes('knowledge?id=')).length, 0)
    fireEvent.click(screen.getByRole('button', { name: '再来 10 题' }))
    view.rerender(React.createElement(Replacement, props))
    await screen.findByRole('radio', { name: 'A. 10%' })
    assert.equal(calls.filter(call => call.url.endsWith('/start')).at(-1).body.previousRoundId, fixtureRoundId)
  } finally { view?.unmount(); footer.unmount(); await app.dispose() }
})

test('reader search draft survives transfer and an aborted old fetch cannot replace the new list', async () => {
  mockApi()
  const api = fetch
  let release
  let reads = 0
  globalThis.fetch = async (url, options) => {
    const response = await api(url, options)
    if (url.includes('knowledge?q=') && ++reads === 1) {
      await new Promise(resolve => { release = resolve })
      return { ...response, json: async () => ({ entries: [{ id: 'stale', title: '过期讲义', subject, kind: '讲义' }] }) }
    }
    return response
  }
  const app = await lifecycle()
  const Footer = app.ctx.slots.entries('sidebar.footer.action')[0].component
  const footer = render(React.createElement(Footer, { wide: true }))
  let view
  try {
    fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
    await waitFor(() => assert.ok(release))
    await act(() => app.enable())
    const View = app.ctx.slots.entries('personal-workbench.app')[0].component
    view = render(React.createElement(View, { appId: 'kaogong', instanceId: 'default', pageId: 'materials', active: true, selectPage() {}, close() {} }))
    await screen.findByRole('button', { name: '测试讲义' })
    fireEvent.change(screen.getByRole('textbox', { name: '搜索知识库' }), { target: { value: '增长率' } })
    assert.equal(screen.getByRole('textbox', { name: '搜索知识库' }).value, '增长率')
    await act(async () => { release() })
    assert.equal(screen.queryByRole('button', { name: '过期讲义' }), null)
    assert.ok(screen.getByRole('button', { name: '测试讲义' }))
  } finally { view?.unmount(); footer.unmount(); await app.dispose() }
})

test('ticket 06 teaching callback receives a structured lesson and bypasses main-session handoff', async () => {
  mockApi()
  const requests = []
  const state = new client.KaogongViewState()
  render(React.createElement(client.KaogongStateContext.Provider, { value: state },
    React.createElement(client.KaogongWorkbenchContent, {
      appId: 'kaogong', instanceId: 'default', pageId: 'classroom', active: true,
      selectPage() {}, close() { assert.fail('Custom role handler owns navigation') },
      ctx: { uiWorkspace: { startSession() { assert.fail('No main Session') } } },
      onOpenTeacher(prompt, request) { requests.push(request) },
    })))
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await waitFor(() => assert.equal(requests.length, 1))
  assert.deepEqual(requests[0], { kind: 'lesson', context: { subject, title: '增长率', limit: 10, planIndex: 0 } })
  assert.equal('result' in requests[0], false)
})
test('fixed teacher adapter shares selected material evidence, excludes draft answers and retains its factory boundary across pages', async () => {
  mockApi()
  const state = new client.KaogongViewState()
  const teaching = [], factories = []
  let mounts = 0, unmounts = 0
  function Boundary() { React.useEffect(() => { mounts++; return () => { unmounts++ } }, []); return null }
  state.cell('roles', null).set({ open: async () => {}, teach: () => assert.fail('Prepare must not call immediate teach') })
  const taskCtx = captureTasks(state, teaching)
  const actualMaterial = { id: 'actual-material', title: '图文讲义', subject, kind: '讲义', source: '真实来源', content: '![图](/api/kaogong/material-image?asset=verified/chart.png)\n<table><tr><td>20</td></tr></table>' }
  const api = fetch
  globalThis.fetch = async (url, options) => url.includes('/knowledge?q=') ? { ok: true, json: async () => ({ entries: [actualMaterial] }) } : api(url, options)
  state.cell('answers', {}).set({ 'draft-only': 'A' })
  const props = { appId: 'kaogong', instanceId: 'default', pageId: 'classroom', active: true, selectPage() {}, close() {}, ctx: taskCtx,
    renderFactorySlot: (name, input) => { factories.push({ name, input }); return React.createElement(Boundary) } }
  const view = current => React.createElement(client.KaogongStateContext.Provider, { value: state }, React.createElement(client.KaogongWorkbenchContent, current))
  const mounted = render(view(props))
  assert.equal(teaching.length, 0, 'Mount must not teach')
  fireEvent.click(await screen.findByRole('button', { name: '图文讲义' }))
  await screen.findByRole('img', { name: '图' })
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await waitFor(() => assert.equal(teaching.length, 1))
  assert.deepEqual(teaching[0].key, { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject })
  assert.equal(teaching[0].task.context.find(row => row.id === 'teaching.material').source, '真实来源')
  assert.match(teaching[0].task.context.find(row => row.id === 'teaching.material').text, /verified\/chart.png/)
  assert.equal(teaching[0].task.context.some(row => row.id === 'teaching.result'), false)
  assert.equal(teaching[0].task.context.some(row => row.id === 'answers'), false)
  fireEvent.click(screen.getByRole('button', { name: '班主任' }))
  fireEvent.click(screen.getByRole('button', { name: '辅导员' }))
  fireEvent.click(screen.getByRole('button', { name: '任课老师' }))
  fireEvent.change(screen.getByRole('combobox', { name: '教师科目' }), { target: { value: subject } })
  assert.equal(teaching.length, 1, 'Switching roles never sends an implicit teaching command')
  mounted.rerender(view({ ...props, pageId: 'practice' }))
  mounted.rerender(view({ ...props, active: false }))
  mounted.rerender(view(props))
  assert.equal(mounts, 4, 'Default, subject teacher, class-advisor and counselor own distinct retained boundaries')
  assert.equal(unmounts, 0)
  assert.equal(state.cell('answers', {}).value['draft-only'], 'A')
  assert.ok(factories.every(row => row.name === 'personal-workbench.role-conversation'))
  mounted.unmount()
  assert.equal(unmounts, 4)
})

test('late dashboard reads are ignored and a practice command survives view transfer without issuing twice', async () => {
  mockApi()
  const api = fetch
  let releaseDashboard, releasePractice
  let dashboardReads = 0, practiceReads = 0
  globalThis.fetch = async (url, options) => {
    const response = await api(url, options)
    if (url.endsWith('/dashboard') && ++dashboardReads === 2) {
      await new Promise(resolve => { releaseDashboard = resolve })
      return { ...response, json: async () => ({ ...dashboard, today: '1999-01-01' }) }
    }
    if (url.endsWith('/start') && ++practiceReads === 1) {
      await new Promise(resolve => { releasePractice = resolve })
      return response
    }
    return response
  }
  const app = await lifecycle()
  const Footer = app.ctx.slots.entries('sidebar.footer.action')[0].component
  const footer = render(React.createElement(Footer, { wide: true }))
  let view
  try {
    fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
    fireEvent.click(await screen.findByRole('button', { name: '开始 10 题练习' }))
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => assert.ok(releaseDashboard && releasePractice))
    await act(() => app.enable())
    const View = app.ctx.slots.entries('personal-workbench.app')[0].component
    view = render(React.createElement(View, { appId: 'kaogong', instanceId: 'default', pageId: 'practice', active: true, selectPage() {}, close() {} }))
    fireEvent.click(screen.getByRole('button', { name: '开始 10 题练习' }))
    await act(async () => { releaseDashboard(); releasePractice() })
    await screen.findByRole('radio', { name: 'A. 10%' })
    assert.equal(calls.filter(call => call.url.endsWith('/start')).length, 1)
    assert.ok(screen.getByRole('radio', { name: 'A. 10%' }))
    assert.equal(screen.queryByText(/1999-01-01/), null)
    assert.equal(screen.queryByText(/当前题库没有匹配题/), null)
  } finally { view?.unmount(); footer.unmount(); await app.dispose() }
})

test('built classroom creates and resumes durable IDs, reuses practice requests and requires Host proof plus explicit confirmation', async () => {
  mockApi()
  const api = fetch, lessonCalls = []
  let record, reflected = false
  const view = () => ({ lesson: record, evidence: record.roundIds.map(roundId => ({ roundId, total: 1, correct: 0, answered: true, reflectionsComplete: reflected, projection: 'complete', review: 'ready' })),
    canConfirm: !!record.roundIds.length && reflected, summary: JSON.stringify({ lessonId: record.request.lessonId, status: record.completion ? 'learner-confirmed-complete' : 'unfinished' }) })
  globalThis.fetch = async (url, options) => {
    if (!url.startsWith('/api/kaogong/lesson/')) {
      const response = await api(url, options)
      if (url.endsWith('/reflection')) reflected = true
      return response
    }
    const body = JSON.parse(options.body), action = url.split('/').at(-1); lessonCalls.push({ action, body })
    let value
    if (action === 'list') value = record ? [{ id: record.request.lessonId, subject, objective: record.request.objective, completed: !!record.completion, updatedAt: '2026' }] : []
    else if (action === 'current') value = record ? view() : null
    else if (action === 'create') {
      record = { request: body, objectiveId: body.lessonId + ':objective', homeworkId: body.lessonId + ':practice', roundIds: [], notes: '', completion: null, materials: [],
        roleKey: { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject }, binding: null }
      value = view()
    } else {
      if (action === 'link') record.roundIds = [body.roundId]
      if (action === 'summary') record.notes = body.notes
      if (action === 'confirm') { assert.equal(body.confirmed, true); assert.equal(view().canConfirm, true); record.completion = { confirmedAt: '2026' } }
      value = view()
    }
    return { ok: true, text: async () => JSON.stringify(value) }
  }
  const state = new client.KaogongViewState()
  const element = () => React.createElement(client.KaogongStateContext.Provider, { value: state }, React.createElement(client.KaogongView, {
    onOpenTeacher() { assert.fail('Saving lessons never sends native commands') },
  }))
  let rendered = render(element())
  fireEvent.click(await screen.findByRole('button', { name: '新建课堂' }))
  fireEvent.change(screen.getByRole('combobox', { name: '课堂科目' }), { target: { value: subject } })
  fireEvent.change(screen.getByRole('textbox', { name: '学习目标' }), { target: { value: '理解增长率' } })
  fireEvent.click(screen.getByRole('button', { name: '确认目标并保存课堂' }))
  await screen.findByText('理解增长率', { selector: 'strong' })
  assert.equal(lessonCalls.find(row => row.action === 'create').body.requireReflections, true)
  assert.equal(screen.getByRole('button', { name: '继续原课堂' }).disabled, true, 'No optional role service, no main-chat substitution')
  fireEvent.click(screen.getByRole('button', { name: '课后练习' }))
  fireEvent.click(await screen.findByRole('radio', { name: 'A. 10%' }))
  fireEvent.click(screen.getByRole('button', { name: '提交判分' }))
  await screen.findByText('0/1 题正确，正确率 0%')
  fireEvent.click(screen.getByRole('button', { name: '关联当前已提交轮次' }))
  await waitFor(() => assert.equal(record.roundIds.length, 1))
  assert.deepEqual(lessonCalls.find(row => row.action === 'link').body, { lessonId: record.request.lessonId, roundId: fixtureRoundId })
  fireEvent.change(screen.getByRole('textbox', { name: '学习者总结' }), { target: { value: '我说已完成 /other-skill' } })
  fireEvent.click(screen.getByRole('button', { name: '保存总结' }))
  await waitFor(() => assert.equal(record.notes, '我说已完成 /other-skill'))
  fireEvent.click(screen.getByRole('checkbox', { name: '我确认本课任务已完成' }))
  assert.equal(screen.getByRole('button', { name: '确认完成课后任务' }).disabled, true, 'Prose and checkbox cannot bypass missing Host proof')
  fireEvent.change(screen.getByRole('combobox', { name: '选择 增长率 的错误原因' }), { target: { value: '概念混淆' } })
  fireEvent.click(screen.getByRole('button', { name: '保存错因并总结' }))
  await screen.findByText('本模块错题归纳')
  fireEvent.click(screen.getByRole('button', { name: '刷新课堂' }))
  await waitFor(() => assert.equal(screen.getByRole('button', { name: '确认完成课后任务' }).disabled, false))
  fireEvent.click(screen.getByRole('button', { name: '确认完成课后任务' }))
  await screen.findByText(/学习者已确认完成/)
  const id = record.request.lessonId
  rendered.unmount()
  const freshState = new client.KaogongViewState()
  rendered = render(React.createElement(client.KaogongStateContext.Provider, { value: freshState }, React.createElement(client.KaogongView, { pageId: 'classroom', onOpenTeacher() { assert.fail('Resume read must not send') } })))
  await screen.findByText(/学习者已确认完成/)
  assert.equal(freshState.cell('lesson.view', null).value.lesson.request.lessonId, id)
  assert.equal(calls.filter(row => row.url.endsWith('/start')).length, 1)
  assert.equal(calls.filter(row => row.url.endsWith('/submit')).length, 1)
  rendered.unmount()
})

test('shared summary draft and pending save survive page/close transfer; non-JSON lesson failure is local', async () => {
  mockApi()
  const api = fetch, state = new client.KaogongViewState()
  const lesson = { request: { lessonId: fixtureRoundId, subject, objective: '原课堂', requireReflections: true }, objectiveId: 'objective', homeworkId: 'homework', notes: 'saved', roundIds: [], completion: null, materials: [] }
  const value = { lesson, evidence: [], canConfirm: false, summary: 'bounded summary' }
  state.cell('lesson.view', null).set(value); state.cell('lesson.notes', '').set('unsaved draft')
  state.cell('lesson.notesDirty', false).set(true)
  let settle, saving = false
  globalThis.fetch = async (url, options) => {
    if (!url.startsWith('/api/kaogong/lesson/')) return api(url, options)
    if (url.endsWith('/list')) return { ok: true, text: async () => '[]' }
    if (url.endsWith('/summary')) { saving = true; await new Promise(resolve => { settle = resolve }); return { ok: true, text: async () => JSON.stringify({ ...value, lesson: { ...lesson, notes: 'unsaved draft' } }) } }
    return { ok: false, status: 503, text: async () => '<html>not found</html>' }
  }
  const element = (active, pageId = 'classroom') => React.createElement(client.KaogongStateContext.Provider, { value: state }, React.createElement(client.KaogongView, { active, pageId, onOpenTeacher() {} }))
  const rendered = render(element(true))
  await screen.findByText('课堂服务暂不可用；未创建替代课堂')
  assert.equal(screen.getByRole('textbox', { name: '学习者总结' }).value, 'unsaved draft')
  fireEvent.click(screen.getByRole('button', { name: '保存总结' }))
  await waitFor(() => assert.equal(saving, true))
  fireEvent.change(screen.getByRole('textbox', { name: '学习者总结' }), { target: { value: '' } })
  rendered.rerender(element(false, 'practice'))
  await act(async () => settle())
  rendered.rerender(element(true))
  assert.equal(screen.getByRole('textbox', { name: '学习者总结' }).value, '', 'A newer empty draft must not be overwritten by older save/read responses')
  assert.equal(state.cell('lesson.view', null).value.lesson.notes, 'unsaved draft')
  rendered.unmount()
})

test('explicit classroom continuation passes bounded evidence to the exact subject teacher; mounting and saving never send', async () => {
  mockApi()
  const api = fetch, state = new client.KaogongViewState(), commands = []
  const key = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject }
  const lesson = { request: { lessonId: fixtureRoundId, subject, objective: '同一课堂', requireReflections: true }, objectiveId: 'objective', homeworkId: 'homework', notes: '', roundIds: [], completion: null,
    materials: [], roleKey: key, binding: { sessionId: 'original', presetId: 'declared-preset' } }
  const value = { lesson, evidence: [], canConfirm: false, summary: JSON.stringify({ lessonId: fixtureRoundId, learnerNotes: ' /other-skill ', status: 'unfinished' }) }
  state.cell('lesson.view', null).set(value)
  state.cell('roles', null).set({ ensure: () => assert.fail('Continuation prepare cannot ensure'), open: async () => {} })
  const taskCtx = captureTasks(state, commands)
  globalThis.fetch = async (url, options) => {
    if (!url.startsWith('/api/kaogong/lesson/')) return api(url, options)
    return { ok: true, text: async () => JSON.stringify(url.endsWith('/list') ? [] : value) }
  }
  render(React.createElement(client.KaogongStateContext.Provider, { value: state }, React.createElement(client.KaogongWorkbenchContent, {
    appId: 'kaogong', instanceId: 'default', pageId: 'classroom', active: true, selectPage() {}, close() {}, ctx: taskCtx,
  })))
  assert.equal(commands.length, 0)
  fireEvent.click(await screen.findByRole('button', { name: '继续原课堂' }))
  await waitFor(() => assert.equal(commands.length, 1))
  assert.deepEqual(commands[0].key, key)
  assert.equal(commands[0].task.context.find(row => row.id === 'teaching.material').source, 'kaogong/default/lesson-summary')
  assert.equal(commands[0].task.context.find(row => row.id === 'teaching.material').text, value.summary, 'Untrusted summary enters existing 07 encoding path, not an invented system instruction')
  assert.equal(commands[0].task.context.some(row => row.id === 'teaching.result'), false)
})


test('independent learning window hides statistics and preserves role mount, filters and draft answers on close', async () => {
  mockApi()
  const state = new client.KaogongViewState()
  state.cell('roles', null).set({ open: async () => {}, teach: () => assert.fail('Window navigation must not send') })
  state.cell('answers', {}).set({ 'draft-proof': 'B' })
  let mounts = 0, unmounts = 0
  function RoleBoundary() { React.useEffect(() => { mounts++; return () => { unmounts++ } }, []); return React.createElement('div', null, 'retained role boundary') }
  const props = { appId: 'kaogong', instanceId: 'default', pageId: 'classroom', active: true, selectPage() {}, close() {}, renderFactorySlot: () => React.createElement(RoleBoundary) }
  render(React.createElement(client.KaogongStateContext.Provider, { value: state }, React.createElement(client.KaogongWorkbenchContent, props)))
  await screen.findByText('距离考试')
  assert.equal(screen.queryByRole('combobox', { name: '教师科目' }), null, 'Statistics panel has no visible teacher pane')
  const search = await screen.findByRole('textbox', { name: '搜索知识库' })
  fireEvent.change(search, { target: { value: 'window-proof' } })
  fireEvent.click(screen.getByRole('button', { name: '打开学习窗口' }))
  assert.ok(screen.getByRole('dialog', { name: '独立学习窗口' }))
  assert.equal(screen.getByText('距离考试').closest('section').hidden, true)
  assert.equal(screen.getByText('今日计划').closest('section').hidden, true)
  assert.equal(mounts, 1)
  assert.equal(unmounts, 0)
  fireEvent.click(screen.getByRole('button', { name: '讲义', exact: true }))
  assert.equal((await screen.findByRole('textbox', { name: '搜索知识库' })).value, 'window-proof')
  fireEvent.change(screen.getByRole('textbox', { name: '搜索知识库' }), { target: { value: '' } })
  fireEvent.change(screen.getByRole('combobox', { name: '科目', exact: true }), { target: { value: subject } })
  assert.equal(screen.getByRole('combobox', { name: '科目', exact: true }).value, subject)
  fireEvent.keyDown(screen.getByRole('dialog', { name: '独立学习窗口' }), { key: 'Escape' })
  assert.equal(screen.queryByRole('dialog', { name: '独立学习窗口' }), null)
  assert.equal(screen.getByText('距离考试').closest('section').hidden, false)
  assert.equal(document.activeElement, screen.getByRole('button', { name: '打开学习窗口' }))
  assert.equal(state.cell('answers', {}).value['draft-proof'], 'B')
  assert.equal(screen.getByRole('combobox', { name: '科目', exact: true }).value, subject)
  assert.equal(mounts, 1)
  assert.equal(unmounts, 0)
  assert.equal(calls.some(row => row.url.endsWith('/submit') || row.url.endsWith('/start')), false)
})

test('standalone built client opens knowledge and practice without a Workbench factory', async () => {
  let standalone
  const previousLoader = window.__ModuleLoader__
  window.__ModuleLoader__ = { load({ factory }) {
    standalone = factory(name => {
      if (name === '@deepseek-ai/dsh-personal-workbench/client') throw new Error('client-modules: require("' + name + '") missed the module table — not a platform seed word, not a materialized module, and no registered package factory')
      return testingRequire(name)
    })
  } }
  try { vm.runInThisContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')) }
  finally { window.__ModuleLoader__ = previousLoader }
  mockApi()
  const ctx = { get: () => undefined }
  const state = new standalone.KaogongViewState()
  render(React.createElement(standalone.KaogongDashboard, { ctx, state, wide: true }))
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  await screen.findByRole('textbox', { name: '搜索知识库' })
  fireEvent.click(await screen.findByRole('button', { name: '测试讲义' }))
  await screen.findByText('合成测试资料', { exact: false })
  assert.ok(screen.getByRole('table'))
  assert.ok(document.activeElement === screen.getByRole('button', { name: '返回资料列表' }), 'opening a standalone document must retain keyboard focus')
  fireEvent.click(screen.getByRole('button', { name: '返回资料列表' }))
  assert.ok(document.activeElement === screen.getByRole('textbox', { name: '搜索知识库' }), 'returning must focus the restored material list')
  fireEvent.click(await screen.findByRole('button', { name: '开始 10 题练习' }))
  await screen.findByRole('radio', { name: 'A. 10%' })
  assert.equal(screen.queryByText('正确答案：', { exact: false }), null)
  assert.equal(calls.some(call => call.url.includes('/api/personal-workbench/')), false)
})

test('optional Workbench integration does not conceal an installed factory failure', () => {
  const previousLoader = window.__ModuleLoader__
  window.__ModuleLoader__ = { load({ factory }) {
    factory(name => {
      if (name === '@deepseek-ai/dsh-personal-workbench/client') throw new Error('WORKBENCH_INIT_FAILED')
      return testingRequire(name)
    })
  } }
  try { assert.throws(() => vm.runInThisContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')), /WORKBENCH_INIT_FAILED/) }
  finally { window.__ModuleLoader__ = previousLoader }
})

test('standalone dialog focuses its surface, closes with Escape and restores its launcher', async () => {
  mockApi()
  render(React.createElement(client.KaogongDashboard, { wide: true, ctx: { get: () => undefined } }))
  const launcher=screen.getByRole('button', { name: '打开考公学习看板' })
  launcher.focus()
  fireEvent.click(launcher)
  const dialog=screen.getByRole('dialog', { name: '考公学习看板' })
  assert.ok(document.activeElement === dialog, "opening must move keyboard focus into the dialog")
  fireEvent.keyDown(dialog, { key: 'Escape', isComposing: true })
  assert.ok(screen.queryByRole('dialog', { name: '考公学习看板' }), 'IME cancellation must leave the dashboard open')
  await screen.findByRole('button', { name: '开始 10 题练习' })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  assert.equal(screen.queryByRole('dialog', { name: '考公学习看板' }), null)
  assert.ok(document.activeElement === launcher, "closing must return focus to the launcher")
  fireEvent.click(launcher)
  const reopened=screen.getByRole('dialog', { name: '考公学习看板' })
  const first=screen.getByRole('button', { name: '打开学习窗口' })
  first.focus()
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
  assert.ok(reopened.contains(document.activeElement))
  assert.ok(document.activeElement !== first, "Shift+Tab must wrap inside the dialog")
  fireEvent.click(first)
  const study=screen.getByRole('dialog', { name: '独立学习窗口' })
  fireEvent.keyDown(study, { key: 'Escape', isComposing: true })
  assert.ok(screen.queryByRole('dialog', { name: '独立学习窗口' }), 'IME cancellation must leave the study window open')
  fireEvent.keyDown(study, { key: 'Escape' })
  assert.equal(screen.queryByRole('dialog', { name: '独立学习窗口' }), null)
  assert.ok(screen.getByRole('dialog', { name: '考公学习看板' }))
  assert.ok(document.activeElement === first)
  fireEvent.keyDown(first, { key: 'Escape' })
  assert.equal(screen.queryByRole('dialog', { name: '考公学习看板' }), null)
  assert.ok(document.activeElement === launcher)
})


test('narrow study switches content and retained native conversation without activating a hidden role', async () => {
  mockApi()
  const previous=window.matchMedia
  let change
  const media={matches:true,addEventListener:(_type,listener)=>{change=listener},removeEventListener(){}}
  window.matchMedia=()=>media
  let mounts=0,unmounts=0,currentActive
  function RetainedRole({active}) { currentActive=active; React.useEffect(()=>{mounts++;return()=>{unmounts++}},[]);return React.createElement('div',null,'narrow retained role') }
  const state=new client.KaogongViewState()
  state.cell('roles',null).set({open:async()=>{}})
  try {
    render(React.createElement(client.KaogongStateContext.Provider,{value:state},React.createElement(client.KaogongWorkbenchContent,{appId:'kaogong',instanceId:'default',active:true,pageId:'materials',selectPage(){},close(){},renderFactorySlot:(_name,props)=>React.createElement(RetainedRole,{active:props.active})})))
    fireEvent.click(screen.getByRole('button',{name:'打开学习窗口'}))
    const shell=screen.getByRole('dialog',{name:'独立学习窗口'})
    assert.equal(shell.dataset.pane,'content')
    assert.equal(currentActive,false,'hidden native conversation must not own composer focus')
    fireEvent.click(screen.getByRole('button',{name:'角色对话',exact:true}))
    assert.equal(shell.dataset.pane,'conversation')
    assert.equal(currentActive,true)
    fireEvent.click(screen.getByRole('button',{name:'讲义',exact:true}))
    assert.equal(shell.dataset.pane,'content','page navigation returns to content')
    assert.equal(currentActive,false)
    act(()=>{media.matches=false;change({matches:false})})
    assert.equal(currentActive,true,'desktop split restores the visible role')
    assert.equal(mounts,1)
    assert.equal(unmounts,0)
    assert.equal(calls.some(row=>row.url.endsWith('/submit')||row.url.endsWith('/start')),false)
  } finally {cleanup();window.matchMedia=previous}
})


test('public material return focuses retained search and keeps Escape inside the study window', async () => {
  mockApi()
  const state=new client.KaogongViewState()
  render(React.createElement(client.KaogongStateContext.Provider,{value:state},React.createElement(client.KaogongWorkbenchContent,{appId:'kaogong',instanceId:'default',pageId:'materials',active:true,selectPage(){},close(){}})))
  fireEvent.click(screen.getByRole('button',{name:'打开学习窗口'}))
  fireEvent.click(await screen.findByRole('button',{name:'测试讲义'}))
  const back=screen.getByRole('button',{name:'返回资料列表'})
  back.focus()
  fireEvent.click(back)
  assert.ok(document.activeElement===screen.getByRole('textbox',{name:'搜索知识库'}),'public return must focus the retained search')
  assert.equal(state.cell('reader.selected','').value,'')
  fireEvent.keyDown(document.activeElement,{key:'Escape'})
  assert.equal(screen.queryByRole('dialog',{name:'独立学习窗口'}),null)
  assert.ok(document.activeElement===screen.getByRole('button',{name:'打开学习窗口'}))
  assert.equal(calls.some(row=>row.url.endsWith('/submit')||row.url.endsWith('/start')),false)
})

test('fresh learning owner restores only presentation choices without a new role session', async () => {
  mockApi()
  const previous=window.matchMedia
  window.matchMedia=()=>({matches:true,addEventListener(){},removeEventListener(){}})
  const content=state=>React.createElement(client.KaogongStateContext.Provider,{value:state},React.createElement(client.KaogongWorkbenchContent,{appId:'kaogong',instanceId:'default',pageId:'classroom',active:true,selectPage(){},close(){},renderFactorySlot:(_name,props)=>React.createElement('div',{'aria-label':'会话目标'},JSON.stringify(props.bindingKey))}))
  let opens=0
  const owner=()=>{const s=new client.KaogongViewState();s.cell('roles',null).set({open:async()=>{opens++}});return s}
  try {
    render(content(owner()))
    fireEvent.click(screen.getByRole('button',{name:'打开学习窗口'}))
    fireEvent.change(screen.getByRole('combobox',{name:'教师科目'}),{target:{value:'行测-判断推理'}})
    fireEvent.click(screen.getByRole('button',{name:'错题',exact:true}))
    fireEvent.click(screen.getByRole('button',{name:'角色对话',exact:true}))
    cleanup()
    const restored=owner()
    render(content(restored))
    const shell=screen.getByRole('dialog',{name:'独立学习窗口'})
    assert.equal(shell.dataset.pane,'conversation')
    assert.equal(screen.getByRole('button',{name:'错题',exact:true}).getAttribute('aria-pressed'),'true')
    assert.equal(screen.getByRole('combobox',{name:'教师科目'}).value,'行测-判断推理')
    assert.equal(JSON.parse(screen.getByLabelText('会话目标').textContent).subject,'行测-判断推理')
    assert.equal(opens,0,'restoring display choices must not implicitly create a native Session')
    const saved=JSON.parse(window.localStorage.getItem('kaogong/default/learning-view/v1'))
    assert.deepEqual(Object.keys(saved).sort(),['page','pane','role','studyOpen','version'])
    assert.deepEqual(Object.keys(saved.role).sort(),['roleId','subject'])
  } finally {cleanup();window.matchMedia=previous}
})

test('invalid or foreign learning preference records cannot redirect native role bindings', () => {
  const base={version:1,studyOpen:true,page:'errors',pane:'conversation',role:{roleId:'teacher',subject:'行测-判断推理'}}
  for(const value of [null,{...base,version:2},{...base,page:'unknown'},{...base,sessionId:'foreign-session'},
    {...base,role:{roleId:'teacher',subject:'unknown'}},{...base,role:{roleId:'teacher',appId:'other'}},
    {...base,role:{roleId:'counselor',subject:'行测-判断推理'}},{...base,role:{roleId:'unknown'}}]){
    window.localStorage.setItem('kaogong/default/learning-view/v1',JSON.stringify(value))
    const owner=new client.KaogongViewState()
    assert.equal(owner.cell('study.open',false).value,false)
    assert.deepEqual(owner.cell('roles.selected',{appId:'kaogong',instanceId:'default',roleId:'teacher'}).value,{appId:'kaogong',instanceId:'default',roleId:'teacher'})
  }
  for(const raw of ['{broken',' '.repeat(4097)]){
    window.localStorage.setItem('kaogong/default/learning-view/v1',raw)
    assert.equal(new client.KaogongViewState().cell('study.open',false).value,false)
  }
})

test('disabled or full browser preference storage leaves in-memory learning navigation usable', () => {
  const prototype=Object.getPrototypeOf(window.localStorage)
  const get=Object.getOwnPropertyDescriptor(prototype,'getItem'),set=Object.getOwnPropertyDescriptor(prototype,'setItem')
  try {
    Object.defineProperty(prototype,'getItem',{configurable:true,value(){throw new Error('Storage unavailable')}})
    Object.defineProperty(prototype,'setItem',{configurable:true,value(){throw new Error('Quota exceeded')}})
    const owner=new client.KaogongViewState()
    owner.cell('study.open',false).set(true)
    owner.cell('study.page','classroom').set('errors')
    owner.cell('study.pane','content').set('conversation')
    assert.equal(owner.cell('study.open',false).value,true)
    assert.equal(owner.cell('study.page','classroom').value,'errors')
    assert.equal(owner.cell('study.pane','content').value,'conversation')
  } finally {Object.defineProperty(prototype,'getItem',get);Object.defineProperty(prototype,'setItem',set)}
})
