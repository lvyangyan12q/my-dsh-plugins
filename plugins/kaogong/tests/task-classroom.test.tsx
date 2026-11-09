import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {studyDate} from '../src/study-date.ts'

type Task = {
  id: string; revision: number; subject: string; title: string; kind: 'learn'|'practice'|'review'
  phase: 'foundation'|'reinforce'|'sprint'; date: string|null; status: 'pending'|'in-progress'|'completed'
  requirePractice: boolean; requireReflections: boolean; summary: string; evidence: null
  knowledgePointId?: string; knowledgePoint?: string; startedFromRevision?: number; lessonId?: string
}

const task = (input: Partial<Task> & Pick<Task,'id'|'title'>): Task => ({
  revision: 1, subject: '行测-资料分析', kind: 'learn', phase: 'foundation', date: studyDate(), status: 'pending',
  requirePractice: false, requireReflections: true, summary: '', evidence: null, ...input,
})

const lessonView = (row: Task) => ({
  lesson: {
    request: {
      lessonId: row.lessonId, subject: row.subject, objective: row.title, requirePractice: false,
      ...(row.knowledgePoint ? {knowledgePoint: row.knowledgePoint} : {}),
      ...(row.knowledgePointId ? {knowledgePointId: row.knowledgePointId} : {}),
      taskId: row.id, planRevision: row.startedFromRevision,
    },
    roundIds: [], materials: [], notes: '', completion: null, revision: 0,
  },
  evidence: [], canConfirm: true, summary: '摘要',
})

const dashboard = () => ({today: studyDate(), examDate: null, daysToExam: null, totalDays: 0, pastDays: 0, pastDone: 0,
  pastDonePct: 0, totalQuestions: 0, totalCorrect: 0, totalWrong: 0, accuracyRate: 0, bankTotal: 0, knowledgeTotal: 0,
  todayPlan: {phase: 'foundation', items: []}, modules: [], weakPoints: [], recentKnowledge: []})

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser,
    IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

let profileSequence = 0

function createServer(options: {tasks: Task[]; delay?: Record<string, number>; current?: unknown}) {
  const state = {revision: 0, goal: null, tasks: structuredClone(options.tasks), drafts: [], completionProposals: [], history: [], externalMocks: []}
  const lessons = new Map<string, ReturnType<typeof lessonView>>()
  for (const row of state.tasks) if (row.status === 'in-progress' && row.lessonId) lessons.set(row.id, lessonView(row) as never)
  const starts: {id: string; revision: number}[] = []
  let created = lessons.size
  const start = async (body: {id: string; revision: number}) => {
    const row = state.tasks.find(entry => entry.id === body.id)!
    starts.push({id: body.id, revision: body.revision})
    const delay = options.delay?.[body.id] ?? 0
    if (delay) await new Promise(resolve => setTimeout(resolve, delay))
    if (row.status === 'in-progress' && row.startedFromRevision === body.revision) return {state: structuredClone(state), lesson: lessons.get(row.id)}
    if (state.revision !== body.revision) return {error: '计划版本已变化'}
    row.status = 'in-progress'
    row.startedFromRevision = body.revision
    row.revision++
    state.revision++
    if (!row.lessonId) row.lessonId = `lesson-${row.id}`
    if (!lessons.has(row.id)) { lessons.set(row.id, lessonView(row) as never); created++ }
    return {state: structuredClone(state), lesson: lessons.get(row.id)}
  }
  const fetch = async (input: string|URL|Request, init?: RequestInit) => {
    const path = String(input)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    if (path === '/api/kaogong/plan') return Response.json(structuredClone(state))
    if (path === '/api/kaogong/plan/start') {
      const value = await start(body)
      return Response.json(value, {status: 'error' in value ? 409 : 200})
    }
    if (path === '/api/kaogong/dashboard') return Response.json(dashboard())
    if (path.endsWith('/lesson/list')) return Response.json([])
    if (path.endsWith('/lesson/read')) return Response.json([...lessons.values()].find(value => value!.lesson.request.lessonId === body.lessonId) ?? null)
    if (path.endsWith('/lesson/current')) return Response.json(options.current ?? null)
    if (path.endsWith('/closeout-preview')) return Response.json({...(lessons.get(state.tasks.find(row => row.lessonId === body.lessonId)?.id ?? '') ?? lessonView(task({id: 'none', title: ''}))), operation: null, candidates: []})
    return Response.json(null)
  }
  return {state, lessons, starts, fetch, created: () => created}
}

async function mount(options: {tasks: Task[]; delay?: Record<string, number>; current?: unknown; recent?: string[]}) {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const server = createServer(options)
  globalThis.fetch = server.fetch as typeof fetch
  const profile = 'task-profile-' + (++profileSequence)
  if (options.recent) dom.window.localStorage.setItem('kaogong/recent-task/' + encodeURIComponent(profile), JSON.stringify(options.recent))
  const root = createRoot(document.getElementById('root')!)
  const {SdkClassroom} = await import('../src/sdk-classroom.tsx')
  const {KaogongStateContext, KaogongPresentationContext, KaogongViewStatePool} = await import('../src/view-state.tsx')
  const pool = new KaogongViewStatePool()
  const prepared: unknown[] = []
  const roles = {ensure: async () => ({phase: 'ready', sessionId: 'teacher-session', revision: 1}), open: async () => {}}
  const tasks = {prepare: async (input: unknown) => {prepared.push(input); return {}}, prepareOwned: async (input: unknown) => {prepared.push(input); return {}}}
  await act(async () => root.render(
    <KaogongStateContext.Provider value={pool.forInstance(profile)}>
      <KaogongPresentationContext.Provider value={pool.forView(profile, 'view:' + profile)}>
        <SdkClassroom {...{profile: {id: profile, title: '备考'}, view: {id: 'view:' + profile}, roles, tasks} as never}/>
      </KaogongPresentationContext.Provider>
    </KaogongStateContext.Provider>,
  ))
  const body = () => document.body.textContent ?? ''
  const nav = async (title: string) => settle(async () => {
    ;[...document.querySelectorAll('nav[aria-label="学习页面"] button')].find(button => button.textContent === title)!.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}))
  })
  async function settle(action?: () => void, wait = 0) {
    await act(async () => { action?.(); await new Promise(resolve => setTimeout(resolve, wait)) })
  }
  const click = async (label: string, index = 0) => settle(() => {
    const nodes = [...document.querySelectorAll('button')].filter(button => button.textContent === label)
    assert.ok(nodes[index], `找不到按钮：${label} #${index}`)
    nodes[index].dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}))
  })
  return {
    dom, body, nav, click, settle, server, prepared, pool, profile,
    start: async (label: string, index = 0) => click(label, index),
    async unmount() {
      await act(async () => root.unmount())
      pool.dispose()
      globalThis.fetch = original
      dom.window.close()
      restore()
    },
  }
}

test('今日开始任务直接进入该任务课堂，不出现新建课堂、目标、科目或角色选择', async () => {
  const row = task({id: 'task-second', title: '增长量比较', knowledgePoint: '增长量比较', knowledgePointId: 'point-growth', lessonId: 'lesson-second'})
  const ui = await mount({tasks: [row]})
  try {
    await ui.start('开始任务')
    assert.match(ui.body(), /增长量比较/)
    assert.match(ui.body(), /一句话结论/)
    assert.match(ui.body(), /两个快解/)
    assert.doesNotMatch(ui.body(), /新建课堂/)
    assert.doesNotMatch(ui.body(), /学习目标/)
    assert.doesNotMatch(ui.body(), /限定考点/)
    assert.doesNotMatch(ui.body(), /教师科目/)
    assert.equal(ui.dom.window.document.querySelector('[aria-label="课堂科目"]'), null)
    assert.equal(ui.dom.window.document.querySelector('[aria-label="学习目标"]'), null)
    assert.equal(ui.dom.window.document.querySelector('[aria-label="教师科目"]'), null)
    assert.deepEqual(ui.prepared, [], '开始任务不应再准备并打开原生老师会话')
    assert.deepEqual(ui.server.starts.map(call => call.id), ['task-second'])
  } finally {
    await ui.unmount()
  }
})

test('课堂导航恢复最近仍有效的学习任务，无任务时只给去今日学习入口', async () => {
  const older = task({id: 'task-older', title: '增长量比较', status: 'in-progress', startedFromRevision: 0, lessonId: 'lesson-older', knowledgePoint: '增长量比较'})
  const newer = task({id: 'task-newer', title: '混合增长率', status: 'in-progress', startedFromRevision: 0, lessonId: 'lesson-newer', knowledgePoint: '混合增长率'})
  const ui = await mount({tasks: [older, newer], recent: ['task-newer', 'task-older']})
  try {
    await ui.nav('课堂')
    assert.match(ui.body(), /混合增长率实验台/)
    assert.doesNotMatch(ui.body(), /增长量比较/)
    assert.deepEqual(ui.server.starts.map(call => call.id), ['task-newer'])
    assert.equal(ui.dom.window.document.querySelector('[aria-label="学习目标"]'), null)
  } finally {
    await ui.unmount()
  }

  const empty = await mount({tasks: []})
  try {
    await empty.nav('课堂')
    assert.match(empty.body(), /还没有学习任务/)
    assert.match(empty.body(), /去今日学习/)
    assert.doesNotMatch(empty.body(), /混合增长率实验台/)
    assert.doesNotMatch(empty.body(), /还没有选中的课堂/)
    await empty.click('去今日学习')
    assert.match(empty.body(), /今日学习/)
  } finally {
    await empty.unmount()
  }
})

test('重复点击同一任务回到同一课堂，不产生第二份课堂记录', async () => {
  const row = task({id: 'task-repeat', title: '增长量比较', knowledgePoint: '增长量比较', lessonId: 'lesson-repeat'})
  const ui = await mount({tasks: [row]})
  try {
    await ui.start('开始任务')
    assert.match(ui.body(), /课堂 lesson-repeat/)
    await ui.nav('今日')
    await ui.start('继续同一任务')
    assert.match(ui.body(), /课堂 lesson-repeat/)
    assert.deepEqual(ui.server.starts.map(call => call.revision), [0, 0], '继续同一任务应复用原 startedFromRevision')
    assert.equal(ui.server.created(), 1, '同一任务只应有一份课堂记录')
  } finally {
    await ui.unmount()
  }
})

test('不匹配任务知识点时显示真实空态，不渲染别人的讲义', async () => {
  const row = task({id: 'task-other', title: '资料分析综合', status: 'in-progress', startedFromRevision: 0, lessonId: 'lesson-other', knowledgePoint: '资料分析综合'})
  const ui = await mount({tasks: [row]})
  try {
    await ui.nav('课堂')
    assert.match(ui.body(), /本课暂无讲义/)
    assert.doesNotMatch(ui.body(), /混合增长率实验台/)
    assert.doesNotMatch(ui.body(), /增长量比较/)
    assert.doesNotMatch(ui.body(), /一句话结论/)
  } finally {
    await ui.unmount()
  }
})

test('过期任务响应不覆盖切换后进入的课堂', async () => {
  const slow = task({id: 'task-slow', title: '增长量比较', knowledgePoint: '增长量比较', lessonId: 'lesson-slow'})
  const current = task({id: 'task-current', title: '混合增长率', status: 'in-progress', startedFromRevision: 0, lessonId: 'lesson-current', knowledgePoint: '混合增长率'})
  const ui = await mount({tasks: [current, slow], delay: {'task-slow': 80}})
  try {
    await act(async () => {
      const [button] = [...document.querySelectorAll('button')].filter(node => node.textContent === '开始任务')
      assert.ok(button, '找不到慢任务的开始按钮')
      button.dispatchEvent(new ui.dom.window.MouseEvent('click', {bubbles: true}))
    })
    await ui.nav('课堂')
    assert.match(ui.body(), /混合增长率实验台/)
    await ui.settle(undefined, 120)
    assert.match(ui.body(), /混合增长率实验台/, '晚到的旧任务响应不应覆盖当前课堂')
    assert.doesNotMatch(ui.body(), /增长量比较实验台/)
    assert.doesNotMatch(ui.body(), /两个快解/)
  } finally {
    await ui.unmount()
  }
})
