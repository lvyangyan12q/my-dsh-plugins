import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {Lessons} from '../src/lessons.ts'
import {lessonRecord} from '../src/lesson-schema.ts'

const lessonId = '11111111-1111-4111-8111-111111111111'
const entry = (questionId: string, index: number, choice: number, correct: boolean) => ({
  questionId, index, choice, correct, section: index === 2 ? 'handout-s6' : 'handout-s5', answeredAt: '2026-11-07T10:00:00.000Z',
})
const lesson = (quiz?: unknown[]) => ({
  lesson: {
    request: {lessonId: 'lesson-a', subject: '行测-资料分析', objective: '混合增长率', knowledgePointId: 'point-a', requirePractice: false},
    roundIds: [], materials: [], notes: '', completion: null, revision: 0, ...(quiz ? {quiz} : {}),
  },
  evidence: [], canConfirm: true, summary: '摘要',
})

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser, IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

async function mountClassroom(options: {quiz?: unknown[]; failQuiz?: boolean} = {}) {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const calls: {method: string; path: string; body?: any}[] = []
  globalThis.fetch = async (input, init) => {
    const path = String(input)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({method: init?.method ?? 'GET', path, body})
    if (path.endsWith('/list')) return new Response('[]')
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 0, goal: null})
    if (path.endsWith('/closeout-preview')) return Response.json({...lesson(options.quiz), operation: null, candidates: []})
    if (path.endsWith('/lesson/quiz')) return options.failQuiz ? Response.json({error: '检测证据写入失败'}, {status: 500}) : Response.json(lesson())
    return Response.json(lesson(options.quiz))
  }
  const root = createRoot(document.getElementById('root')!)
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState('persist-profile')}><LessonPanel active onOpenTeacher={async () => {}} onPractice={async () => {}} /></KaogongStateContext.Provider>))
  const body = () => document.body.textContent ?? ''
  const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.textContent === label)
  const option = (question: number, letter: string) => dom.window.document.querySelector(`button[aria-label="第 ${question} 题 选项 ${letter}"]`) as HTMLButtonElement | null
  const quizCalls = () => calls.filter(call => call.path.endsWith('/api/kaogong/lesson/quiz'))
  return {
    dom,
    calls,
    quizCalls,
    body,
    option,
    async click(label: string) {
      const node = button(label)
      assert.ok(node, `找不到按钮：${label}`)
      await act(async () => node.click())
    },
    async choose(question: number, letter: string) {
      const node = option(question, letter)
      assert.ok(node, `找不到第 ${question} 题选项 ${letter}`)
      await act(async () => node.click())
      // The answer POST is deliberately not awaited by the click; flush its microtasks.
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    },
    async unmount() {
      await act(async () => root.unmount())
      globalThis.fetch = original
      dom.window.close()
      restore()
    },
  }
}

class MemoryTable {
  rows = new Map<string, any>()
  get size() { return this.rows.size }
  get(key: string) { return this.rows.get(key) }
  async put(key: string, value: any) { this.rows.set(key, structuredClone(value)) }
  *entries() { for (const entry of this.rows.entries()) yield entry }
  keys() { return this.rows.keys() }
  async update(key: string, operation: (value: any) => any) {
    const current = this.rows.get(key)
    if (current === undefined) return undefined
    const next = operation(structuredClone(current))
    this.rows.set(key, structuredClone(next))
    return structuredClone(next)
  }
  async delete(key: string) { return this.rows.delete(key) }
  async deleteMany(keys: string[]) { for (const key of keys) this.rows.delete(key) }
}

function lessonService() {
  const table = new MemoryTable()
  const selection = {get: () => ({instanceId: 'default', activeLessonId: lessonId}), async set() {}}
  const service = new Lessons(table as any, null as any, null as any, async () => null, selection as any)
  const record = {
    version: 1, instanceId: 'default',
    request: {lessonId, subject: '行测-资料分析', objective: '混合增长率', materialIds: [], requireReflections: false},
    objectiveId: lessonId + ':objective', homeworkId: lessonId + ':practice',
    roleKey: {appId: 'kaogong', instanceId: 'default', roleId: 'teacher', subject: '行测-资料分析'},
    binding: null, materials: [], roundIds: [], notes: '', completion: null,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', revision: 0,
  }
  return {table, service, record}
}

test('答一题后 POST 当堂检测证据：题号、选择、对错、小节都在 body 里', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'B')

    const writes = ui.quizCalls()
    assert.equal(writes.length, 1, '答一题只应写一条检测证据')
    assert.equal(writes[0].method, 'POST')
    assert.equal(writes[0].body.lessonId, 'lesson-a')
    assert.deepEqual(
      {questionId: writes[0].body.entry.questionId, index: writes[0].body.entry.index, choice: writes[0].body.entry.choice,
        correct: writes[0].body.entry.correct, section: writes[0].body.entry.section},
      {questionId: 'quiz-1', index: 0, choice: 1, correct: true, section: 'handout-s5'},
    )
    assert.match(writes[0].body.entry.answeredAt, /^\d{4}-\d{2}-\d{2}T/)
    assert.match(ui.body(), /检测 1\/3/)
  } finally {
    await ui.unmount()
  }
})

test('服务端课堂带 quiz 时恢复作答与「检测 n/3」，已答题保持锁定', async () => {
  const ui = await mountClassroom({quiz: [entry('quiz-1', 0, 1, true), entry('quiz-2', 1, 2, false)]})
  try {
    assert.match(ui.body(), /检测 2\/3/, '打开课堂即应恢复已保存的检测计数')
    await ui.click('当堂检测')
    const first = ui.option(1, 'B')!
    const second = ui.option(2, 'C')!
    const third = ui.option(3, 'A')!
    assert.equal(first.getAttribute('data-choice-state'), 'correct')
    assert.equal(first.disabled, true, '已答题应保持锁定')
    assert.equal(second.getAttribute('data-choice-state'), 'wrong')
    assert.equal(second.disabled, true, '答错的已答题同样锁定')
    assert.equal(third.getAttribute('data-choice-state'), null)
    assert.equal(third.disabled, false, '未答题仍可作答')
  } finally {
    await ui.unmount()
  }
})

test('保存失败可见，但不阻塞继续答下一题', async () => {
  const ui = await mountClassroom({failQuiz: true})
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'B')
    const alert = ui.dom.window.document.querySelector('[role=alert]')
    assert.ok(alert, '保存失败必须有可见提示')
    assert.match(alert.textContent ?? '', /检测作答保存失败/)
    assert.match(ui.body(), /检测 1\/3/, '失败不应回滚已作出的选择')

    await ui.choose(2, 'A')
    assert.match(ui.body(), /检测 2\/3/, '保存失败后仍应能继续答下一题')
    assert.equal(ui.option(2, 'A')!.getAttribute('data-choice-state'), 'correct')
    assert.equal(ui.option(3, 'A')!.disabled, false)
    assert.equal(ui.quizCalls().length, 2, '两题各自尝试写入，不因失败静默跳过')
  } finally {
    await ui.unmount()
  }
})

test('同一题重做按 questionId 覆盖，只保留一条且 revision 递增', async () => {
  const {table, service, record} = lessonService()
  assert.equal(lessonRecord.safeParse(record).success, true, '旧记录没有 quiz 字段也必须能解析')
  table.rows.set(lessonId, record)

  await service.saveQuiz(lessonId, entry('quiz-1', 0, 1, true))
  const afterFirst = table.rows.get(lessonId)!
  assert.equal(afterFirst.quiz.length, 1)
  assert.equal(afterFirst.revision, 1)

  await service.saveQuiz(lessonId, {...entry('quiz-1', 0, 2, false), answeredAt: '2026-11-07T10:05:00.000Z'})
  const afterRetake = table.rows.get(lessonId)!
  assert.equal(afterRetake.quiz.length, 1, '重做同一题不应堆叠重复记录')
  assert.equal(afterRetake.quiz[0].choice, 2)
  assert.equal(afterRetake.quiz[0].correct, false)
  assert.equal(afterRetake.quiz[0].answeredAt, '2026-11-07T10:05:00.000Z')
  assert.equal(afterRetake.revision, 2)

  await service.saveQuiz(lessonId, entry('quiz-2', 1, 0, true))
  const afterNext = table.rows.get(lessonId)!
  assert.deepEqual(afterNext.quiz.map((row: any) => row.questionId), ['quiz-1', 'quiz-2'])
  assert.equal(lessonRecord.safeParse(afterNext).success, true, '带 quiz 的记录也应通过同一 schema')

  await assert.rejects(service.saveQuiz('22222222-2222-4222-8222-222222222222', entry('quiz-3', 2, 1, true)), /课堂不存在/)
})
