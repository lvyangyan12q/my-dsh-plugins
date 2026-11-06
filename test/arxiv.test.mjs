/**
 * arXiv adapter: Atom listing and LaTeXML full-text extraction.
 *
 * Both halves are driven by fixtures captured from the real endpoints, so the
 * assertions describe the contract the pipeline consumes (candidate fields,
 * ordered blocks) rather than the parser's internals. Network access is always
 * an injected fake.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  buildArxivQueryUrl,
  extractArticleBlocks,
  extractArxivPaper,
  listArxiv,
  parseAtomFeed,
} from '../src/sources/arxiv.js'

const ATOM = readFileSync(new URL('./fixtures/arxiv-atom.xml', import.meta.url), 'utf8')
const ARTICLE = readFileSync(new URL('./fixtures/arxiv-article.html', import.meta.url), 'utf8')

const ARXIV_CONFIG = {
  enabled: true,
  categories: ['cs.AI', 'cs.CL'],
  keywords: [],
  excludeKeywords: [],
  maxResults: 100,
  timeoutMs: 5_000,
  baseUrl: 'https://export.arxiv.org/api/query',
  htmlBaseUrl: 'https://arxiv.org/html',
  extractFullText: true,
  maxBlocks: 400,
}

function feedResponse(body = ATOM) {
  return { ok: true, status: 200, text: async () => body }
}

test('parses Atom entries into candidates with stable arXiv ids', () => {
  const entries = parseAtomFeed(ATOM)
  assert.equal(entries.length, 3)

  const first = entries[0]
  assert.equal(first.arxivId, '2611.05377')
  assert.equal(first.title, 'Agentic Reasoning with Tool-Augmented Language Models')
  assert.deepEqual(first.authors, ['Ada Lovelace', 'Alan Turing'])
  assert.deepEqual(first.categories, ['cs.AI', 'cs.CL'])
  assert.equal(first.primaryCategory, 'cs.AI')
  assert.equal(first.comment, '12 pages, 3 figures')
  assert.equal(first.published, '2026-11-04T18:59:56Z')
  assert.equal(first.url, 'https://arxiv.org/abs/2611.05377')
  assert.match(first.summary, /<tool use> in agentic systems/)
  assert.doesNotMatch(first.summary, /\n\s+/, 'summary whitespace is collapsed')
})

test('builds the submittedDate query from the categories and the date', () => {
  const url = new URL(buildArxivQueryUrl({
    baseUrl: ARXIV_CONFIG.baseUrl,
    categories: ARXIV_CONFIG.categories,
    date: '2026-11-04',
    maxResults: 25,
  }))
  assert.equal(
    url.searchParams.get('search_query'),
    '(cat:cs.AI OR cat:cs.CL) AND submittedDate:[202611040000 TO 202611042359]',
  )
  assert.equal(url.searchParams.get('max_results'), '25')
  assert.equal(url.searchParams.get('sortBy'), 'submittedDate')
  assert.equal(url.searchParams.get('sortOrder'), 'descending')
  assert.equal(url.searchParams.get('start'), '0')
})

test('listArxiv turns the feed into source-tagged candidates', async () => {
  const candidates = await listArxiv({
    config: ARXIV_CONFIG,
    date: '2026-11-04',
    fetch: async () => feedResponse(),
  })
  assert.equal(candidates.length, 3)
  assert.equal(candidates[0].id, 'arxiv:2611.05377')
  assert.equal(candidates[0].sourceId, 'arxiv')
  assert.equal(candidates[0].title, 'Agentic Reasoning with Tool-Augmented Language Models')
  assert.equal(candidates[0].url, 'https://arxiv.org/abs/2611.05377')
  assert.equal(candidates[0].direction, 'agent')
  assert.ok(candidates[0].tags.includes('cs.AI'))
  assert.equal(candidates[0].publishedAt, '2026-11-04T18:59:56Z')
  assert.equal(candidates[1].direction, 'training')
  assert.equal(candidates[2].direction, 'alignment')
})

test('listArxiv reports an HTTP failure instead of returning an empty day', async () => {
  await assert.rejects(
    listArxiv({
      config: ARXIV_CONFIG,
      date: '2026-11-04',
      fetch: async () => ({ ok: false, status: 503, text: async () => 'unavailable' }),
    }),
    error => error.code === 'arxiv_http' && error.status === 503,
  )
})

test('extracts headings, paragraphs, equations, figures and code from LaTeXML', () => {
  const blocks = extractArticleBlocks(ARTICLE, { baseUrl: 'https://arxiv.org/html/2305.10601' })

  assert.deepEqual(blocks.map(block => block.type), [
    'heading',
    'paragraph',
    'heading',
    'paragraph',
    'paragraph',
    'equation',
    'figure',
    'code',
  ])

  const [abstractHeading, abstractParagraph, sectionHeading] = blocks
  assert.equal(abstractHeading.original, 'Abstract')
  assert.equal(abstractHeading.level, 2)
  assert.match(abstractParagraph.original, /We present a planner/)
  assert.match(abstractParagraph.original, /\$\\alpha\$/, 'inline math keeps its LaTeX')
  assert.equal(sectionHeading.original, '1 Introduction')

  const equation = blocks[5]
  assert.equal(equation.display, 'E = mc^{2}')
  assert.equal(equation.label, '(1)')
  assert.match(equation.mathml, /^<math[\s>]/, 'equation keeps safe MathML for native rendering')

  const figure = blocks[6]
  assert.equal(figure.image, 'https://arxiv.org/html/2305.10601/figures/pipeline.png')
  assert.match(figure.caption.original, /Overview of the planner, tool executor and verifier\./)
  assert.doesNotMatch(figure.caption.original, /^Figure 1:/)

  const code = blocks[7]
  assert.equal(code.language, 'python')
  assert.match(code.code, /if verify\(plan\):\n    execute\(plan\)/)

  const text = blocks.map(block => block.code ?? block.original ?? '').join('\n')
  assert.doesNotMatch(text, /A reference that must not be read/)
  assert.doesNotMatch(text, /window\.__latexml/)
  assert.doesNotMatch(text, /HTML conversion by LaTeXML/)
  assert.doesNotMatch(text, /kw_/, 'markup tokens are not body text')
})

test('a missing article HTML falls back to the abstract excerpt', async () => {
  const candidate = parseAtomFeed(ATOM)[0]
  const result = await extractArxivPaper({
    candidate,
    config: ARXIV_CONFIG,
    fetch: async () => ({ ok: false, status: 404, text: async () => 'not found' }),
  })

  assert.equal(result.excerpt, true)
  assert.deepEqual(result.blocks.map(block => block.type), ['heading', 'paragraph'])
  assert.equal(result.blocks[0].original, 'Abstract')
  assert.match(result.blocks[1].original, /tool use/)
  assert.ok(result.warnings.some(warning => /404/.test(warning)))
})

test('a network error while fetching the article also falls back to the excerpt', async () => {
  const candidate = parseAtomFeed(ATOM)[0]
  const result = await extractArxivPaper({
    candidate,
    config: ARXIV_CONFIG,
    fetch: async () => { throw new Error('getaddrinfo ENOTFOUND arxiv.org') },
  })

  assert.equal(result.excerpt, true)
  assert.deepEqual(result.blocks.map(block => block.type), ['heading', 'paragraph'])
  assert.ok(result.warnings.some(warning => /ENOTFOUND/.test(warning)))
})

test('extractFullText false keeps the run offline and marks the excerpt', async () => {
  let calls = 0
  const candidate = parseAtomFeed(ATOM)[0]
  const result = await extractArxivPaper({
    candidate,
    config: { ...ARXIV_CONFIG, extractFullText: false },
    fetch: async () => { calls += 1; return feedResponse(ARTICLE) },
  })

  assert.equal(calls, 0)
  assert.equal(result.excerpt, true)
  assert.deepEqual(result.blocks.map(block => block.type), ['heading', 'paragraph'])
})

test('extracts tables, object figures, inline SVG charts and inline MathML', () => {
  const html = `<article>
    <p class="ltx_p">A value <math alttext="\\alpha" display="inline">α</math> appears inline.</p>
    <figure class="ltx_table"><figcaption>Table 1: Results</figcaption>
      <table><tr><th>Model</th><th>Score</th></tr><tr><td>A</td><td>1</td></tr></table>
    </figure>
    <figure class="ltx_figure"><object data="2611.0001v1/chart.svg"></object><figcaption>Figure 1: Chart</figcaption></figure>
    <figure class="ltx_figure"><svg viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="red"/></svg><figcaption>Figure 2: Inline</figcaption></figure>
  </article>`
  const blocks = extractArticleBlocks(html, { baseUrl: 'https://arxiv.org/html/2611.0001v1' })
  assert.deepEqual(blocks.map(block => block.type), ['paragraph', 'table', 'figure', 'figure'])
  assert.match(blocks[0].originalHtml, /<math[\s>]/, 'inline math keeps MathML for the reader')
  assert.deepEqual(blocks[1].header, ['Model', 'Score'])
  assert.deepEqual(blocks[1].rows, [['A', '1']])
  assert.equal(blocks[2].image, 'https://arxiv.org/html/2611.0001v1/chart.svg')
  assert.match(blocks[3].svg, /^<svg[\s>]/)
  assert.match(blocks[3].svg, /viewBox="0 0 10 10"/)
})
