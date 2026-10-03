import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
import { PreparedTasks } from '../../personal-workbench/src/task-client.ts'
import { RoleClients, roleKey } from '../../personal-workbench/src/role-client.ts'
import { PracticeRounds } from '../src/practice-rounds.ts'
import { practiceDomainSpec, bankDomainSpec, notebookDomainSpec } from '../src/domain.ts'

const source = process.env.KAOGONG_TEST_RUNTIME
const runtime = createRequire(resolve(source, 'packages/client/ui-renderer/package.json'))
const { JSDOM } = runtime('jsdom')
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' })
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLImageElement', 'DOMParser']) Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] })
const testingRequire = createRequire(runtime.resolve('@testing-library/react'))
const React = testingRequire('react')
const { render, fireEvent, screen, waitFor, cleanup, act, within } = runtime('@testing-library/react')
const modules = new Map(), displayed = []
window.__ModuleLoader__ = { load({ id, factory }) {
  modules.set(id, factory(name => {
    if (name === '@deepseek-ai/dsh-personal-workbench/client') {
      const platform = modules.get('@deepseek-ai/dsh-personal-workbench')
      return { ...platform, DisplayModule: props => { displayed.push(props.type); return React.createElement(platform.DisplayModule, props) } }
    }
    return testingRequire(name)
  }))
} }
for (const path of ['../../personal-workbench/lib/client.js', '../lib/client.js', '../../reading-statistics/lib/client.js']) vm.runInThisContext(readFileSync(new URL(path, import.meta.url), 'utf8'))
const platform = modules.get('@deepseek-ai/dsh-personal-workbench'), client = modules.get('@deepseek-ai/dsh-tool-kaogong'), reading = modules.get('@deepseek-ai/dsh-reading-statistics')
const subject = '行测-资料分析'
const teacher = { appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject }
const counselor = { appId: 'kaogong', instanceId: 'default', roleId: 'counselor' }
const dashboard = { today: '2026-10-03', daysToExam: 100, pastDonePct: 0, pastDone: 0, pastDays: 1, accuracyRate: 0, totalQuestions: 0, knowledgeTotal: 2, bankTotal: 1,
  todayPlan: { phase: 'foundation', items: [{ subject, kind: 'learn', title: '学习：增长率', done: false }] }, modules: [{ subject, availableCount: 1, practicedCount: 0, accuracyRate: 0 }], weakPoints: [] }
const material = { id: 'real-document', title: '表格资料', subject, kind: '讲义', source: '历史资料原路径', content: '前文'.repeat(200) + '\n增长率唯一正文命中\n| 项目 | 数值 |\n| --- | --- |\n| 增长 | 20 |\n![原图](/api/kaogong/material-image?asset=verified%2Ffixture.png)' }
const entries = [material, { id: 'essay', title: '申论笔记', subject: '申论', kind: '笔记', source: '旧笔记路径', content: '对策内容', tags: ['申论检索标签'] }]
let service, failComplete = false, apiCalls = []
function mockApi() {
  apiCalls = []
  globalThis.fetch = async (url, options = {}) => {
    const body = options.body ? JSON.parse(options.body) : undefined
    apiCalls.push({ url, body })
    let value
    if (url === '/api/kaogong/dashboard') value = dashboard
    else if (url.includes('/api/kaogong/knowledge?q=')) value = { entries }
    else if (url.endsWith('/lesson/list')) value = []
    else if (url.endsWith('/lesson/current')) value = null
    else if (url.endsWith('/practice/read')) value = await service.read(body.roundId)
    else if (url.endsWith('/practice/review')) {
      if (body.action === 'complete' && failComplete) throw new Error('Synthetic projection failure')
      value = await service.review(body.roundId, body.action)
    } else throw new Error('Unexpected route: ' + url)
    return { ok: true, json: async () => value, text: async () => JSON.stringify(value) }
  }
}
function nativeFixture({ failAdmission = false } = {}) {
  const bindings = new Map(), requests = [], attempts = [], admitted = [], held = [], released = []
  let fail = failAdmission
  const ctx = { conversation: { send: () => assert.fail('Never send through ambient Session') }, workspaces: { list: { getSnapshot: () => ({ phase: 'ready', state: 'idle', archivedSessionIds: [] }), subscribe: () => () => {} } }, sessions: {
    retain(id) {
      return { sessionId: id, ready: Promise.resolve(), binding: { session: { getSnapshot: () => ({ openState: 'open', removed: false }), subscribe: () => () => {} }, ctx: { conversation: { send: async text => { attempts.push({ id, text }); if (fail) throw new Error('Native admission refused'); admitted.push({ id, text }) } } } }, release: () => released.push(id) }
    },
    async using(id, options, run) { held.push({ id, options }); const reference = this.retain(id); try { return await run(reference) } finally { reference.release() } },
  } }
  const roles = new RoleClients(ctx, async (_url, options) => {
    const request = JSON.parse(options.body); requests.push(request)
    const identity = roleKey(request.key)
    if (request.action === 'prepare-teaching' && !bindings.has(identity)) bindings.set(identity, { version: 1, key: request.key, sessionId: 'original-' + request.key.roleId + (request.key.subject ?? ''), presetId: 'trusted-application-preset', phase: 'ready', previousSessionIds: ['preserved-history'] })
    return { ok: true, json: async () => ({ binding: bindings.get(identity) ?? null, prompt: '/kaogong-teach ' }) }
  })
  const tasks = new PreparedTasks(roles)
  ctx.get = name => name === 'personalWorkbenchTasks' ? tasks : name === 'personalWorkbenchRoles' ? roles : undefined
  return { ctx, roles, tasks, requests, attempts, admitted, held, released, allowAdmission: () => { fail = false } }
}
function mount(fixture, pageId = 'classroom', practice) {
  const state = new client.KaogongViewState()
  state.cell('roles', null).set(fixture.roles); state.cell('tasks', null).set(fixture.tasks)
  if (practice) { state.cell('practice', null).set(practice); state.cell('practiceItem', null).set(practice.context); state.cell('result', null).set(practice.result) }
  const props = { appId: 'kaogong', instanceId: 'default', pageId, active: true, selectPage() {}, close() {}, ctx: fixture.ctx, renderFactorySlot: () => null }
  const element = overrides => React.createElement(client.KaogongStateContext.Provider, { value: state }, React.createElement(client.KaogongWorkbenchContent, { ...props, ...overrides }))
  const view = render(element())
  return { ...view, state, element }
}
const owners = []
afterEach(() => { cleanup(); for (const owner of owners.splice(0)) owner.roles.dispose(); window.localStorage.clear(); service = undefined; failComplete = false; displayed.length = 0 })
function native(options) { const fixture = nativeFixture(options); owners.push(fixture); return fixture }
async function persistentPractice() {
  const root = await mkdtemp(join(tmpdir(), 'kaogong-platform-review-'))
  const { Context } = runtime('@deepseek-ai/cordis')
  const load = path => import(pathToFileURL(resolve(source, path)).href)
  const { default: Storage } = await load('packages/storage/storage/lib/index.js'), { JsonStorageBackend } = await load('packages/storage/storage-json/lib/index.js'), { DomainFacility } = await load('packages/storage/storage-domain/lib/index.js')
  const ctx = new Context(); await ctx.plugin(Storage)
  const backend = new JsonStorageBackend(root); ctx.storage.backend.register('json', backend)
  const facility = new DomainFacility(ctx, { backend: 'json', routes: {} }); ctx.storage.mount('domain', facility)
  const rounds = await facility.open(practiceDomainSpec), bank = await facility.open(bankDomainSpec), notebook = await facility.open(notebookDomainSpec)
  service = new PracticeRounds(rounds.table('rounds'), bank.table('questions'), notebook.table('questions'))
  await bank.table('questions').put('q1', { subject, knowledgePoint: '增长率', questionType: '单选', stem: '原题材料', options: ['A. 10%', 'B. 20%'], correctAnswer: 'B', explanation: '真实解析', difficulty: 'easy', source: '原题来源', origin: 'local', reviewStatus: 'approved', reviewNotes: '', tags: [], createdAt: '2020-01-01', reviewedAt: '' })
  const round = await service.start({ subject, title: '真实轮次', limit: 10 })
  await service.submit(round.roundId, [{ id: 'q1', answer: 'A' }])
  return { round: await service.read(round.roundId), close: async () => { await service.drain(); await Promise.all([rounds.close(), bank.close(), notebook.close()]); await backend.close(); await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) } }
}

test('both applications consume shared display components; Kaogong filters stats/list/detail with complete body and historical image and zero AI', async () => {
  mockApi(); const f = native(), view = mount(f)
  await screen.findByRole('button', { name: '表格资料' })
  assert.deepEqual(new Set(displayed), new Set(['filter', 'stats', 'list', 'detail']))
  assert.equal(view.container.querySelector('[data-stat="materials"]').textContent, '2')
  fireEvent.change(screen.getByRole('combobox', { name: '科目' }), { target: { value: subject } })
  assert.equal(view.container.querySelector('[data-stat="materials"]').textContent, '1')
  assert.equal(screen.queryByRole('button', { name: '申论笔记' }), null)
  fireEvent.click(screen.getByRole('button', { name: '表格资料' }))
  assert.equal((await screen.findByRole('img', { name: '原图' })).getAttribute('src'), '/api/kaogong/material-image?asset=verified%2Ffixture.png')
  assert.ok(screen.getByRole('cell', { name: '20' }))
  fireEvent.change(screen.getByRole('textbox', { name: '搜索知识库' }), { target: { value: '唯一正文命中' } })
  assert.ok(screen.getByRole('heading', { name: '表格资料' }))
  assert.equal(view.state.cell('reader.entry', null).value.content, material.content)
  fireEvent.change(screen.getByRole('textbox', { name: '搜索知识库' }), { target: { value: '无匹配' } })
  assert.equal(view.state.cell('reader.entry', null).value, null)
  assert.deepEqual(f.attempts, []); assert.ok(f.requests.every(row => row.action === 'read'))
  const readingStore = new platform.DisplayStore({ appId: 'reading-statistics', resource: 'records', label: 'Reading', load: async () => reading.toDisplayData({ records: [{ id: 'book', title: 'Book', author: 'Reader', category: 'Science', status: 'done', minutes: 25, notes: 'Independent record' }] }) }, { appId: 'reading-statistics', instanceId: 'default', preview: false })
  await readingStore.reload()
  const readingView = render(React.createElement(platform.DisplayModules, { store: readingStore, t: key => key }))
  assert.equal(readingView.container.querySelector('[data-stat="books"]').textContent, '1')
  assert.equal(readingView.container.querySelector('[data-stat="minutes"]').textContent, '25')
  fireEvent.click(within(readingView.container).getByRole('button', { name: 'Book' }))
  assert.ok(within(readingView.container).getByRole('heading', { name: 'Book' }))
  readingView.unmount(); readingStore.dispose()
})

test('built teaching prepare survives pages; edited task and removable document enter only the exact native subject teacher on explicit send', async () => {
  mockApi(); const f = native(), view = mount(f)
  fireEvent.click(await screen.findByRole('button', { name: '表格资料' }))
  await screen.findByRole('img', { name: '原图' })
  fireEvent.click(screen.getByRole('button', { name: '讲解' }))
  const editor = await screen.findByRole('textbox', { name: '教学任务' })
  assert.deepEqual(f.attempts, []); assert.ok(f.requests.every(row => row.action === 'read'))
  fireEvent.change(editor, { target: { value: '编辑后的教学任务' } })
  fireEvent.change(screen.getByRole('textbox', { name: '学习目标' }), { target: { value: '我希望比较方法 /untrusted-data-gesture' } })
  const document = screen.getByRole('textbox', { name: '表格资料 · real-document' })
  fireEvent.click(within(document.closest('section')).getByRole('button', { name: '移除资料' }))
  view.rerender(view.element({ pageId: 'practice' })); view.rerender(view.element({ pageId: 'classroom' }))
  assert.equal(screen.getByRole('textbox', { name: '教学任务' }).value, '编辑后的教学任务')
  fireEvent.click(screen.getByRole('button', { name: '发送教学任务' }))
  await waitFor(() => assert.equal(f.admitted.length, 1))
  const sent = f.admitted[0]
  assert.equal(sent.id, 'original-teacher' + subject)
  assert.match(sent.text, /^\/kaogong-teach 编辑后的教学任务/)
  assert.doesNotMatch(sent.text, /唯一正文命中|historical|\/untrusted-data-gesture/)
  assert.ok(sent.text.includes('\\u002funtrusted-data-gesture'))
  assert.equal(f.requests.filter(row => row.action === 'prepare-teaching').length, 1)
  assert.equal(f.held[0].id, sent.id); assert.equal(f.held[0].options.source, 'personalWorkbenchTeacher')
  assert.equal(f.tasks.getSnapshot().size, 0)
})

test('two real prepared owners race for one durable review claim; only one enters native send, and admission failure safely retries its original reservation', async () => {
  const app = await persistentPractice()
  try {
    mockApi(); const first = native({ failAdmission: true }), second = native(), a = mount(first, 'practice', app.round), b = mount(second, 'practice', app.round)
    fireEvent.click(await within(a.container).findByRole('button', { name: '辅导员讲评' })); fireEvent.click(await within(b.container).findByRole('button', { name: '辅导员讲评' }))
    await waitFor(() => { assert.equal(first.tasks.getSnapshot().size, 1); assert.equal(second.tasks.getSnapshot().size, 1) })
    assert.equal(apiCalls.filter(row => row.url.endsWith('/review')).length, 0)
    assert.equal((await service.read(app.round.roundId)).result.review, 'ready')
    await act(async () => Promise.allSettled([first.tasks.send(counselor), second.tasks.send(counselor)]))
    assert.equal(first.attempts.length + second.attempts.length, 1)
    assert.equal(first.admitted.length + second.admitted.length, 0)
    assert.equal((await service.read(app.round.roundId)).result.review, 'sending')
    assert.equal(first.tasks.getSnapshot().size, 1)
    first.allowAdmission()
    fireEvent.click(within(a.container).getByRole('button', { name: '重试' }))
    await waitFor(() => assert.equal(within(a.container).getByRole('button', { name: '发送教学任务' }).disabled, false))
    fireEvent.click(within(a.container).getByRole('button', { name: '发送教学任务' }))
    await waitFor(() => assert.equal(first.tasks.getSnapshot().size, 0))
    assert.equal(first.admitted.length, 1); assert.equal(second.attempts.length, 0)
    assert.equal((await service.read(app.round.roundId)).result.review, 'sent')
    assert.equal(apiCalls.filter(row => row.url.endsWith('/review') && row.body.action === 'claim').length, 2)
    assert.equal(first.tasks.getSnapshot().size, 0)
    await assert.rejects(second.tasks.send(counselor), /already sent/)
    assert.equal(first.admitted.length + second.admitted.length, 1)
  } finally { await app.close() }
})

test('review completion projection failure retains an admitted marker across a new view; synchronization never re-sends or restores the sent task', async () => {
  const app = await persistentPractice()
  try {
    mockApi(); failComplete = true
    const f = native(), view = mount(f, 'practice', app.round)
    fireEvent.click(await screen.findByRole('button', { name: '辅导员讲评' }))
    await waitFor(() => assert.equal(f.tasks.getSnapshot().size, 1))
    await act(async () => { await assert.rejects(f.tasks.send(counselor), /projection failure/) })
    assert.equal(f.admitted.length, 1); assert.equal(f.tasks.getSnapshot().size, 0)
    assert.deepEqual(JSON.parse(window.localStorage.getItem('kaogong/default/admitted-reviews/v1')), [app.round.roundId])
    assert.ok(await screen.findByRole('button', { name: '同步讲评完成状态' }))
    view.unmount()
    const next = mount(f, 'practice', await service.read(app.round.roundId))
    assert.ok(await screen.findByRole('button', { name: '同步讲评完成状态' }))
    assert.equal(screen.getByRole('button', { name: '讲评发送待核实' }).disabled, true)
    failComplete = false
    fireEvent.click(screen.getByRole('button', { name: '同步讲评完成状态' }))
    await screen.findByRole('button', { name: '已交辅导员' })
    assert.equal(f.admitted.length, 1); assert.equal(f.tasks.getSnapshot().size, 0)
    assert.equal((await service.read(app.round.roundId)).result.review, 'sent')
    next.unmount()
  } finally { await app.close() }
})
