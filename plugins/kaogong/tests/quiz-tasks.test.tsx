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
  const calls: {method: string; path: string}[] = []
  globalThis.fetch = async (input, init) => {
    const path = String(input)
    calls.push({method: init?.method ?? 'GET', path})
    if (path.endsWith('/list')) return new Response('[]')
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 0, goal: null})
    if (path.endsWith('/closeout-preview')) return Response.json({...lesson(), operation: null, candidates: []})
    return Response.json(lesson())
  }
  const practiceCalls: {subject?: string; title?: string; limit?: number}[] = []
  const root = createRoot(document.getElementById('root')!)
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState('tasks-profile')}><LessonPanel active onOpenTeacher={async () => {}} onPractice={async context => { practiceCalls.push(context) }} /></KaogongStateContext.Provider>))
  const body = () => document.body.textContent ?? ''
  const button = (label: string) => [...document.querySelectorAll('button')].find(node => node.textContent === label)
  const task = (key: string) => dom.window.document.querySelector(`[data-lesson-tasks] [data-task-key="${key}"]`)
  const taskState = (key: string) => task(key)?.getAttribute('data-task-state')
  const tab = (label: string) => [...document.querySelectorAll('[role=tab]')].find(node => node.textContent === label)
  const section = (id: string) => dom.window.document.getElementById(id)
  const highlighted = (id: string) => section(id)?.getAttribute('data-section-highlight') === 'true'
  return {
    dom,
    calls,
    practiceCalls,
    body,
    task,
    taskState,
    tab,
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

test('初始四步：讲义渲染即标记读完，测成为当前步，其余待开始，且没有回炉卡', async () => {
  const ui = await mountClassroom()
  try {
    assert.ok(ui.task('read'), '课堂里应出现课后任务四步')
    assert.match(ui.task('read')!.textContent ?? '', /读/)
    assert.match(ui.task('quiz')!.textContent ?? '', /测/)
    assert.match(ui.task('practice')!.textContent ?? '', /练/)
    assert.match(ui.task('reheat')!.textContent ?? '', /回炉/)
    assert.equal(ui.taskState('read'), 'done', '讲义已渲染，读即完成')
    assert.equal(ui.taskState('quiz'), 'current')
    assert.equal(ui.taskState('practice'), 'pending')
    assert.equal(ui.taskState('reheat'), 'pending')
    assert.equal(ui.dom.window.document.querySelector('[data-reheat-card]'), null, '没有错题时不应出现回炉卡')
    assert.doesNotMatch(ui.body(), /待回炉/)
  } finally {
    await ui.unmount()
  }
})

test('打开检测：页签只切页签，读与作答进度都不因点击检测而改变', async () => {
  const ui = await mountClassroom()
  try {
    assert.equal(ui.taskState('read'), 'done', '读在讲义渲染时已完成，不靠点检测')
    await ui.click('当堂检测')
    assert.equal(ui.taskState('read'), 'done')
    assert.equal(ui.taskState('quiz'), 'current')

    await ui.choose(1, 'B')
    assert.match(ui.task('quiz')!.textContent ?? '', /检测 1\/3/)

    await ui.click('讲义')
    assert.match(ui.task('quiz')!.textContent ?? '', /检测 1\/3/, '切到讲义后检测进度仍应显示')
    await ui.click('当堂检测')
    assert.match(ui.task('quiz')!.textContent ?? '', /检测 1\/3/, '切回检测后作答不应丢失')
    assert.match(ui.body(), /检测 1\/3/)
    assert.equal(ui.dom.window.document.querySelector('button[aria-label="第 1 题 选项 B"]')?.getAttribute('data-choice-state'), 'correct')
  } finally {
    await ui.unmount()
  }
})

test('三题答完：练成为当前步，专项练习入口复用面板的 onPractice', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'B')
    await ui.choose(2, 'A')
    await ui.choose(3, 'B')
    assert.equal(ui.taskState('quiz'), 'done')
    assert.equal(ui.taskState('practice'), 'current')

    const entry = [...ui.dom.window.document.querySelectorAll('button')].find(node => node.textContent === '进入专项练习')
    assert.ok(entry, '课后任务应提供练习入口')
    assert.equal(entry.hasAttribute('data-variant'), false, '课后任务的练习入口不是主按钮')
    const primaries = [...ui.dom.window.document.querySelectorAll('[data-variant="primary"]')].filter(node => node.getAttribute('aria-label') !== '新建课堂')
    assert.equal(primaries.length, 1, '内容区同屏只保留一个主按钮')
    assert.equal(primaries[0].textContent, '去做 10 题专项')

    const before = ui.calls.length
    await ui.click('进入专项练习')
    assert.equal(ui.practiceCalls.length, 1, '应触发一次练习入口')
    assert.equal(ui.practiceCalls[0].subject, '行测-资料分析')
    assert.equal(ui.practiceCalls[0].title, '混合增长率')
    assert.equal(ui.practiceCalls[0].limit, 10)
    assert.equal(ui.calls.length, before, '进入专项练习不应写错题本或统计')
  } finally {
    await ui.unmount()
  }
})

test('错两题：回炉亮起显示待回炉 2 题，可回对应小节重读或重做检测', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'B')
    await ui.choose(2, 'C')
    await ui.choose(3, 'C')
    assert.equal(ui.taskState('practice'), 'current')
    assert.equal(ui.taskState('reheat'), 'ready')
    assert.match(ui.task('reheat')!.textContent ?? '', /待回炉 2 题/)
    assert.ok(ui.dom.window.document.querySelector('[data-reheat-card]'), '有错题时应出现回炉卡')
    assert.match(ui.dom.window.document.querySelector('[data-reheat-card]')!.textContent ?? '', /待回炉 2 题/)

    await ui.click('回对应小节重读')
    assert.equal(ui.tab('讲义')?.getAttribute('aria-selected'), 'true', '应切到讲义页签')
    assert.equal(ui.highlighted('handout-s5'), true, '第一道错题在第 5 节，应高亮该节')

    await ui.click('重做检测')
    assert.equal(ui.tab('当堂检测')?.getAttribute('aria-selected'), 'true', '重做检测应切回检测页签')
    assert.match(ui.body(), /检测 0\/3/, '重做检测应清空作答')
    assert.equal(ui.taskState('quiz'), 'current')
    assert.equal(ui.dom.window.document.querySelector('[data-reheat-card]'), null, '清空后不应再有回炉卡')
  } finally {
    await ui.unmount()
  }
})

test('全对：回炉显示无需回炉，且不出现回炉卡', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'B')
    await ui.choose(2, 'A')
    await ui.choose(3, 'B')
    assert.equal(ui.taskState('reheat'), 'done')
    assert.match(ui.task('reheat')!.textContent ?? '', /无需回炉/)
    assert.equal(ui.dom.window.document.querySelector('[data-reheat-card]'), null)
  } finally {
    await ui.unmount()
  }
})

test('检测与课后任务全程不写错题本、不写统计', async () => {
  const ui = await mountClassroom()
  try {
    await ui.click('当堂检测')
    await ui.choose(1, 'B')
    await ui.choose(2, 'C')
    await ui.choose(3, 'C')
    await ui.click('回对应小节重读')
    await ui.click('重做检测')

    const forbidden = ui.calls.filter(call => /notebook|question|statistic|practice\/(round|submit|score)/.test(call.path))
    assert.deepEqual(forbidden, [], '课堂检测不应产生错题本、题库或统计写入请求')
    const writes = ui.calls.filter(call => call.method !== 'GET' && !/\/api\/kaogong\/lesson\/(list|current|read|closeout-preview|quiz)$/.test(call.path))
    assert.deepEqual(writes, [], '课堂检测只允许写当堂检测证据，不应写错题本、统计或练习成绩')
  } finally {
    await ui.unmount()
  }
})
