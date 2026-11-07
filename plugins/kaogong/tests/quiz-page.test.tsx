import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {MIXED_GROWTH_QUIZ, gradeQuiz} from '../src/lesson-quiz.tsx'

const lesson = () => ({lesson:{request:{lessonId:'lesson-a',subject:'行测-资料分析',objective:'混合增长率',knowledgePointId:'point-a',requirePractice:false},roundIds:[],materials:[],notes:'',completion:null,revision:0},evidence:[],canConfirm:true,summary:'摘要'})

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser, IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

async function mountQuiz() {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  const calls: string[] = []
  globalThis.fetch = async (input) => {
    const path = String(input)
    calls.push(path)
    if (path.endsWith('/list')) return new Response('[]')
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 0, goal: null})
    if (path.endsWith('/closeout-preview')) return Response.json({...lesson(), operation: null, candidates: []})
    return Response.json(lesson())
  }
  const root = createRoot(document.getElementById('root')!)
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState('quiz-profile')}><LessonPanel active onOpenTeacher={async () => {}} onPractice={async () => {}} /></KaogongStateContext.Provider>))
  const body = () => document.body.textContent ?? ''
  const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.textContent === label)
  const option = (question: number, letter: string) => document.querySelector(`button[aria-label="第 ${question} 题 选项 ${letter}"]`) as HTMLButtonElement | null
  return {
    dom,
    calls,
    body,
    async click(label: string) {
      const node = button(label)
      assert.ok(node, `找不到按钮：${label}`)
      await act(async () => node.click())
    },
    async choose(question: number, letter: string) {
      const node = option(question, letter)
      assert.ok(node, `找不到第 ${question} 题选项 ${letter}`)
      await act(async () => node.click())
    },
    async unmount() {
      await act(async () => root.unmount())
      globalThis.fetch = original
      dom.window.close()
      restore()
    },
  }
}

test('判分纯函数：对错、解析、锚点与小结', () => {
  const partial = gradeQuiz(MIXED_GROWTH_QUIZ, [1, 2, null])
  assert.equal(partial.total, 3)
  assert.equal(partial.answered, 2)
  assert.equal(partial.correct, 1)
  assert.equal(partial.allAnswered, false)
  assert.equal(partial.summary, '')
  assert.equal(partial.items[0].correct, true)
  assert.match(partial.items[0].explanation, /6\.58%/)
  assert.equal(partial.items[0].anchorId, 'handout-s5')
  assert.equal(partial.items[1].correct, false)
  assert.equal(partial.items[2].chosen, null)
  assert.deepEqual(partial.wrongItems.map(item => item.id), ['quiz-2'], '错题计数只来自已作答且答错的题')

  const done = gradeQuiz(MIXED_GROWTH_QUIZ, [1, 0, 1])
  assert.equal(done.correct, 3)
  assert.equal(done.allAnswered, true)
  assert.equal(done.summary, '检测 3 / 3 正确')
  assert.deepEqual(done.wrongItems, [])
})

test('当堂检测：初始不泄露答案，答对立即判分并计数', async () => {
  const ui = await mountQuiz()
  try {
    await ui.click('当堂检测')
    const before = ui.calls.length
    assert.match(ui.body(), /检测 0\/3/)
    assert.match(ui.body(), /第 1 题/)
    assert.match(ui.body(), /5\.4%/)
    assert.match(ui.body(), /自编检测题：教学设计用，非真题/, '检测页应标明自编、非真题')
    assert.doesNotMatch(ui.body(), /6\.58%/, '作答前不应出现解析')
    assert.doesNotMatch(ui.body(), /混合不可能等于其中一个部分值/, '作答前不应出现解析')
    assert.doesNotMatch(ui.body(), /回答正确|回答错误/, '作答前不应出现判分')

    await ui.choose(1, 'B')
    assert.match(ui.body(), /检测 1\/3/)
    assert.match(ui.body(), /回答正确/)
    assert.match(ui.body(), /6\.58%/)
    assert.match(ui.body(), /区间 5\.8–8\.4/)
    assert.equal(ui.dom.window.document.querySelector('[data-choice-state="correct"]')?.getAttribute('aria-label'), '第 1 题 选项 B')
    for (const letter of ['A', 'B', 'C', 'D']) {
      assert.equal(ui.dom.window.document.querySelector(`button[aria-label="第 1 题 选项 ${letter}"]`)?.hasAttribute('disabled'), true, `第 1 题 ${letter} 应锁定`)
    }
    assert.deepEqual(ui.calls.slice(before), ['/api/kaogong/lesson/quiz'], '当堂检测判分只写一条课堂检测证据，不写错题本或统计')
  } finally {
    await ui.unmount()
  }
})

test('当堂检测：答错标出正确项，并给出解析', async () => {
  const ui = await mountQuiz()
  try {
    await ui.click('当堂检测')
    await ui.choose(2, 'C')
    assert.match(ui.body(), /检测 1\/3/)
    assert.match(ui.body(), /回答错误，正确选项是 A/)
    assert.match(ui.body(), /十字交叉/)
    assert.equal(ui.dom.window.document.querySelector('[data-choice-state="correct"]')?.getAttribute('aria-label'), '第 2 题 选项 A')
    assert.equal(ui.dom.window.document.querySelector('[data-choice-state="wrong"]')?.getAttribute('aria-label'), '第 2 题 选项 C')
    assert.equal(ui.dom.window.document.querySelectorAll('[data-choice-state="dim"]').length, 2)
  } finally {
    await ui.unmount()
  }
})

test('当堂检测：已答的题不能改选，三题各带目标小节锚点', async () => {
  const ui = await mountQuiz()
  try {
    await ui.click('当堂检测')
    assert.deepEqual([...ui.dom.window.document.querySelectorAll('[data-quiz-anchor]')].map(node => node.getAttribute('data-quiz-anchor')), ['handout-s5', 'handout-s5', 'handout-s6'])

    await ui.choose(1, 'B')
    await ui.choose(1, 'A')
    assert.match(ui.body(), /检测 1\/3/, '改选不应推进计数')
    assert.equal(ui.dom.window.document.querySelector('[data-choice-state="correct"]')?.getAttribute('aria-label'), '第 1 题 选项 B')
    assert.equal(ui.dom.window.document.querySelector('button[aria-label="第 1 题 选项 A"]')?.getAttribute('data-choice-state'), 'dim')

    await ui.choose(1, 'D')
    assert.match(ui.body(), /检测 1\/3/, '已锁定的题再点也不推进计数')
  } finally {
    await ui.unmount()
  }
})
