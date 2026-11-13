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
      ...(row.knowledgePoint ? {knowledgePoint: row.knowledgePoint} : {}),
      ...(row.knowledgePointId ? {knowledgePointId: row.knowledgePointId} : {}),
      taskId: row.id, planRevision: row.startedFromRevision},
    roundIds: [], materials: [], notes: '', completion: null, revision: 0,
  },
  evidence: [], canConfirm: true, summary: '摘要',
})

const legacyList = {id: 'legacy-lesson', subject: '申论', objective: '旧课堂：申论归纳概括', completed: true, updatedAt: '2026-01-01T00:00:00.000Z'}
const legacyView = {
  lesson: {request: {lessonId: 'legacy-lesson', subject: '申论', objective: '旧课堂：申论归纳概括', requirePractice: false},
    roundIds: [], materials: [], notes: '旧课堂笔记', completion: {confirmedAt: '2026-01-01T00:00:00.000Z'}, revision: 3},
  evidence: [], canConfirm: false, summary: '旧课堂摘要',
}

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
  const calls: {path: string; method: string}[] = []
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
    calls.push({path, method: init?.method ?? 'GET'})
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    if (path === '/api/kaogong/plan') return Response.json(structuredClone(state))
    if (path === '/api/kaogong/plan/start') {
      const value = await start(body)
      return Response.json(value, {status: 'error' in value ? 409 : 200})
    }
    if (path === '/api/kaogong/dashboard') return Response.json(dashboard())
    if (path.endsWith('/lesson/list')) return Response.json([legacyList])
    if (path.endsWith('/lesson/read')) return Response.json(body?.lessonId === 'legacy-lesson' ? legacyView : [...lessons.values()].find(value => value!.lesson.request.lessonId === body?.lessonId) ?? null)
    if (path.endsWith('/lesson/current')) return Response.json(null)
    if (path.endsWith('/closeout-preview')) return Response.json({...legacyView, operation: null, candidates: []})
    return Response.json(null)
  }
  return {state, lessons, calls, fetch}
}

async function mount(options: {tasks: Task[]; panel?: boolean}) {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const server = createServer(options)
  globalThis.fetch = server.fetch as typeof fetch
  const profile = 'fixed-roles-' + (++profileSequence)
  const root = createRoot(document.getElementById('root')!)
  const {SdkClassroom} = await import('../src/sdk-classroom.tsx')
  const {KaogongStateContext, KaogongPresentationContext, KaogongViewStatePool} = await import('../src/view-state.tsx')
  const pool = new KaogongViewStatePool()
  const ensured: string[] = []
  const opened: unknown[] = []
  const embedded: string[] = []
  const roles = {
    read: async () => null,
    ensure: async (roleId: string) => { ensured.push(roleId); return {phase: 'ready' as const, sessionId: 'role-' + roleId, revision: 1} },
    open: async (...args: unknown[]) => { opened.push(args) },
  }
  const tasks = {
    prepare: async () => ({}),
    prepareOwned: async () => ({}),
    list: async () => [],
    edit: async () => ({}),
    submit: async () => ({}),
    recover: async () => ({}),
    discard: async () => ({}),
  }
  const renderTeacherSession = (sessionId: string): ReactNode => {
    embedded.push(sessionId)
    return <div data-teacher-embed={sessionId}>原生老师会话</div>
  }
  await act(async () => root.render(
    <KaogongStateContext.Provider value={pool.forInstance(profile)}>
      <KaogongPresentationContext.Provider value={pool.forView(profile, 'view:' + profile)}>
        <SdkClassroom {...{profile: {id: profile, title: '备考'}, view: {id: 'view:' + profile}, roles, tasks, renderTeacherSession, ...(options.panel ? {panel: true} : {})} as never}/>
      </KaogongPresentationContext.Provider>
    </KaogongStateContext.Provider>,
  ))
  const settle = async (action?: () => void, wait = 0) => act(async () => { action?.(); await new Promise(resolve => setTimeout(resolve, wait)) })
  const nav = async (title: string) => settle(() => {
    ;[...document.querySelectorAll('nav[aria-label="学习页面"] button')].find(button => button.textContent === title)!.dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}))
  })
  const click = async (label: string, index = 0) => settle(() => {
    const nodes = [...document.querySelectorAll('button')].filter(button => button.textContent === label)
    assert.ok(nodes[index], `找不到按钮：${label} #${index}（${document.body.textContent}）`)
    nodes[index].dispatchEvent(new dom.window.MouseEvent('click', {bubbles: true}))
  })
  return {
    dom, body: () => document.body.textContent ?? '', server, ensured, opened, embedded, nav, click, settle,
    async unmount() {
      await act(async () => root.unmount())
      pool.dispose(); globalThis.fetch = original; dom.window.close(); restore()
    },
  }
}

const roleConfigurators = () => [
  ...document.querySelectorAll('[aria-label="教师科目"],[aria-label="学习角色"],[aria-label="课堂科目"],[aria-label="学习目标"],[aria-label="限定考点"]'),
]

test('今日任务直达课堂，主流程不再出现角色、教师科目、选课堂或新建课堂入口', async () => {
  const ui = await mount({tasks: [task({id: 'task-fixed', title: '增长量比较', knowledgePoint: '增长量比较', knowledgePointId: 'point-growth', lessonId: 'lesson-fixed'})]})
  try {
    assert.equal(document.querySelector('[aria-label="考公学习内容"]') !== null, true)
    assert.doesNotMatch(ui.body(), /老师与角色设置/)
    assert.doesNotMatch(ui.body(), /资料与工具/)
    assert.deepEqual(roleConfigurators(), [])
    assert.equal([...document.querySelectorAll('button')].some(button => ['任课老师', '班主任', '辅导员'].includes(button.textContent ?? '')), false, '角色不再是可点击选项')
    assert.doesNotMatch(ui.body(), /新建课堂|选择课堂|还没有选中的课堂/)

    await ui.click('开始任务')
    assert.match(ui.body(), /增长量比较/)
    assert.doesNotMatch(ui.body(), /新建课堂|选择课堂|教师科目|学习目标|限定考点/)
    assert.deepEqual(roleConfigurators(), [])
    assert.equal(document.querySelectorAll('[contenteditable="true"]').length, 0)
  } finally {
    await ui.unmount()
  }
})

test('进入当前任务课堂自动使用该任务的老师，无需任何选择', async () => {
  const ui = await mount({tasks: [task({id: 'task-teacher', title: '增长量比较', knowledgePoint: '增长量比较', knowledgePointId: 'point-growth', lessonId: 'lesson-teacher'})]})
  try {
    await ui.click('开始任务')
    await ui.settle(undefined, 10)
    assert.deepEqual(ui.opened, [], '课堂不会替学习者打开别的角色会话')
    assert.deepEqual([...new Set(ui.ensured)].includes('teacher.data-analysis'), true, '老师由任务科目决定：' + JSON.stringify(ui.ensured))
    assert.equal(ui.embedded.at(-1), 'role-teacher.data-analysis')
    assert.equal([...document.querySelectorAll('[data-teacher-embed]')].length, 1, '同一课堂只挂一个老师会话')
    assert.match(ui.body(), /老师/)
  } finally {
    await ui.unmount()
  }
})

test('规划与督学有固定的班主任入口，不暴露角色选择', async () => {
  const ui = await mount({tasks: []})
  try {
    assert.match(ui.body(), /规划与计划调整由班主任承接/)
    assert.deepEqual(roleConfigurators(), [])
    await ui.click('找班主任讨论安排')
    await ui.settle(undefined, 10)
    assert.deepEqual(ui.ensured, ['class-advisor'], '规划入口固定使用班主任')
    assert.deepEqual(ui.opened, [], '正常讨论不得强制导航原生会话页')
    assert.ok(document.querySelector('[aria-label="班主任讨论"]'),'班主任讨论保留在插件内')
    assert.deepEqual(roleConfigurators(), [], '固定入口不是角色配置器')
  } finally {
    await ui.unmount()
  }
})

test('职责分工在界面上可辨识：今日与学习路线是班主任，课堂是老师', async () => {
  const ui = await mount({tasks: [task({id: 'task-duty', title: '增长量比较', knowledgePoint: '增长量比较', knowledgePointId: 'point-growth', lessonId: 'lesson-duty'})]})
  try {
    const advisor = () => document.querySelector('[data-role="class-advisor"]')?.textContent ?? ''
    const teacher = () => document.querySelector('[data-role="teacher"]')?.textContent ?? ''
    assert.match(advisor(), /班主任/)
    assert.match(advisor(), /规划/)
    assert.equal(document.querySelector('[data-role="teacher"]'), null)
    assert.match(ui.body(), /规划与计划调整由班主任承接/)

    await ui.nav('学习路线')
    assert.match(advisor(), /班主任/)
    assert.match(ui.body(), /规划与计划调整由班主任承接/)

    await ui.nav('今日')
    await ui.click('开始任务')
    assert.match(teacher(), /老师/)
    assert.match(teacher(), /任务|课堂/)
    assert.equal(document.querySelector('[data-role="class-advisor"]'), null, '课堂里不再出现班主任配置')
  } finally {
    await ui.unmount()
  }
})

test('历史课堂与历史会话保留为次级入口，只读查看，不改写当前任务课堂', async () => {
  const ui = await mount({tasks: [task({id: 'task-history', title: '增长量比较', knowledgePoint: '增长量比较', knowledgePointId: 'point-growth', lessonId: 'lesson-history'})]})
  try {
    await ui.click('开始任务')
    assert.match(ui.body(), /增长量比较/)
    assert.doesNotMatch(ui.body(), /旧课堂：申论归纳概括/, '历史记录默认不抢戏')
    const toggle = [...document.querySelectorAll('button')].find(button => button.textContent === '历史课堂与会话')!
    assert.ok(toggle, '保留一个历史入口')
    await ui.settle(() => toggle.dispatchEvent(new ui.dom.window.MouseEvent('click', {bubbles: true})))
    await ui.settle(undefined, 10)
    assert.match(ui.body(), /旧课堂：申论归纳概括/)
    assert.match(ui.body(), /历史角色会话/)
    assert.match(ui.body(), /原生会话/)
    await ui.click('查看记录')
    await ui.settle(undefined, 10)
    assert.match(ui.body(), /旧课堂笔记/)
    assert.match(ui.body(), /旧课堂摘要/)
    assert.match(ui.body(), /增长量比较/, '查看历史不改写当前任务课堂')
    assert.equal(ui.server.calls.some(call => /\/lesson\/(create|select|summary)$/.test(call.path) && call.method === 'POST'), false, '历史只读，不创建、不选择、不改写课堂')
  } finally {
    await ui.unmount()
  }
})

test('右栏课堂面板同样没有角色配置，课堂老师随任务固定', async () => {
  const ui = await mount({tasks: [task({id: 'task-panel', title: '增长量比较', knowledgePoint: '增长量比较', knowledgePointId: 'point-growth', lessonId: 'lesson-panel'})], panel: true})
  try {
    assert.match(ui.body(), /课堂学习面板/)
    assert.doesNotMatch(ui.body(), /老师与角色设置/)
    assert.deepEqual(roleConfigurators(), [])
    assert.equal([...document.querySelectorAll('button')].some(button => ['任课老师', '班主任', '辅导员'].includes(button.textContent ?? '')), false)
    assert.equal(ui.embedded.length, 0, '右栏面板不挂第二个对话输入')
  } finally {
    await ui.unmount()
  }
})
