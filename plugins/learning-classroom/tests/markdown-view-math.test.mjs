import assert from 'node:assert/strict'
import { test } from 'node:test'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost' })
const globals = {
  window: dom.window,
  document: dom.window.document,
  HTMLElement: dom.window.HTMLElement,
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
const { parseMarkdown } = await import('../src/markdown.ts')
const { MarkdownBlocks, selectionTextWithMath } = await import('../src/markdown-view.tsx')

function fakeMath(calls) {
  return ({ tex, display }) => {
    calls.push({ tex, display })
    return h('span', { className: 'katex', 'data-math': tex, 'data-display': String(display) }, tex)
  }
}

async function render(element) {
  const container = dom.window.document.getElementById('root')
  container.replaceChildren()
  const root = createRoot(container)
  await act(async () => { root.render(element) })
  return { container, root, unmount: async () => { await act(async () => root.unmount()) } }
}

test('讲义与笔记共用的渲染器把已识别公式交给注入的数学渲染器，不把 $...$ 当文字', async () => {
  const calls = []
  const blocks = parseMarkdown([
    '体积是 $V = \\frac{4}{3}\\pi r^3$，不是代码。',
    '',
    '$$',
    'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}',
    '$$',
    '',
    '```',
    '代码里的 $x$ 不是公式',
    '```',
  ].join('\n'))
  const view = await render(h(MarkdownBlocks, { blocks, mathRenderer: fakeMath(calls) }))
  try {
    assert.deepEqual(calls, [
      { tex: 'V = \\frac{4}{3}\\pi r^3', display: false },
      { tex: 'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}', display: true },
    ])
    assert.equal(view.container.querySelectorAll('[data-math]').length, 2)
    assert.equal(view.container.querySelector('[data-display="true"]')?.getAttribute('data-math'), 'P(A \\mid B) = \\frac{P(A \\cap B)}{P(B)}')
    assert.match(view.container.textContent, /体积是/)
    assert.doesNotMatch(view.container.textContent, /\$V =/)
    assert.match(view.container.querySelector('pre code')?.textContent ?? '', /\$x\$ 不是公式/)
    assert.equal(view.container.querySelector('pre [data-math]'), null)
  } finally {
    await view.unmount()
  }
})

test('段落含公式时仍是合法块级文本容器，块 id 保留在真实块上', async () => {
  const calls = []
  const blocks = parseMarkdown([
    '真段落 $a+b$ ^real-block',
    '',
    '- 第一项 $x$',
    '- 第二项 ^second-block',
  ].join('\n'))
  const view = await render(h(MarkdownBlocks, { blocks, mathRenderer: fakeMath(calls) }))
  try {
    const paragraph = view.container.querySelector('[data-block-id="real-block"]')
    assert.ok(paragraph)
    assert.equal(paragraph.tagName, 'DIV')
    assert.match(paragraph.textContent, /真段落/)
    assert.ok(paragraph.querySelector('[data-math="a+b"]'))
    const item = view.container.querySelector('li[data-block-id="second-block"]')
    assert.ok(item)
    assert.equal(view.container.querySelector('ul')?.getAttribute('data-block-id'), null)
  } finally {
    await view.unmount()
  }
})

test('display 数学块携带真实 TeX 元数据，完整与部分选区都还原为 $$...$$', async () => {
  const calls = []
  const blocks = parseMarkdown('前文\n\n$$\nP(A \\mid B) = \\frac{1}{2}\n$$\n\n后文\n')
  const view = await render(h(MarkdownBlocks, { blocks, mathRenderer: fakeMath(calls) }))
  try {
    const block = view.container.querySelector('.lc-math-block')
    assert.ok(block)
    assert.equal(block.getAttribute('data-math-tex'), 'P(A \\mid B) = \\frac{1}{2}')
    assert.equal(block.getAttribute('data-math-display'), 'true')

    const full = dom.window.document.createRange()
    full.selectNodeContents(block)
    assert.equal(selectionTextWithMath(full).trim(), '$$P(A \\mid B) = \\frac{1}{2}$$')

    // A selection that begins inside KaTeX's rendered arm must expand to the
    // whole formula rather than returning one duplicated arm.
    const rendered = [...block.querySelectorAll('[data-math]')]
      .find(node => node.getAttribute('data-math') === 'P(A \\mid B) = \\frac{1}{2}')
    assert.ok(rendered)
    const text = rendered.firstChild
    const partial = dom.window.document.createRange()
    partial.setStart(text, 1)
    partial.setEnd(text, text.textContent.length)
    assert.equal(selectionTextWithMath(partial).trim(), '$$P(A \\mid B) = \\frac{1}{2}$$')
  } finally {
    await view.unmount()
  }
})

test('行内公式的完整与部分选区仍还原为 $...$，不与 display 块混淆', async () => {
  const calls = []
  const blocks = parseMarkdown('行内 $x^2$ 与独立块：\n\n$$\ny\n$$\n')
  const view = await render(h(MarkdownBlocks, { blocks, mathRenderer: fakeMath(calls) }))
  try {
    const inline = view.container.querySelector('.lc-math-inline')
    assert.ok(inline)
    const full = dom.window.document.createRange()
    full.selectNodeContents(inline)
    assert.equal(selectionTextWithMath(full), '$x^2$')
    assert.equal(inline.getAttribute('data-math-tex'), 'x^2')
    assert.equal(inline.getAttribute('data-math-display'), null)

    const rendered = inline.querySelector('[data-math="x^2"]')
    assert.ok(rendered)
    const text = rendered.firstChild
    const partial = dom.window.document.createRange()
    partial.setStart(text, 1)
    partial.setEnd(text, text.textContent.length)
    assert.equal(selectionTextWithMath(partial), '$x^2$')
  } finally {
    await view.unmount()
  }
})

test('无公式选区完全沿用 Range.toString，不重排段落或代码缩进', async () => {
  const calls = []
  const blocks = parseMarkdown('第一段\n\n第二段\n\n```python\n  x = 1\n```\n')
  const view = await render(h(MarkdownBlocks, { blocks, mathRenderer: fakeMath(calls) }))
  try {
    const paragraphs = view.container.querySelectorAll('p')
    const pre = view.container.querySelector('pre')
    assert.ok(paragraphs.length === 2 && pre)
    const range = dom.window.document.createRange()
    range.setStart(paragraphs[0].firstChild, 0)
    range.setEnd(pre, pre.childNodes.length)
    const expected = range.toString()
    assert.equal(selectionTextWithMath(range), expected, '无公式时不得改走 DOM 序列化')
    assert.match(expected, /第一段/)
    assert.match(expected, /第二段/)
    assert.match(expected, /  x = 1/)
  } finally {
    await view.unmount()
  }
})

test('含公式的跨段落/代码选区保留块换行与 pre 缩进，不复制 KaTeX 两套 DOM', async () => {
  const calls = []
  const blocks = parseMarkdown('前文 $a$。\n\n$$\ny\n$$\n\n```python\n  z = 2\n```\n')
  const view = await render(h(MarkdownBlocks, { blocks, mathRenderer: fakeMath(calls) }))
  try {
    const paragraph = view.container.querySelector('.lc-md-p')
    const pre = view.container.querySelector('pre')
    assert.ok(paragraph && pre)
    const range = dom.window.document.createRange()
    range.setStart(paragraph.firstChild, 0)
    range.setEnd(pre, pre.childNodes.length)
    const text = selectionTextWithMath(range).trim()
    assert.match(text, /前文 \$a\$。/)
    assert.match(text, /\n\$\$y\$\$\n/)
    assert.match(text, /\n  z = 2/)
    assert.doesNotMatch(text, /katex|a2|\\frac/)
  } finally {
    await view.unmount()
  }
})

test('原始 HTML 只作文字出现；双链和链接回调仍按原契约工作', async () => {  const calls = []
  const opened = []
  const links = []
  const blocks = parseMarkdown('<img src=x onerror="alert(1)"> 和 [[笔记/另一篇.md]]\n')
  const view = await render(h(MarkdownBlocks, {
    blocks,
    mathRenderer: fakeMath(calls),
    onOpenWikilink: target => opened.push(target),
    onOpenHref: href => { links.push(href); return true },
  }))
  try {
    assert.equal(view.container.querySelector('img'), null)
    assert.match(view.container.textContent, /<img src=x onerror="alert\(1\)">/)
    const wikilink = view.container.querySelector('[data-wikilink="笔记/另一篇.md"]')
    assert.ok(wikilink)
    await act(async () => { wikilink.click() })
    assert.deepEqual(opened, ['笔记/另一篇.md'])
    assert.deepEqual(links, [])
  } finally {
    await view.unmount()
  }
})
