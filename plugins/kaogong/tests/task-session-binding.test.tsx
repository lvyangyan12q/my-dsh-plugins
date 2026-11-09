import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import type {ReactNode} from 'react'
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
    request: {lessonId: row.lessonId, subject: row.subject, objective: row.title, requirePractice: false,
      knowledgePoint: row.knowledgePoint, taskId: row.id, planRevision: row.startedFromRevision},
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

function createServer(options: {tasks: Task[]}) {
  const state = {revision: 0, goal: null, tasks: structuredClone(options.tasks), drafts: [], completionProposals: [], history: [], externalMocks: []}
  const lessons = new Map<string, ReturnType<typeof lessonView>>()
  const start = async (body: {id: string; revision: number}) => {
    const row = state.tasks.find(entry => entry.id === body.id)!
    if (row.status === 'in-progress' && row.startedFromRevision === body.revision) return {state: structuredClone(state), lesson: lessons.get(row.id)}
    if (state.revision !== body.revision) return {error: '计划版本已变化'}
    row.status = 'in-progress'; row.startedFromRevision = body.revision; row.revision++; state.revision++
    if (!row.lessonId) row.lessonId = `lesson-${row.id}`
    if (!lessons.has(row.id)) lessons.set(row.id, lessonView(row) as never)
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
    if (path.endsWith('/lesson/current')) return Response.json(null)
    return Response.json(null)
  }
  return {state, lessons, fetch}
}

async function mount(tasks: Task[]) {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const server = createServer({tasks})
  globalThis.fetch = server.fetch as typeof fetch
  const profile = 'task-session-profile-' + (++profileSequence)
  const root = createRoot(document.getElementById('root')!)
  const {SdkClassroom} = await import('../src/sdk-classroom.tsx')
  const {KaogongStateContext, KaogongPresentationContext, KaogongViewStatePool} = await import('../src/view-state.tsx')
  const pool = new KaogongViewStatePool()
  const embedded: string[] = []
  const sessionCalls: string[] = []
  const ensured: string[] = []
  const roles = {
    read: async () => null,
    ensure: async (roleId: string) => { ensured.push(roleId); return {phase: 'ready' as const, sessionId: 'role-' + roleId, revision: 1} },
    open: async () => {},
  }
  const tasksFacade = {
    session: async (taskId: string) => { sessionCalls.push(taskId); return {sessionId: 'task-session-' + taskId, revision: 1} },
    prepare: async () => ({}), prepareOwned: async () => ({}), list: async () => [], edit: async () => ({}),
    submit: async () => ({}), recover: async () => ({}), discard: async () => ({}),
  }
  const renderTeacherSession = (sessionId: string) => {
    embedded.push(sessionId)
    return <div data-teacher-embed={sessionId}>原生老师会话</div>
  }
  await act(async () => root.render(
    <KaogongStateContext.Provider value={pool.forInstance(profile)}>
      <KaogongPresentationContext.Provider value={pool.forView(profile, 'view:' + profile)}>
        <SdkClassroom {...{profile: {id: profile, title: '备考'}, view: {id: 'view:' + profile}, roles, tasks: tasksFacade, renderTeacherSession} as never}/>
      </KaogongPresentationContext.Provider>
    </KaogongStateContext.Provider>,
  ))
  const settle = async (action?: () => void) => act(async () => { action?.(); await new Promise(resolve => setTimeout(resolve, 0)) })
  const click = async (label: string) => settle(() => {
    const node = [...document.querySelectorAll('button')].find(button => button.textContent === label)
    assert.ok(node, `找不到按钮：${label}（${document.body.textContent}）`)
    node.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}))
  })
  const nav = async (title: string) => settle(() => {
    ;[...document.querySelectorAll('nav[aria-label="学习页面"] button')].find(button => button.textContent === title)!.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}))
  })
  return {
    dom, server, embedded, sessionCalls, ensured, click, nav,
    embeds: () => [...document.querySelectorAll('[data-teacher-embed]')].map(node => node.getAttribute('data-teacher-embed')),
    async unmount() {
      await act(async () => root.unmount())
      pool.dispose(); globalThis.fetch = original; dom.window.close(); restore()
    },
  }
}

test('开始任务后答疑挂在该任务自己的会话，切到另一任务不沿用上一个任务的会话', async () => {
  const first = task({id: 'task-1', title: '增长量比较', knowledgePoint: '增长量比较'})
  const second = task({id: 'task-2', title: '混合增长率', knowledgePoint: '混合增长率'})
  const ui = await mount([first, second])
  try {
    await ui.click('开始任务') // 今天的第一个任务
    assert.equal((await ui.embeds()).at(-1), 'task-session-task-1', '课堂答疑使用任务会话')
    assert.ok(ui.sessionCalls.includes('task-1'))
    await ui.nav('今日')
    assert.deepEqual(await ui.embeds(), [], '离开课堂即卸载会话')
    await ui.click('开始任务') // 另一个任务
    assert.equal((await ui.embeds()).at(-1), 'task-session-task-2', '切到另一任务后使用该任务的会话')
    assert.deepEqual([...new Set(ui.sessionCalls)], ['task-1', 'task-2'], '每个任务各自解析会话，没有复用')
    assert.deepEqual(ui.sessionCalls.filter(id => id === 'task-2'), ['task-2'])
    assert.ok(!(await ui.embeds()).includes('task-session-task-1'), '不能回落到上一个任务的会话')
  } finally {
    await ui.unmount()
  }
})

test('旧课堂没有任务身份时仍挂角色会话，不伪造任务绑定', async () => {
  const ui = await mount([])
  try {
    await ui.nav('课堂')
    assert.equal((await ui.embeds()).at(-1), 'role-teacher', '没有任务时回落到既有角色会话')
    assert.deepEqual(ui.sessionCalls, [], '没有任务身份就不创建任务会话')
  } finally {
    await ui.unmount()
  }
})
