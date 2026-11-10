import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

const quizEntry = (questionId: string, index: number, choice: number, correct: boolean, section: string) => ({
  questionId, index, choice, correct, section, answeredAt: '2026-11-07T10:00:00.000Z',
})

const lesson = (lessonId: string, objective: string, quiz?: unknown[]) => ({
  lesson: {
    request: {lessonId, subject: '行测-资料分析', objective, requirePractice: false},
    roundIds: [], materials: [], notes: '', completion: null, revision: 0, ...(quiz ? {quiz} : {}),
  },
  evidence: [], canConfirm: true, summary: '摘要',
})

const firstLesson = {id: 'lesson-a', subject: '行测-资料分析', objective: '混合增长率', completed: false, updatedAt: '2026-11-07T10:00:00.000Z'}
const secondLesson = {id: 'lesson-b', subject: '行测-资料分析', objective: '增长量比较', completed: false, updatedAt: '2026-11-07T10:00:00.000Z'}
const contentlessLesson = {id: 'lesson-c', subject: '行测-资料分析', objective: '资料分析综合', completed: false, updatedAt: '2026-11-07T10:00:00.000Z'}

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser, IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

let profileSequence = 0

async function mountClassroom(options: {current?: string; records?: Record<string, ReturnType<typeof lesson>>; list?: typeof firstLesson[]} = {}) {
  const records = options.records ?? {
    'lesson-a': lesson('lesson-a', '混合增长率'),
    'lesson-b': lesson('lesson-b', '增长量比较'),
  }
  const list = options.list ?? [firstLesson, secondLesson]
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const holder = {id: options.current ?? 'lesson-a'}
  const calls: {path: string; body?: any}[] = []
  globalThis.fetch = async (input, init) => {
    const path = String(input)
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
    calls.push({path, body})
    if (path.endsWith('/list')) return Response.json(list)
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 0, goal: null})
    if (path.endsWith('/closeout-preview')) return Response.json({...records[holder.id], operation: null, candidates: []})
    if (path.endsWith('/lesson/select')) { holder.id = body.lessonId; return Response.json(records[holder.id]) }
    return Response.json(records[holder.id])
  }
  const root = createRoot(document.getElementById('root')!)
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState('second-lesson-' + (++profileSequence))}><LessonPanel active onOpenTeacher={async () => {}} onPractice={async () => {}} /></KaogongStateContext.Provider>))
  const body = () => document.body.textContent ?? ''
  const option = (question: number, letter: string) => dom.window.document.querySelector(`button[aria-label="第 ${question} 题 选项 ${letter}"]`) as HTMLButtonElement | null
  const select = () => dom.window.document.querySelector('select[aria-label="持久课堂"]') as HTMLSelectElement | null
  const taskState = (key: string) => dom.window.document.querySelector(`[data-lesson-tasks] [data-task-key="${key}"]`)?.getAttribute('data-task-state')
  return {
    dom,
    calls,
    body,
    option,
    taskState,
    async click(label: string) {
      const node = [...document.querySelectorAll('button')].find(button => button.textContent === label)
      assert.ok(node, `找不到按钮：${label}`)
      await act(async () => node.click())
    },
    async choose(question: number, letter: string) {
      const node = option(question, letter)
      assert.ok(node, `找不到第 ${question} 题选项 ${letter}`)
      await act(async () => node.click())
      // 作答的保存请求不阻塞点击，这里冲掉它的微任务。
      await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
    },
    async switchTo(lessonId: string) {
      const node = select()
      assert.ok(node, '找不到持久课堂选择器')
      await act(async () => {
        node.value = lessonId
        node.dispatchEvent(new dom.window.Event('change', {bubbles: true}))
      })
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

test('内容注册表按顺序挂接：第一课在前，第二课在后，都不命中为空', async () => {
  const {LESSON_CONTENTS, resolveLessonContent} = await import('../src/lesson-content.ts')
  assert.deepEqual(LESSON_CONTENTS.map(content => content.handout.title), ['混合增长率', '增长量比较'])
  assert.equal(resolveLessonContent({objective: '混合增长率'})?.handout.title, '混合增长率')
  assert.equal(resolveLessonContent({knowledgePoint: '增长量比较'})?.handout.title, '增长量比较')
  assert.equal(resolveLessonContent({objective: '资料分析综合', knowledgePoint: '增长率比较'}), null)
})

test('课堂目标是增长量比较时渲染第二课，且不出现第一课的内容', async () => {
  const ui = await mountClassroom({current: 'lesson-b', list: [secondLesson]})
  try {
    assert.match(ui.body(), /增长量比较/)
    assert.doesNotMatch(ui.body(), /混合增长率/)
    assert.match(ui.body(), /一句话结论/)
    assert.match(ui.body(), /两个快解/)
    assert.match(ui.body(), /一个陷阱/)
    assert.match(ui.body(), /两者都大则必大/)
    assert.match(ui.body(), /现期 × 增长率 ÷ \(1 \+ 增长率\)/)
    assert.match(ui.body(), /自编讲义：例题为教学设计用，非真题/)
  } finally {
    await ui.unmount()
  }
})

test('第二课检测可作答：答对答错都判分并给解析，回跳落到第二课小节', async () => {
  const ui = await mountClassroom({current: 'lesson-b', list: [secondLesson]})
  try {
    await ui.click('当堂检测')
    assert.match(ui.body(), /检测 0\/3/)
    assert.match(ui.body(), /自编检测题：教学设计用，非真题/)

    await ui.choose(1, 'B')
    assert.equal(ui.option(1, 'B')!.getAttribute('data-choice-state'), 'correct')
    assert.equal(ui.option(1, 'B')!.disabled, true, '已答题应锁定')
    assert.match(ui.body(), /回答正确/)
    assert.match(ui.body(), /16\.7/, '解析应给出甲的增长量')
    assert.match(ui.body(), /18\.2/, '解析应给出乙的增长量')

    await ui.choose(2, 'B')
    assert.equal(ui.option(2, 'B')!.getAttribute('data-choice-state'), 'wrong')
    assert.equal(ui.option(2, 'A')!.getAttribute('data-choice-state'), 'correct')
    assert.match(ui.body(), /回答错误，正确选项是 A/)
    assert.match(ui.body(), /式子正确/)
    assert.match(ui.body(), /检测 2\/3/)

    const writes = ui.calls.filter(call => call.path.endsWith('/api/kaogong/lesson/quiz'))
    assert.equal(writes.length, 2)
    assert.deepEqual(
      {questionId: writes[0].body.entry.questionId, index: writes[0].body.entry.index, section: writes[0].body.entry.section, correct: writes[0].body.entry.correct},
      {questionId: 'growth-quiz-1', index: 0, section: 'handout2-s2', correct: true},
    )

    await ui.click('回对应小节')
    assert.equal(ui.dom.window.document.getElementById('handout2-s2')?.getAttribute('data-section-highlight'), 'true', '第 2 题应回 handout2-s2')
  } finally {
    await ui.unmount()
  }
})

test('切换课堂后作答、计数、锁定态与读完状态都回到该课记录，不串课', async () => {
  const records = {
    'lesson-a': lesson('lesson-a', '混合增长率', [quizEntry('quiz-1', 0, 1, true, 'handout-s5')]),
    'lesson-b': lesson('lesson-b', '增长量比较'),
    'lesson-c': lesson('lesson-c', '资料分析综合'),
  }
  const ui = await mountClassroom({current: 'lesson-a', records, list: [firstLesson, secondLesson, contentlessLesson]})
  try {
    assert.match(ui.body(), /检测 1\/3/, '第一课的已保存作答应恢复')
    await ui.click('当堂检测')
    assert.equal(ui.option(1, 'B')!.getAttribute('data-choice-state'), 'correct')
    assert.equal(ui.option(1, 'B')!.disabled, true)

    await ui.switchTo('lesson-b')
    assert.match(ui.body(), /增长量比较/, '应渲染第二课讲义')
    assert.match(ui.body(), /检测 0\/3/, '切课后计数应归零')
    assert.doesNotMatch(ui.body(), /混合增长率实验台/)
    await ui.click('当堂检测')
    assert.equal(ui.option(1, 'B')!.getAttribute('data-choice-state'), null, '上一课的作答不应带到新课')
    assert.equal(ui.option(1, 'B')!.disabled, false, '新课的题应可作答')
    assert.doesNotMatch(ui.body(), /回答正确/)

    await ui.switchTo('lesson-a')
    assert.match(ui.body(), /检测 1\/3/, '切回第一课应恢复该课记录')
    assert.match(ui.body(), /混合增长率实验台/)
    await ui.click('当堂检测')
    assert.equal(ui.option(1, 'B')!.getAttribute('data-choice-state'), 'correct')
    assert.equal(ui.option(1, 'B')!.disabled, true)

    await ui.switchTo('lesson-c')
    assert.match(ui.body(), /本课暂无讲义。/)
    assert.equal(ui.taskState('read'), 'current', '切到没有讲义的课，读完状态不能沿用上一课')
  } finally {
    await ui.unmount()
  }
})

test('第一课仍然正常：目标是混合增长率时渲染第一课并保留原检测', async () => {
  const ui = await mountClassroom({current: 'lesson-a', list: [firstLesson]})
  try {
    assert.match(ui.body(), /混合增长率/)
    assert.match(ui.body(), /混合增长率实验台/)
    assert.doesNotMatch(ui.body(), /增长量比较/)

    await ui.click('当堂检测')
    assert.match(ui.body(), /检测 0\/3/)
    assert.match(ui.body(), /2022 年某地城镇居民人均可支配收入/)
    assert.match(ui.body(), /自编检测题：教学设计用，非真题/)
    await ui.choose(1, 'B')
    assert.match(ui.body(), /检测 1\/3/)
  } finally {
    await ui.unmount()
  }
})
