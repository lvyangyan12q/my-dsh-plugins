import test from 'node:test'
import assert from 'node:assert/strict'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {JSDOM} from 'jsdom'
import {HandoutView, MIXED_GROWTH_HANDOUT, labCalculation} from '../src/lesson-handout.tsx'

function environment() {
  const dom = new JSDOM('<div id="root"></div>', {url: 'http://localhost'})
  const values = {window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, DOMParser: dom.window.DOMParser, IS_REACT_ACT_ENVIRONMENT: true}
  const saved = new Map(Object.keys(values).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]))
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, {configurable: true, writable: true, value})
  return {dom, restore() { for (const [key, value] of saved) value ? Object.defineProperty(globalThis, key, value) : Reflect.deleteProperty(globalThis, key) }}
}

async function mount(handout = MIXED_GROWTH_HANDOUT) {
  const env = environment()
  const root = createRoot(document.getElementById('root')!)
  await act(async () => root.render(<HandoutView handout={handout} />))
  const body = () => document.body.textContent ?? ''
  const buttons = () => [...document.querySelectorAll('button')] as HTMLButtonElement[]
  const click = async (label: string) => {
    const button = buttons().find(node => node.textContent === label)
    assert.ok(button, `找不到按钮：${label}`)
    await act(async () => button.click())
  }
  const setRange = async (label: string, value: string) => {
    const input = document.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement | null
    assert.ok(input, `找不到滑杆：${label}`)
    const setter = Object.getOwnPropertyDescriptor(env.dom.window.HTMLInputElement.prototype, 'value')!.set!
    await act(async () => {
      setter.call(input, value)
      input.dispatchEvent(new env.dom.window.Event('input', {bubbles: true}))
    })
  }
  return {
    dom: env.dom,
    body,
    buttons,
    click,
    setRange,
    async unmount() {
      await act(async () => root.unmount())
      env.dom.window.close()
      env.restore()
    },
  }
}

test('实验台纯计算：整体增长率、偏向与现期权重对照', () => {
  const example = labCalculation({aBase: 800, bBase: 200, aRate: 9.2, bRate: 4.6})
  assert.equal(example.overallRate.toFixed(2), '8.28')
  assert.equal(example.currentWeightRate.toFixed(2), '8.31')
  assert.equal(example.weightGap.toFixed(2), '0.03')
  assert.equal(example.lean, 'a')
  assert.equal(example.distanceToA.toFixed(1), '0.9')
  assert.equal(example.distanceToB.toFixed(1), '3.7')

  const equal = labCalculation({aBase: 500, bBase: 500, aRate: 9.2, bRate: 4.6})
  assert.equal(equal.overallRate.toFixed(2), '6.90')
  assert.equal(equal.lean, 'equal')

  const nine = labCalculation({aBase: 900, bBase: 100, aRate: 9.2, bRate: 4.6})
  assert.equal(nine.overallRate.toFixed(2), '8.74')

  const pulled = labCalculation({aBase: 800, bBase: 400, aRate: 20, bRate: 0})
  assert.equal(pulled.overallRate.toFixed(2), '13.33')
  assert.equal(pulled.currentWeightRate.toFixed(2), '14.12')
  assert.equal(pulled.weightGap.toFixed(2), '0.78')
})

test('默认读数：整体增长率、偏向 A、距两侧点数与权重对照', async () => {
  const ui = await mount()
  try {
    const body = ui.body()
    assert.match(body, /整体增长率 8\.28%/)
    assert.match(body, /偏向 A/)
    assert.match(body, /距 A 0\.9 个点/)
    assert.match(body, /距 B 3\.7 个点/)
    assert.match(body, /基期当权重 8\.28%/)
    assert.match(body, /现期当权重 8\.31%/)
    assert.match(body, /差 0\.03 个百分点/)

    const sectionIds = [...document.querySelectorAll('article[aria-label="课堂讲义"] section')].map(node => node.id)
    assert.deepEqual(sectionIds, ['handout-s1', 'handout-s2', 'handout-lab', 'handout-s3', 'handout-s4', 'handout-s5', 'handout-s6'], '动手是 02 与 03 之间的小节，原有小节 id 不变')

    const section = document.querySelector('#handout-s2')
    assert.ok(section, '第 02 节应保持原 id')
    assert.doesNotMatch(section.textContent ?? '', /混合增长率实验台/, '实验台已移出第 02 节')

    const lab = document.querySelector('#handout-lab')
    assert.ok(lab, '动手应成为独立小节')
    assert.match(lab.textContent ?? '', /混合增长率实验台/)
    assert.match(lab.textContent ?? '', /整体增长率 8\.28%/)

    const links = [...document.querySelectorAll('nav[aria-label="讲义目录"] a')]
    const labLink = links.find(node => node.getAttribute('href') === '#handout-lab')
    assert.ok(labLink, '目录应包含动手小节')
    assert.equal(labLink.textContent, '＋ 动手试一试', '动手小节不编号')
    assert.ok(links.some(node => node.textContent === '02 为什么是这样'), '原有小节仍带编号')
  } finally {
    await ui.unmount()
  }
})

test('四个预设：回到例题、等权、9 倍、把两个率拉开', async () => {
  const ui = await mount()
  try {
    await ui.click('两边一样大')
    assert.match(ui.body(), /整体增长率 6\.90%/)
    assert.match(ui.body(), /正中间（两边一样重）/)

    await ui.click('A 是 B 的 9 倍')
    assert.match(ui.body(), /整体增长率 8\.74%/)

    await ui.click('把两个率拉开')
    assert.match(ui.body(), /整体增长率 13\.33%/)
    assert.match(ui.body(), /基期当权重 13\.33%/)
    assert.match(ui.body(), /现期当权重 14\.12%/)
    assert.match(ui.body(), /差 0\.78 个百分点/)

    await ui.click('回到例题')
    assert.match(ui.body(), /整体增长率 8\.28%/)
    assert.match(ui.body(), /偏向 A/)
  } finally {
    await ui.unmount()
  }
})

test('拖动滑杆后读数实时变化', async () => {
  const ui = await mount()
  try {
    assert.match(ui.body(), /整体增长率 8\.28%/)

    await ui.setRange('A 基期量', '600')
    assert.match(ui.body(), /整体增长率 8\.05%/)
    assert.match(ui.body(), /偏向 A/)

    await ui.setRange('A 增长率', '20')
    assert.match(ui.body(), /整体增长率 16\.15%/)
    assert.match(ui.body(), /偏向 A/)
  } finally {
    await ui.unmount()
  }
})

test('先猜再看：未猜也能揭晓只给结果，拖动滑杆不清空猜测', async () => {
  const ui = await mount()
  try {
    await ui.click('先猜再看')
    assert.doesNotMatch(ui.body(), /整体增长率 8\.28%/)
    assert.doesNotMatch(ui.body(), /基期当权重 8\.28%/)
    assert.match(ui.body(), /结果已藏起/)
    assert.equal(ui.buttons().find(node => node.textContent === '揭晓答案')?.disabled, false, '没猜过也应能揭晓')

    await ui.click('揭晓答案')
    assert.match(ui.body(), /整体增长率 8\.28%/, '未猜时揭晓只显示结果')
    assert.match(ui.body(), /基期当权重 8\.28%/)
    assert.doesNotMatch(ui.body(), /你的猜测/, '没猜过就不显示猜测与误差')
    assert.doesNotMatch(ui.body(), /误差/)

    await ui.click('先猜再看')
    const axis = document.querySelector('[aria-label="在数轴上点选猜测"]') as HTMLElement | null
    assert.ok(axis, '数轴应能按可访问名找到')
    axis.getBoundingClientRect = () => ({left: 0, width: 1000, top: 0, height: 40, right: 1000, bottom: 40, x: 0, y: 0, toJSON() {}}) as DOMRect
    await act(async () => {
      axis.dispatchEvent(new ui.dom.window.MouseEvent('click', {bubbles: true, clientX: 500}))
    })
    assert.match(ui.body(), /你的猜测 6\.90%/)

    await ui.setRange('A 基期量', '600')
    assert.match(ui.body(), /你的猜测 6\.90%/, '拖动滑杆不应清空猜测')
    assert.equal(ui.buttons().find(node => node.textContent === '揭晓答案')?.disabled, false)

    await ui.click('揭晓答案')
    assert.match(ui.body(), /整体增长率 8\.05%/)
    assert.match(ui.body(), /你的猜测 6\.90%，实际 8\.05%，误差 1\.15 个百分点/)
  } finally {
    await ui.unmount()
  }
})
