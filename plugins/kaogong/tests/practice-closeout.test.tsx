import test from 'node:test'
import assert from 'node:assert/strict'
import React,{act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
    localStorage: dom.window.localStorage, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser,
    IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

const roundId = '20000000-0000-4000-8000-000000000001'
const lessonId = '30000000-0000-4000-8000-000000000001'

function lessonView(overrides: Record<string, unknown> = {}) {
  return {
    lesson: {
      request: {lessonId, subject: '行测-资料分析', objective: '增长量比较', knowledgePoint: '增长量比较',
        knowledgePointId: 'point-growth', requirePractice: true, requireReflections: true, taskId: 'task-a', planRevision: 2},
      roundIds: [], materials: [], notes: '', completion: null, revision: 0,
    },
    evidence: [], canConfirm: false, summary: '课堂摘要', ...overrides,
  }
}

const practiceRound = () => ({roundId, context: {subject: '行测-资料分析', title: '增长量比较', knowledgePoint: '增长量比较', limit: 10, taskId: 'task-a', planRevision: 2},
  reason: '任务练习', totalAvailable: 1, returned: 1, cycled: false, result: null, reflections: [],
  questions: [{id: 'q-one', subject: '行测-资料分析', knowledgePoint: '增长量比较', difficulty: 'easy', stem: '首项是多少', options: ['A. 1', 'B. 2'], source: '合成题'}]})

const dashboard = () => ({today: '2026-11-09', examDate: null, daysToExam: null, totalDays: 0, pastDays: 0, pastDone: 0,
  pastDonePct: 0, totalQuestions: 0, totalCorrect: 0, totalWrong: 0, accuracyRate: 0, bankTotal: 0, knowledgeTotal: 0,
  todayPlan: {phase: 'foundation', items: []}, modules: [], weakPoints: [], recentKnowledge: []})

test('classroom practice starts the task round it belongs to, with no round number to type', async () => {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const calls: {path: string; body: any}[] = []
  globalThis.fetch = async (input, init) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({path, body})
    if (path.endsWith('/lesson/list')) return Response.json([])
    if (path.endsWith('/lesson/current')) return Response.json(lessonView())
    if (path.endsWith('/lesson/read')) return Response.json(lessonView())
    if (path.endsWith('/closeout-preview')) return Response.json({...lessonView(), operation: null, candidates: []})
    if (path.includes('/practice/start')) return Response.json(practiceRound())
    if (path.includes('/practice/history')) return Response.json({rounds: []})
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 2, goal: null})
    if (path.includes('/dashboard')) return Response.json(dashboard())
    return Response.json(null)
  }
  const {KaogongView} = await import('../src/kaogong-view.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  const owner = new KaogongViewState('practice-closeout-profile')
  owner.cell('lesson.view', null).set(lessonView() as never)
  owner.cell('lesson.notes', '').set('')
  owner.cell('dashboard', null).set(dashboard() as never)
  const root = createRoot(document.getElementById('root')!)
  function View() {
    const [page, setPage] = useState('classroom')
    return <KaogongStateContext.Provider value={owner}>
      <KaogongView embedded active taskCentered pageId={page} onSelectPage={setPage}
        onOpenTeacher={async () => { assert.fail('practice entry must not send teaching automatically') }} />
    </KaogongStateContext.Provider>
  }
  try {
    await act(async () => root.render(<View />))
    assert.equal(document.querySelector('[aria-label="任务作答轮次"]'), null, '课堂里不应要求手填作答轮次')
    const entry = [...document.querySelectorAll('button')].find(button => button.textContent === '课后练习')
    assert.ok(entry, '课堂里应有本任务的练习入口')
    await act(async () => entry.click())
    const start = calls.find(call => call.path === '/api/kaogong/practice/start')
    assert.ok(start, '点击练习应只发起一次本任务练习')
    assert.equal(start.body.taskId, 'task-a', '练习起点必须是本任务')
    assert.equal(start.body.planRevision, 2, '练习起点必须带本任务的计划版本')
    assert.equal(start.body.knowledgePoint, '增长量比较')
    assert.equal('roundId' in start.body, false, '不允许靠客户端填轮次编号建立关联')
    assert.match(document.body.textContent ?? '', /增长量比较/, '练习页仍显示本任务')
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = original
    dom.window.close()
    restore()
  }
})

test('a wrong in-class answer returns to its handout section and can ask the teacher for that step', async () => {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const calls: {path: string; body: any}[] = []
  globalThis.fetch = async (input, init) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({path, body})
    if (path.endsWith('/lesson/list')) return Response.json([])
    if (path.endsWith('/lesson/current')) return Response.json(lessonView())
    if (path.endsWith('/lesson/read')) return Response.json(lessonView())
    if (path.endsWith('/closeout-preview')) return Response.json({...lessonView(), operation: null, candidates: []})
    if (path.endsWith('/lesson/quiz')) return Response.json(lessonView())
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 2, goal: null})
    if (path.includes('/dashboard')) return Response.json(dashboard())
    return Response.json(null)
  }
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  const teacher: {prompt: string; request: any}[] = []
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState('explain-profile')}>
      <LessonPanel active onPractice={async () => {}} onOpenTeacher={async (prompt, request) => { teacher.push({prompt, request}) }} />
    </KaogongStateContext.Provider>))
    await act(async () => [...document.querySelectorAll('[role=tab]')].find(node => node.textContent === '当堂检测')!.click())
    const wrong = dom.window.document.querySelector('button[aria-label="第 1 题 选项 A"]') as HTMLButtonElement
    assert.ok(wrong, '第 1 题应有 A 选项（答错分支）')
    await act(async () => wrong.click())
    assert.ok([...document.querySelectorAll('button')].some(node => node.textContent === '回对应小节'))
    const explain = [...document.querySelectorAll('button')].find(node => node.textContent === '请老师补讲这一步') as HTMLButtonElement | undefined
    assert.ok(explain, '答错后应能针对这一步请老师补讲')
    await act(async () => explain!.click())
    assert.equal(teacher.length, 1, '补讲只发起一次教师请求')
    assert.equal(teacher[0].request.kind, 'lesson')
    assert.equal(teacher[0].request.context.taskId, 'task-a', '补讲仍属于本任务课堂')
    assert.equal(teacher[0].request.lessonEvidence.id, lessonId, '补讲复用本课的任务会话依据')
    assert.match(teacher[0].prompt, /handout2-s2/)
    assert.match(teacher[0].prompt, /第 1 题/)
    assert.equal(calls.some(call => /lesson\/(confirm|summary)$/.test(call.path)), false, '补讲不等于确认已学')
    assert.equal(calls.some(call => /\/api\/kaogong\/plan\/(complete|summary|done)/.test(call.path)), false, '补讲不写计划完成')
    await act(async () => [...document.querySelectorAll('button')].find(node => node.textContent === '回对应小节')!.click())
    assert.equal([...document.querySelectorAll('[role=tab]')].find(node => node.textContent === '讲义')!.getAttribute('aria-selected'), 'true')
    assert.equal(dom.window.document.getElementById('handout2-s2')?.getAttribute('data-section-highlight'), 'true')
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = original
    dom.window.close()
    restore()
  }
})

test('one closeout holds the summary and confirmation, and missing conditions come with direct actions', async () => {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const calls: {path: string; body: any}[] = []
  const emptyLesson = () => ({...lessonView(), lesson: {...lessonView().lesson, notes: ''}})
  globalThis.fetch = async (input, init) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({path, body})
    if (path.endsWith('/lesson/list')) return Response.json([])
    if (path.endsWith('/lesson/current')) return Response.json(emptyLesson())
    if (path.endsWith('/lesson/read')) return Response.json(emptyLesson())
    if (path.endsWith('/closeout-preview')) return Response.json({...emptyLesson(), operation: null, candidates: []})
    if (path.includes('/practice/start')) return Response.json(practiceRound())
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 2, goal: null})
    if (path.includes('/dashboard')) return Response.json(dashboard())
    return Response.json(null)
  }
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  const practiced: unknown[] = []
  const root = createRoot(document.getElementById('root')!)
  try {
    await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState('closeout-profile')}>
      <LessonPanel active onPractice={async context => { practiced.push(context) }} onOpenTeacher={async () => {}} />
    </KaogongStateContext.Provider>))
    const closeout = dom.window.document.querySelector('section[aria-label="学习收尾"]')
    assert.ok(closeout, '课堂里应有唯一的收尾区')
    assert.equal(document.querySelectorAll('textarea[aria-label="学习者总结"]').length, 1, '学习者总结只有一个入口')
    assert.ok(closeout!.querySelector('textarea[aria-label="学习者总结"]'), '总结就在收尾区里')
    assert.equal([...document.querySelectorAll('button')].filter(node => node.textContent === '保存总结').length, 0, '不能再有第二个保存总结入口')
    const missing = closeout!.querySelector('[data-closeout-missing]')
    assert.ok(missing, '缺条件时应列出缺项而不是只有禁用按钮')
    assert.match(missing!.textContent ?? '', /学习者总结/)
    assert.match(missing!.textContent ?? '', /尚缺本课已提交的练习/)
    const action = (label: string) => [...closeout!.querySelectorAll('button')].find(node => node.textContent === label) as HTMLButtonElement | undefined
    assert.ok(action('去写总结'), '总结缺项应有直达操作')
    assert.ok(action('去做本课练习'), '练习缺项应有直达操作')
    const confirmButton = () => [...document.querySelectorAll('button')].find(node => node.textContent === '确认完成并保存选择') as HTMLButtonElement
    assert.equal(confirmButton().disabled, false, '缺条件时不用禁用按钮代替说明')
    await act(async () => action('去做本课练习')!.click())
    assert.equal(practiced.length, 1, '直达操作直接进入本任务练习')
    assert.equal((practiced[0] as any).taskId, 'task-a')
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = original
    dom.window.close()
    restore()
  }
})

test('rendering, browsing, one right answer and a teacher reply never mark the lesson learned or read', async () => {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const calls: {path: string; body: any}[] = []
  globalThis.fetch = async (input, init) => {
    const path = String(input), body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({path, body})
    if (path.endsWith('/lesson/list')) return Response.json([])
    if (path.endsWith('/lesson/current')) return Response.json(lessonView())
    if (path.endsWith('/lesson/read')) return Response.json(lessonView())
    if (path.endsWith('/closeout-preview')) return Response.json({...lessonView(), operation: null, candidates: []})
    if (path.endsWith('/lesson/quiz')) return Response.json(lessonView())
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 2, goal: null})
    if (path.includes('/dashboard')) return Response.json(dashboard())
    return Response.json(null)
  }
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  const root = createRoot(document.getElementById('root')!)
  const taskState = (key: string) => dom.window.document.querySelector(`[data-lesson-tasks] [data-task-key="${key}"]`)?.getAttribute('data-task-state')
  const completionWrites = () => calls.filter(call => /lesson\/(confirm|summary)$/.test(call.path) || /plan\/(complete|summary|done)/.test(call.path))
  try {
    await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState('read-profile')}>
      <LessonPanel active onPractice={async () => {}} onOpenTeacher={async () => {}} />
    </KaogongStateContext.Provider>))
    assert.equal(taskState('read'), 'current', '讲义渲染不等于已读完成')
    assert.equal(taskState('quiz'), 'pending', '没确认读完前测不是当前步')
    assert.deepEqual(completionWrites(), [], '渲染或浏览不写完成')
    await act(async () => [...document.querySelectorAll('[role=tab]')].find(node => node.textContent === '当堂检测')!.click())
    await act(async () => (dom.window.document.querySelector('button[aria-label="第 1 题 选项 B"]') as HTMLButtonElement).click())
    assert.match(document.body.textContent ?? '', /回答正确/)
    assert.equal(taskState('read'), 'current', '答对一题不等于已读')
    assert.deepEqual(completionWrites(), [], '答对一题不等于已学')
    await act(async () => [...document.querySelectorAll('[role=tab]')].find(node => node.textContent === '讲义')!.click())
    const readGate = [...document.querySelectorAll('button')].find(node => node.textContent === '读完本节，开始检测') as HTMLButtonElement | undefined
    assert.ok(readGate, '读要由学习者自己确认，不靠渲染或页签点击')
    await act(async () => readGate!.click())
    assert.equal(taskState('read'), 'done')
    assert.deepEqual(completionWrites(), [], '确认读完仍不等于确认完成学习')
  } finally {
    await act(async () => root.unmount())
    globalThis.fetch = original
    dom.window.close()
    restore()
  }
})
