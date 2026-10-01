import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// Use the existing DSH test runtime, without installing into the running plugin.
const runtime = createRequire(`${process.env.KAOGONG_TEST_RUNTIME}/package.json`)
const { JSDOM } = runtime('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLImageElement', 'DOMParser']) {
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] })
}
const testingRequire = createRequire(runtime.resolve('@testing-library/react'))
const React = testingRequire('react')
const { render, fireEvent, screen, waitFor, cleanup, act } = runtime('@testing-library/react')
let client
window.__ModuleLoader__ = { load({ factory }) { client = factory(testingRequire) } }
vm.runInThisContext(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))
afterEach(cleanup)

const subject = '行测-资料分析'
const dashboard = {
  today: '2026-10-01', daysToExam: 100, pastDonePct: 0, pastDone: 0, pastDays: 1,
  accuracyRate: 0, totalQuestions: 0, knowledgeTotal: 1, bankTotal: 1,
  todayPlan: { phase: 'foundation', items: [{ subject, kind: 'learn', title: '学习：增长率', done: false }] },
  modules: [{ subject, availableCount: 1, practicedCount: 0, accuracyRate: 0 }], weakPoints: [],
}
let calls
function mockApi() {
  calls = []
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined
    calls.push({ url, body })
    let value
    if (url === '/api/kaogong/dashboard') value = dashboard
    else if (url === '/api/kaogong/practice/start') value = {
      reason: '练习', totalAvailable: 1, returned: 1, cycled: Boolean(body.excludeIds.length),
      questions: [{ id: 'fixture-1', subject, knowledgePoint: '增长率', difficulty: 'easy',
        stem: '<table><tr><td>材料表格</td></tr></table>\n\n![材料](/api/kaogong/material-image?asset=verified%2Ffixture.png)', options: ['A. 10%', 'B. 20%'] }],
    }
    else if (url === '/api/kaogong/practice/submit') value = {
      totalCount: 1, correctCount: 0, accuracyRate: 0,
      results: [{ id: 'fixture-1', knowledgePoint: '增长率', correct: false, correctAnswer: 'B', explanation: '测试解析' }],
    }
    else if (url === '/api/kaogong/practice/reflection') value = {
      summary: { totalQuestions: 1, totalWrong: 1, accuracyRate: 0, weakPoints: [] },
    }
    else if (url === '/api/kaogong/plan/done') value = {}
    else if (url.startsWith('/api/kaogong/knowledge?id=')) value = {
      title: '测试讲义', subject, kind: '讲义', source: '合成测试资料', content: '| 项目 | 数值 |\n| --- | --- |\n| 增长 | 20 |',
    }
    else if (url.startsWith('/api/kaogong/knowledge?q=')) value = {
      entries: [{ id: 'fixture-note', title: '测试讲义', subject, kind: '讲义' }],
    }
    else throw new Error(`Unexpected request: ${url}`)
    return { ok: true, json: async () => value, text: async () => JSON.stringify(value) }
  }
}

test('embedded content uses one practice flow, real request payloads and safe materials', async () => {
  mockApi()
  const prompts = []
  const teachingRequests = []
  render(React.createElement(client.KaogongView, { onOpenTeacher: (prompt, request) => { prompts.push(prompt); teachingRequests.push(request) } }))
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
  assert.deepEqual(calls.find(call => call.url.endsWith('/submit')).body, { answers: [{ id: 'fixture-1', answer: 'A' }] })
  fireEvent.change(screen.getByRole('combobox'), { target: { value: '概念混淆' } })
  fireEvent.click(screen.getByRole('button', { name: '保存错因并总结' }))
  await screen.findByText('本模块错题归纳')
  assert.deepEqual(calls.find(call => call.url.endsWith('/reflection')).body.entries, [{ id: 'fixture-1', errorReason: '概念混淆' }])
  fireEvent.click(screen.getByRole('button', { name: '老师讲评' }))
  await waitFor(() => assert.match(prompts[0], /0\/1题正确/))
  assert.equal(teachingRequests[0].kind, 'review')
  assert.equal(teachingRequests[0].context.subject, subject)
  assert.equal(teachingRequests[0].result.correctCount, 0)
  assert.equal(teachingRequests[0].result.results[0].id, 'fixture-1')
  fireEvent.click(screen.getByRole('button', { name: '再来 10 题' }))
  await screen.findByRole('radio', { name: 'A. 10%' })
  assert.deepEqual(calls.filter(call => call.url.endsWith('/start')).map(call => call.body.excludeIds), [[], ['fixture-1']])
  fireEvent.click(screen.getByRole('checkbox'))
  await waitFor(() => assert.deepEqual(calls.find(call => call.url.endsWith('/done')).body, { date: dashboard.today, index: 0, done: true }))
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
  assert.equal(calls.filter(call => call.url.includes('knowledge?id=')).length, 1)
})

test('missing optional teacher keeps standalone usable with zero main-session or clipboard calls', async () => {
  mockApi()
  let sessions = 0
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { assert.fail('No clipboard handoff') } } })
  render(React.createElement(client.KaogongDashboard, { wide: false, ctx: { uiWorkspace: { startSession() { sessions++ } } } }))
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await screen.findByText('固定老师服务不可用；练习和讲义仍可使用。', { selector: 'div' })
  assert.equal(sessions, 0)
  assert.ok(screen.getByRole('dialog'))
  assert.equal(screen.queryByRole('textbox', { name: '教学提示' }), null)
})

test('missing optional roles does not use the main-session fallback', async () => {
  mockApi()
  render(React.createElement(client.KaogongDashboard, { wide: true, ctx: { uiWorkspace: { startSession() { throw Error('session unavailable') } } } }))
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await screen.findByText('固定老师服务不可用；练习和讲义仍可使用。', { selector: 'div' })
  assert.ok(screen.getByRole('dialog'))
})

test('original sidebar registration opens the same view without requiring a workbench', async () => {
  mockApi()
  const registrations = []
  const ctx = {
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
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '概念混淆' } })
    fireEvent.click(screen.getByRole('button', { name: '保存错因并总结' }))
    await screen.findByText('本模块错题归纳')
    await act(() => app.enable())
    const Replacement = app.ctx.slots.entries('personal-workbench.app')[0].component
    view = render(React.createElement(Replacement, { ...props, pageId: 'errors' }))
    assert.ok(screen.getByText('本模块错题归纳'))
    assert.equal(screen.getByRole('combobox').value, '概念混淆')
    assert.equal(calls.filter(call => call.url.endsWith('/start')).length, 1)
    assert.equal(calls.filter(call => call.url.includes('knowledge?id=')).length, 1)
    fireEvent.click(screen.getByRole('button', { name: '再来 10 题' }))
    view.rerender(React.createElement(Replacement, props))
    await screen.findByRole('radio', { name: 'A. 10%' })
    assert.deepEqual(calls.filter(call => call.url.endsWith('/start')).at(-1).body.excludeIds, ['fixture-1'])
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
    const search = await screen.findByRole('textbox', { name: '搜索知识库' })
    fireEvent.change(search, { target: { value: '增长率' } })
    await waitFor(() => assert.ok(release))
    await act(() => app.enable())
    const View = app.ctx.slots.entries('personal-workbench.app')[0].component
    view = render(React.createElement(View, { appId: 'kaogong', instanceId: 'default', pageId: 'materials', active: true, selectPage() {}, close() {} }))
    assert.equal(screen.getByRole('textbox', { name: '搜索知识库' }).value, '增长率')
    await screen.findByRole('button', { name: '测试讲义' })
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
  state.cell('roles', null).set({ teach: async (key, evidence) => { teaching.push({ key, evidence }) } })
  state.cell('reader.entry', null).set({ id: 'actual-material', title: '图文讲义', subject, kind: '讲义', source: '真实来源', content: '![图](/api/kaogong/material-image?asset=verified/chart.png)\n<table><tr><td>20</td></tr></table>' })
  state.cell('reader.selected', '').set('actual-material')
  state.cell('answers', {}).set({ 'draft-only': 'A' })
  const props = { appId: 'kaogong', instanceId: 'default', pageId: 'classroom', active: true, selectPage() {}, close() {}, ctx: {},
    renderFactorySlot: (name, input) => { factories.push({ name, input }); return React.createElement(Boundary) } }
  const view = current => React.createElement(client.KaogongStateContext.Provider, { value: state }, React.createElement(client.KaogongWorkbenchContent, current))
  const mounted = render(view(props))
  assert.equal(teaching.length, 0, 'Mount must not teach')
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await waitFor(() => assert.equal(teaching.length, 1))
  assert.deepEqual(teaching[0].key, { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject })
  assert.equal(teaching[0].evidence.material.source, '真实来源')
  assert.match(teaching[0].evidence.material.content, /verified\/chart.png/)
  assert.equal('result' in teaching[0].evidence, false)
  assert.equal('answers' in teaching[0].evidence, false)
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

test('late dashboard and practice responses from retired views cannot overwrite newer shared results', async () => {
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
      return { ...response, text: async () => JSON.stringify({ reason: 'stale', questions: [], returned: 0, totalAvailable: 0 }) }
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
    await screen.findByRole('radio', { name: 'A. 10%' })
    await act(async () => { releaseDashboard(); releasePractice() })
    assert.ok(screen.getByRole('radio', { name: 'A. 10%' }))
    assert.equal(screen.queryByText(/1999-01-01/), null)
    assert.equal(screen.queryByText(/当前题库没有匹配题/), null)
  } finally { view?.unmount(); footer.unmount(); await app.dispose() }
})
