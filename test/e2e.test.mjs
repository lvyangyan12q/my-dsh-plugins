/**
 * End-to-end: CLI writes the day → the host reads the real files → the reading
 * page renders them.
 *
 * This is the first complete vertical slice at the highest seam: only the
 * network is faked. Everything else is the production path (CLI → storage →
 * host routes → client bundle), so the test fails if any two halves disagree
 * about paths, the v2 contract or the pending-translation shape.
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { apply } from '../src/index.js'
import { main } from '../src/cli/main.js'
import { mountPage } from './helpers/client.mjs'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'
import { fakeLlm, API_KEY, BASE_URL, MODEL } from './helpers/llm.mjs'
import { fakeSources } from './helpers/sources.mjs'

const DATE = '2026-11-05'
const home = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-e2e-'))
const profileDir = join(home, 'profiles', 'web')
mkdirSync(profileDir, { recursive: true })

after(() => rmSync(home, { recursive: true, force: true }))

function capture() {
  const chunks = []
  return { write(text) { chunks.push(String(text)) }, text() { return chunks.join('') } }
}

/** Register the real host routes and call one the way the HTTP layer does. */
function createHost(profile = profileDir) {
  const routes = new Map()
  const disposers = []
  const ctx = {
    effect(fn) { disposers.push(fn()) },
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    get(name) {
      if (name === 'profileContext') return { dir: profile }
      return undefined
    },
  }
  apply(ctx)

  const call = (path) => {
    const route = routes.get(path) ?? [...routes.entries()]
      .filter(([registered, entry]) => entry.kind === 'prefix' && path.startsWith(registered))
      .sort((left, right) => right[0].length - left[0].length)
      .map(([, entry]) => entry)[0]
    assert.ok(route, `route ${path} should be registered`)
    return new Promise((resolve, reject) => {
      const result = { status: 0, body: '' }
      const res = {
        writeHead(status) { result.status = status },
        end(body) { result.body = body ?? ''; resolve(result) },
      }
      Promise.resolve(route.handler({ method: 'GET', url: path, headers: {} }, res)).catch(reject)
    })
  }
  return { call, dispose: () => { for (const dispose of disposers) dispose() } }
}

/**
 * The E2E fetch knows arXiv and DeepSeek; the blog adapters have their own
 * fixture suite, so their sources are switched off instead of treating their
 * 404s as a broken day.
 */
function writeNoBlogSourcesConfig(homeDir, extraSources = {}) {
  const root = join(homeDir, 'paper-reader')
  mkdirSync(root, { recursive: true })
  writeFileSync(
    join(root, 'config.json'),
    JSON.stringify({
      sources: {
        anthropic: { enabled: false },
        kimi: { enabled: false },
        ...extraSources,
      },
    }),
  )
}

test('CLI → host → reading page renders arXiv pending items and DeepSeek official pairs', async () => {
  writeNoBlogSourcesConfig(home)
  const stdout = capture()
  const stderr = capture()
  const code = await main(['--date', DATE], {
    env: { DSH_HOME: home },
    now: () => new Date('2026-11-05T09:00:00+08:00'),
    fetch: fakeSources().impl,
    stdout,
    stderr,
  })
  assert.equal(code, 0, stderr.text())
  assert.match(stdout.text(), new RegExp(DATE))

  const host = createHost()
  try {
    const index = await host.call('/api/paper-reader/index')
    assert.equal(index.status, 200)
    const indexBody = JSON.parse(index.body)
    assert.equal(indexBody.days[0].date, DATE)
    assert.equal(indexBody.days[0].items, 4)
    assert.equal(indexBody.days[0].runStatus, 'ok')

    const day = await host.call(`/api/paper-reader/digest/${DATE}`)
    assert.equal(day.status, 200)
    const dayBody = JSON.parse(day.body)
    assert.equal(dayBody.items.length, 4)
    const arxivItems = dayBody.items.filter(item => item.sourceId === 'arxiv')
    const deepseekItem = dayBody.items.find(item => item.sourceId === 'deepseek')
    assert.ok(arxivItems.every(item => item.translationState === 'pending'))
    assert.ok(deepseekItem, 'the DeepSeek news is part of the day')
    assert.equal(deepseekItem.sourceLanguage, 'zh')
    assert.equal(deepseekItem.translationState, 'complete')
    assert.deepEqual(deepseekItem.title, {
      original: 'DeepSeek V4.1 Flash 新版本：许愿式编程一键成真',
      translation: 'DeepSeek-V4.1-Flash-1017: Wish-Driven Programming Made Real',
    })

    const page = await mountPage({
      routes: {
        '/api/paper-reader/index': indexBody,
        [`/api/paper-reader/digest/${DATE}`]: dayBody,
      },
    })
    try {
      assert.equal(page.fetchCalls[0], '/api/paper-reader/index')
      assert.equal(page.container.querySelectorAll('.pr-day').length, 1)
      assert.equal(page.container.querySelector('.pr-error'), null)

      const text = page.container.textContent
      assert.match(text, /Agentic Reasoning with Tool-Augmented Language Models/)
      assert.match(text, /Scaling Laws for Efficient Pretraining/)
      assert.match(text, /Preference Optimization and Safety Alignment/)
      assert.match(text, /arXiv/)
      assert.match(text, /DeepSeek V4.1 Flash 新版本：许愿式编程一键成真/)
      assert.match(text, /翻译进行中/)
      assert.ok(page.container.querySelector('.pr-pending'), 'pending blocks show a placeholder')

      // The middle paper had no LaTeXML HTML: it renders as an excerpt.
      const items = [...page.container.querySelectorAll('.pr-item')]
      assert.equal(items.length, 4)
      await page.click(items[1])
      assert.match(page.container.textContent, /节选/)
    } finally {
      await page.unmount()
    }
  } finally {
    host.dispose()
  }
})

test('a translated day renders the Chinese text without pending placeholders in 仅中文 mode', async () => {
  const translatedHome = mkdtempSync(join(tmpdir(), 'dsh-paper-reader-e2e-zh-'))
  const translatedProfile = join(translatedHome, 'profiles', 'web')
  mkdirSync(translatedProfile, { recursive: true })
  // This slice is about translating an English source day; DeepSeek has its own
  // fixtures and would enter the same digest already complete, while the blog
  // adapters have their own end-to-end fixtures.
  writeNoBlogSourcesConfig(translatedHome, { deepseek: { enabled: false } })

  try {
    const stdout = capture()
    const stderr = capture()
    const llm = fakeLlm()
    const arxiv = fakeArxiv({ articles: FULL_TEXT })
    const fetchImpl = async (url, init) => String(url).includes('/chat/completions')
      ? llm.impl(url, init)
      : arxiv.impl(url, init)

    const code = await main(['--date', DATE], {
      env: {
        DSH_HOME: translatedHome,
        PAPER_READER_LLM_BASE_URL: BASE_URL,
        PAPER_READER_LLM_API_KEY: API_KEY,
        PAPER_READER_LLM_MODEL: MODEL,
      },
      now: () => new Date('2026-11-05T09:00:00+08:00'),
      fetch: fetchImpl,
      stdout,
      stderr,
    })
    assert.equal(code, 0, stderr.text())
    assert.ok(llm.calls.length > 0, 'the run translated through the fake endpoint')

    const host = createHost(translatedProfile)
    try {
      const index = await host.call('/api/paper-reader/index')
      const day = await host.call(`/api/paper-reader/digest/${DATE}`)
      assert.equal(day.status, 200)
      const body = JSON.parse(day.body)
      assert.ok(body.items.every(item => item.translationState === 'complete'))

      const page = await mountPage({
        routes: {
          '/api/paper-reader/index': JSON.parse(index.body),
          [`/api/paper-reader/digest/${DATE}`]: body,
        },
        mode: 'zh',
      })
      try {
        const items = [...page.container.querySelectorAll('.pr-item')]
        assert.equal(items.length, 3)
        await page.click(items[0])
        assert.match(page.bodyText(), /译:/, '仅中文 mode shows the generated translation')
        assert.equal(page.container.querySelector('.pr-pending'), null)
        assert.doesNotMatch(page.container.textContent, /未翻译/)
      } finally {
        await page.unmount()
      }
    } finally {
      host.dispose()
    }
  } finally {
    rmSync(translatedHome, { recursive: true, force: true })
  }
})
