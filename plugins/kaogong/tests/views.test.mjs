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
const { render, fireEvent, screen, waitFor, cleanup } = runtime('@testing-library/react')
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
  render(React.createElement(client.KaogongView, { onOpenTeacher: prompt => prompts.push(prompt) }))
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

test('teaching handoff closes the standalone panel and exposes prompt when clipboard fails', async () => {
  mockApi()
  let sessions = 0
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('denied') } } })
  render(React.createElement(client.KaogongDashboard, { wide: false, ctx: { uiWorkspace: { startSession() { sessions++ } } } }))
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await screen.findByRole('textbox', { name: '教学提示' })
  assert.equal(sessions, 1)
  assert.equal(screen.queryByRole('dialog'), null)
  assert.match(screen.getByRole('textbox', { name: '教学提示' }).value, /增长率/)
})

test('failed teaching handoff keeps the standalone panel open with an error', async () => {
  mockApi()
  render(React.createElement(client.KaogongDashboard, { wide: true, ctx: { uiWorkspace: { startSession() { throw Error('session unavailable') } } } }))
  fireEvent.click(screen.getByRole('button', { name: '打开考公学习看板' }))
  fireEvent.click(await screen.findByRole('button', { name: '讲解' }))
  await screen.findByText('session unavailable')
  assert.ok(screen.getByRole('dialog'))
})

test('original sidebar registration opens the same view without requiring a workbench', async () => {
  mockApi()
  const registrations = []
  const ctx = {
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
