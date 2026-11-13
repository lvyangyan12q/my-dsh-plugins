import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
const globals = {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
  HTMLInputElement: dom.window.HTMLInputElement,
  HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
  Node: dom.window.Node,
  Event: dom.window.Event,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}
for (const [key, value] of Object.entries(globals)) {
  try { Object.defineProperty(globalThis, key, { configurable: true, writable: true, value }) } catch { /* Node may own navigator. */ }
}

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const act = React.act ?? (await import('react-dom/test-utils')).act
const h = React.createElement
const { LectureZone } = await import('../src/lecture-zone.tsx')
const { NotePreview } = await import('../src/notes-preview.tsx')
const { HostMath } = await import('../src/math-render.tsx')

const space = { id: 'space-1', title: '概率论', directory: '概率论', notePath: '笔记/我的笔记.md', createdAt: '2026-11-10T00:00:00.000Z' }
const lecture = {
  path: '讲义/01.md',
  fileName: '01.md',
  title: '第一节',
  order: null,
  kind: 'markdown',
  chapter: '',
  source: 'lectures',
  missing: false,
}
const content = [
  '# 第一节',
  '',
  '体积是 $V = \\frac{4}{3}\\pi r^3$。',
  '',
  '$$',
  'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}',
  '$$',
  '',
  '```',
  '代码里的 $x$ 不是公式',
  '```',
  '',
  '真实段落 ^block-1',
].join('\n')

const doc = {
  spaceId: space.id,
  path: lecture.path,
  fileName: lecture.fileName,
  title: lecture.title,
  kind: 'markdown',
  content,
}

function fakeClient() {
  return {
    async listLectures(spaceId) {
      return { spaceId, lectures: [lecture], selectedPath: lecture.path, missingSelection: null, folderMissing: false }
    },
    async readLecture() { return structuredClone(doc) },
  }
}

function fakeMath(calls) {
  return ({ tex, display }) => {
    calls.push({ tex, display })
    return h('span', { className: 'katex', 'data-math': tex, 'data-display': String(display) }, tex)
  }
}

async function settle(rounds = 6) {
  for (let index = 0; index < rounds; index += 1) {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
  }
}

async function mount(element) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  return { container, unmount: async () => { await act(async () => root.unmount()) } }
}

test('讲义渲染已识别公式：行内保持句子、display 独立成块、围栏代码不参与', async () => {
  const calls = []
  const ui = await mount(h(LectureZone, {
    client: fakeClient(),
    space,
    spaces: [space],
    currentSpaceId: space.id,
    busy: false,
    onOpenSpace() {},
    mathRenderer: fakeMath(calls),
  }))
  try {
    await settle()
    assert.deepEqual(calls, [
      { tex: 'V = \\frac{4}{3}\\pi r^3', display: false },
      { tex: 'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}', display: true },
    ])
    const inline = [...ui.container.querySelectorAll('[data-math-tex]')]
      .find(node => node.getAttribute('data-math-tex') === 'V = \\frac{4}{3}\\pi r^3')
    assert.ok(inline, '行内公式应存在')
    assert.equal(inline.getAttribute('data-math-display'), null)
    assert.equal(inline.querySelector('[data-display="false"]')?.textContent, 'V = \\frac{4}{3}\\pi r^3')
    assert.ok(ui.container.querySelector('.lc-math-block [data-display="true"]'), 'display 公式应独立成块')
    assert.match(ui.container.querySelector('pre code')?.textContent ?? '', /\$x\$ 不是公式/)
    assert.equal(ui.container.querySelector('pre [data-math-tex]'), null, '代码围栏内不得出现公式节点')
    assert.ok(ui.container.querySelector('[data-block-id="block-1"]'))
  } finally {
    await ui.unmount()
  }
})

test('选段问老师时公式还原为原始 TeX，不把 KaTeX 两套 DOM 文本混进摘录', async () => {
  const asked = []
  const askTeacher = {
    available: true,
    reason: '',
    async ask(input) { asked.push(input); return { ok: true } },
  }
  const ui = await mount(h(LectureZone, {
    client: fakeClient(),
    space,
    spaces: [space],
    currentSpaceId: space.id,
    busy: false,
    onOpenSpace() {},
    askTeacher,
    mathRenderer: fakeMath([]),
  }))
  try {
    await settle()
    const paragraph = [...ui.container.querySelectorAll('.lc-lecture-doc .lc-md-p')]
      .find(node => node.textContent.includes('体积是'))
    assert.ok(paragraph)
    const last = paragraph.lastChild
    await act(async () => {
      const range = dom.window.document.createRange()
      range.setStart(paragraph.firstChild, 0)
      range.setEnd(last, last.textContent.length)
      const selection = dom.window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    })
    const ask = [...ui.container.querySelectorAll('button')].find(button => button.textContent === '问老师')
    assert.ok(ask)
    await act(async () => { ask.click() })
    await settle()

    assert.equal(asked.length, 1)
    assert.equal(asked[0].kind, 'lecture-selection')
    assert.equal(asked[0].excerpt, '体积是 $V = \\frac{4}{3}\\pi r^3$。')
    assert.doesNotMatch(asked[0].excerpt, /katex|\\frac\{4\}\{3\}\\pi r\^3.*\\frac\{4\}\{3\}/)
  } finally {
    dom.window.getSelection()?.removeAllRanges()
    await ui.unmount()
  }
})

test('选中 display 公式（含部分选区）问老师时附完整 $$...$$，不复制 KaTeX 双 DOM', async () => {
  const asked = []
  const askTeacher = {
    available: true,
    reason: '',
    async ask(input) { asked.push(input); return { ok: true } },
  }
  const ui = await mount(h(LectureZone, {
    client: fakeClient(),
    space,
    spaces: [space],
    currentSpaceId: space.id,
    busy: false,
    onOpenSpace() {},
    askTeacher,
    mathRenderer: fakeMath([]),
  }))
  try {
    await settle()
    const block = ui.container.querySelector('.lc-math-block')
    assert.ok(block, 'display 公式块应存在')
    const rendered = [...block.querySelectorAll('[data-display="true"]')][0]
    assert.ok(rendered)
    // Start inside the rendered arm; the selection helper must expand to the
    // display block's real TeX metadata instead of copying this arm alone.
    const text = rendered.firstChild
    await act(async () => {
      const range = dom.window.document.createRange()
      range.setStart(text, 1)
      range.setEnd(text, text.textContent.length)
      const selection = dom.window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    })
    const ask = [...ui.container.querySelectorAll('button')].find(button => button.textContent === '问老师')
    assert.ok(ask)
    await act(async () => { ask.click() })
    await settle()

    assert.equal(asked.length, 1)
    assert.equal(asked[0].excerpt, '$$P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}$$')
    assert.doesNotMatch(asked[0].excerpt, /katex/)
  } finally {
    dom.window.getSelection()?.removeAllRanges()
    await ui.unmount()
  }
})

test('笔记预览同样渲染公式且双链仍是可点击的真实目标', async () => {
  const calls = []
  const opened = []
  const ui = await mount(h(NotePreview, {
    content: '公式 $a^2+b^2=c^2$ 与 [[笔记/另一篇.md]]\n\n$$\n\\frac{1}{2}\n$$',
    onOpenLink: target => opened.push(target),
    mathRenderer: fakeMath(calls),
  }))
  try {
    assert.deepEqual(calls.map(call => call.display), [false, true])
    assert.ok(ui.container.querySelector('[data-math-tex="a^2+b^2=c^2"]'))
    assert.ok(ui.container.querySelector('.lc-math-block [data-display="true"]'))
    const link = ui.container.querySelector('[data-wikilink="笔记/另一篇.md"]')
    assert.ok(link)
    await act(async () => { link.click() })
    assert.deepEqual(opened, ['笔记/另一篇.md'])
  } finally {
    await ui.unmount()
  }
})

test('宿主没有公开 KaTeX 渲染器时明确降级为公式源码，并标明尚未排版', async () => {
  globalThis.__LC_HOST_REQUIRE__ = () => { throw new Error('host module missing') }
  const ui = await mount(h('div', null, h(HostMath, { tex: 'x^2', display: false })))
  try {
    const fallback = ui.container.querySelector('[data-math-degraded="true"]')
    assert.ok(fallback, '缺少宿主渲染器时必须显式降级')
    assert.match(fallback.textContent, /\$x\^2\$/)
    assert.match(fallback.textContent, /公式渲染器不可用，显示源码/)
    assert.match(fallback.getAttribute('title'), /尚未排版/)
  } finally {
    await ui.unmount()
  }
})

test('适配器只把已识别公式的 TeX 交给宿主 MarkdownText，不拼接用户正文或 HTML', async () => {
  const seen = []
  globalThis.__LC_HOST_REQUIRE__ = specifier => {
    assert.equal(specifier, '@deepseek-ai/dsh-client-ui-primitives')
    return {
      // The real host export is React.memo(...), an object rather than a plain
      // function; the adapter must accept that shape.
      MarkdownText: React.memo(function FakeMarkdownText(props) {
        seen.push(props)
        return h('span', { className: 'katex' }, props.text)
      }),
    }
  }
  const ui = await mount(h('div', null,
    h(HostMath, { tex: 'x^2', display: false }),
    h(HostMath, { tex: '\\frac{1}{2}', display: true }),
  ))
  try {
    assert.deepEqual(seen.map(props => props.text), ['$x^2$', '$$\n\\frac{1}{2}\n$$'])
    assert.equal(seen[0].labels.code.copyLabel, '复制')
    assert.equal(seen[0].labels.footnotes, '脚注')
  } finally {
    await ui.unmount()
  }
})
