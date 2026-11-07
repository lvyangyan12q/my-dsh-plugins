import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'

const lesson = () => ({lesson:{request:{lessonId:'lesson-a',subject:'行测-资料分析',objective:'混合增长率',knowledgePointId:'point-a',requirePractice:false},roundIds:[],materials:[],notes:'',completion:null,revision:0},evidence:[],canConfirm:true,summary:'摘要'})

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser, IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

async function mountClassroom() {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    const path = String(input)
    if (path.endsWith('/list')) return new Response('[]')
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 0, goal: null})
    if (path.endsWith('/closeout-preview')) return Response.json({...lesson(), operation: null, candidates: []})
    return Response.json(lesson())
  }
  const practiceCalls: {subject?: string; title?: string; limit?: number}[] = []
  const root = createRoot(document.getElementById('root')!)
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState('summary-profile')}><LessonPanel active onOpenTeacher={async () => {}} onPractice={async context => { practiceCalls.push(context) }} /></KaogongStateContext.Provider>))
  const body = () => document.body.textContent ?? ''
  const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.textContent === label)
  const tab = (label: string) => [...document.querySelectorAll('[role=tab]')].find(node => node.textContent === label)
  const section = (id: string) => dom.window.document.getElementById(id)
  const highlighted = (id: string) => section(id)?.getAttribute('data-section-highlight') === 'true'
  return {
    dom,
    practiceCalls,
    body,
    tab,
    section,
    highlighted,
    async click(label: string) {
      const node = button(label)
      assert.ok(node, `找不到按钮：${label}`)
      await act(async () => node.click())
    },
    async choose(question: number, letter: string) {
      const node = dom.window.document.querySelector(`button[aria-label="第 ${question} 题 选项 ${letter}"]`) as HTMLButtonElement | null
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

test('答错一题：解析下出现回对应小节，点击后回讲义并高亮目标小节', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    const jumpButtons = () => [...ui.dom.window.document.querySelectorAll('button')].filter(node => node.textContent === '回对应小节')
    assert.equal(jumpButtons().length, 0, '未作答时不应出现回跳按钮')
    await ui.choose(2, 'C')
    assert.equal(ui.tab('当堂检测')?.getAttribute('aria-selected'), 'true')
    assert.equal(jumpButtons().length, 1, '答错后应出现一个回对应小节按钮')

    await ui.click('回对应小节')
    assert.equal(ui.tab('讲义')?.getAttribute('aria-selected'), 'true', '应切到讲义页签')
    assert.match(ui.body(), /快速思路/)
    assert.equal(ui.highlighted('handout-s5'), true, '第 2 题应高亮 handout-s5')
    assert.equal(ui.section('handout-s6')?.getAttribute('data-section-highlight'), null, '其他小节不应高亮')
  } finally {
    await ui.unmount()
  }
})

test('三题全错：小结 0 / 3 正确，并回到对应小节重读', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'A')
    await ui.choose(2, 'C')
    await ui.choose(3, 'C')
    assert.match(ui.body(), /0 \/ 3 正确/)
    assert.match(ui.body(), /先别急着刷题/)
    assert.match(ui.body(), /回对应小节重读/)

    await ui.click('回对应小节重读')
    assert.equal(ui.tab('讲义')?.getAttribute('aria-selected'), 'true')
    assert.equal(ui.highlighted('handout-s5'), true)
  } finally {
    await ui.unmount()
  }
})

test('三题全对：小结 3 / 3 正确，去做 10 题专项触发练习入口', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'B')
    await ui.choose(2, 'A')
    await ui.choose(3, 'B')
    assert.match(ui.body(), /3 \/ 3 正确/)
    assert.match(ui.body(), /去做 10 题专项/)

    await ui.click('去做 10 题专项')
    assert.equal(ui.practiceCalls.length, 1, '应触发一次练习入口')
    assert.equal(ui.practiceCalls[0].subject, '行测-资料分析')
    assert.equal(ui.practiceCalls[0].title, '混合增长率')
    assert.equal(ui.practiceCalls[0].limit, 10)
  } finally {
    await ui.unmount()
  }
})

test('对两题：小结 2 / 3 正确，回错的那一节指向错题锚点', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'B')
    await ui.choose(2, 'A')
    await ui.choose(3, 'C')
    assert.match(ui.body(), /2 \/ 3 正确/)
    assert.match(ui.body(), /回错的那一节/)

    await ui.click('回错的那一节')
    assert.equal(ui.tab('讲义')?.getAttribute('aria-selected'), 'true')
    assert.equal(ui.highlighted('handout-s6'), true, '第 3 题错，应回 handout-s6')
    assert.equal(ui.section('handout-s5')?.getAttribute('data-section-highlight'), null)
  } finally {
    await ui.unmount()
  }
})

test('回跳高亮约 1.6 秒后自动清除', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(2, 'C')
    await ui.click('回对应小节')
    assert.equal(ui.highlighted('handout-s5'), true)
    await act(async () => { t.mock.timers.tick(1600) })
    assert.equal(ui.section('handout-s5')?.getAttribute('data-section-highlight'), null, '1.6 秒后应清除高亮')
  } finally {
    await ui.unmount()
  }
})
