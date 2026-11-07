import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import type {Handout} from '../src/lesson-handout.tsx'

const lesson = (request: Record<string, unknown> = {}) => ({lesson:{request:{lessonId:'lesson-a',subject:'行测-资料分析',objective:'混合增长率',knowledgePointId:'point-a',requirePractice:false, ...request},roundIds:[],materials:[],notes:'',completion:null,revision:0},evidence:[],canConfirm:true,summary:'摘要'})

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser, IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

let profileSequence = 0

async function mountPanel(view = lesson()) {
  const {dom, restore} = environment()
  const original = globalThis.fetch
  globalThis.fetch = async (input) => {
    const path = String(input)
    if (path.endsWith('/list')) return new Response('[]')
    if (path.includes('/api/kaogong/plan')) return Response.json({tasks: [], revision: 0, goal: null})
    if (path.endsWith('/closeout-preview')) return Response.json({...view, operation: null, candidates: []})
    return Response.json(view)
  }
  const root = createRoot(document.getElementById('root')!)
  const {LessonPanel} = await import('../src/lesson-panel.tsx')
  const {KaogongStateContext, KaogongViewState} = await import('../src/view-state.tsx')
  const profile = 'handout-profile-' + (++profileSequence)
  await act(async () => root.render(<KaogongStateContext.Provider value={new KaogongViewState(profile)}><LessonPanel active onOpenTeacher={async () => {}} onPractice={async () => {}} /></KaogongStateContext.Provider>))
  const body = () => document.body.textContent ?? ''
  const click = async (label: string) => act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === label)!.click())
  return {
    dom,
    body,
    click,
    tabs: () => [...document.querySelectorAll('[role=tab]')].map(node => node.textContent),
    async unmount() {
      await act(async () => root.unmount())
      globalThis.fetch = original
      dom.window.close()
      restore()
    },
  }
}

test('课堂的讲义页签渲染整节课，并能收起慢解', async () => {
  const ui = await mountPanel()
  try {
    assert.deepEqual(ui.tabs(), ['讲义', '当堂检测'])
    assert.match(ui.body(), /混合增长率/)
    assert.match(ui.body(), /一句话结论/)
    assert.match(ui.body(), /自编讲义/)
    assert.ok(ui.body().includes('60×12'), '默认应看到慢解')

    await ui.click('只看快速思路')
    assert.ok(!ui.body().includes('60×12'), '收起后不应再出现慢解')
    assert.match(ui.body(), /显示慢解/)

    await ui.click('当堂检测')
    assert.match(ui.body(), /检测 0\/3/)
    assert.match(ui.body(), /第 1 题/)
    assert.ok(!ui.body().includes('一句话结论'), '切走后讲义不再显示')

    await ui.click('讲义')
    assert.match(ui.body(), /一句话结论/)
  } finally {
    await ui.unmount()
  }
})

test('讲义渲染器只认结构，换一份数据就换一节课', async () => {
  const {dom, restore} = environment()
  const root = createRoot(document.getElementById('root')!)
  try {
    const {HandoutView} = await import('../src/lesson-handout.tsx')
    const fixture: Handout = {
      id: 'engineering', subject: '行测-数量关系', title: '工程问题', goal: '会给总量设特值', provenance: '自编讲义：练习用，非真题。',
      sections: [{id: 'f1', no: '01', title: '核心一句', blocks: [{kind: 'p', text: '把工作总量设成时间的公倍数。'}]}],
    }
    await act(async () => root.render(<HandoutView handout={fixture} />))
    assert.match(document.body.textContent ?? '', /工程问题/)
    assert.match(document.body.textContent ?? '', /核心一句/)
    assert.match(document.body.textContent ?? '', /公倍数/)
    assert.doesNotMatch(document.body.textContent ?? '', /混合增长率/)
  } finally {
    await act(async () => root.unmount())
    dom.window.close()
    restore()
  }
})

test('本课不匹配混合增长率：讲义空态、页签可用、不显示检测', async () => {
  const ui = await mountPanel(lesson({objective: '资料分析综合', knowledgePoint: '增长率比较'}))
  try {
    assert.match(ui.body(), /本课暂无讲义。/)
    assert.doesNotMatch(ui.body(), /一句话结论/)
    assert.doesNotMatch(ui.body(), /混合增长率实验台/)
    assert.deepEqual(ui.tabs(), ['讲义', '当堂检测'], '不匹配时页签仍可用')

    await ui.click('当堂检测')
    assert.match(ui.body(), /本课暂无检测。/)
    assert.doesNotMatch(ui.body(), /第 1 题/)
    assert.doesNotMatch(ui.body(), /检测 0\/3/)

    await ui.click('讲义')
    assert.match(ui.body(), /本课暂无讲义。/)
  } finally {
    await ui.unmount()
  }
})

test('限定考点命中关键词也视为匹配：讲义与检测都显示', async () => {
  const ui = await mountPanel(lesson({objective: '资料分析综合', knowledgePoint: '增长率混合问题'}))
  try {
    assert.doesNotMatch(ui.body(), /本课暂无讲义。/)
    assert.match(ui.body(), /一句话结论/)

    await ui.click('当堂检测')
    assert.match(ui.body(), /检测 0\/3/)
    assert.match(ui.body(), /第 1 题/)
    assert.match(ui.body(), /自编检测题：教学设计用，非真题/)
  } finally {
    await ui.unmount()
  }
})
