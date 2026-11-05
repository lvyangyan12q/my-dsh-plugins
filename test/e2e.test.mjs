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
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { apply } from '../src/index.js'
import { main } from '../src/cli/main.js'
import { mountPage } from './helpers/client.mjs'
import { fakeArxiv, FULL_TEXT } from './helpers/arxiv.mjs'

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
function createHost() {
  const routes = new Map()
  const disposers = []
  const ctx = {
    effect(fn) { disposers.push(fn()) },
    webServer: { register(route) { routes.set(route.path, route); return () => {} } },
    get(name) {
      if (name === 'profileContext') return { dir: profileDir }
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

test('CLI → host → reading page renders the day with pending translations', async () => {
  const stdout = capture()
  const stderr = capture()
  const code = await main(['--date', DATE], {
    env: { DSH_HOME: home },
    now: () => new Date('2026-11-05T09:00:00+08:00'),
    fetch: fakeArxiv({ articles: FULL_TEXT }).impl,
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
    assert.equal(indexBody.days[0].items, 3)
    assert.equal(indexBody.days[0].runStatus, 'ok')

    const day = await host.call(`/api/paper-reader/digest/${DATE}`)
    assert.equal(day.status, 200)
    const dayBody = JSON.parse(day.body)
    assert.equal(dayBody.items.length, 3)
    assert.ok(dayBody.items.every(item => item.translationState === 'pending'))

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
      assert.match(text, /翻译进行中/)
      assert.ok(page.container.querySelector('.pr-pending'), 'pending blocks show a placeholder')

      // The middle paper had no LaTeXML HTML: it renders as an excerpt.
      const items = [...page.container.querySelectorAll('.pr-item')]
      assert.equal(items.length, 3)
      await page.click(items[1])
      assert.match(page.container.textContent, /节选/)
    } finally {
      await page.unmount()
    }
  } finally {
    host.dispose()
  }
})
