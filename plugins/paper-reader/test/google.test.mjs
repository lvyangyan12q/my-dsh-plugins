import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractGoogleArticle, listGoogle } from '../src/sources/google.js'
import { selectDaily } from '../src/pipeline/select.js'

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel>
  <item><title>Gemini Omni 1.2 Flash</title><link>https://blog.google/technology/ai/gemini-omni/</link>
    <description>A faster model for developers.</description><pubDate>Thu, 05 Nov 2026 17:00:00 GMT</pubDate>
    <category>Gemini models</category></item>
  <item><title>AI news in October</title><link>https://blog.google/technology/ai/october-news/</link>
    <description>What we announced.</description><pubDate>Mon, 02 Nov 2026 17:45:00 GMT</pubDate>
    <category>Google DeepMind</category></item>
</channel></rss>`

const ARTICLE = `<html><head><title>Gemini Omni 1.2 Flash</title></head><body><main>
  <h1>Gemini Omni 1.2 Flash</h1>
  <p>Gemini Omni 1.2 Flash is a faster model for developers.</p>
  <h2>Availability</h2>
  <p>It is available today in the API.</p>
</main></body></html>`

function response(text) {
  return { ok: true, status: 200, text: async () => text }
}

test('listGoogle parses the RSS feed into blog candidates', async () => {
  const list = await listGoogle({ config: {}, fetch: async () => response(RSS) })
  assert.equal(list.length, 2)
  assert.equal(list[0].sourceId, 'google')
  assert.equal(list[0].kind, 'blog')
  assert.match(list[0].url, /gemini-omni/)
  assert.equal(list[0].publishedAt, '2026-11-05T17:00:00.000Z')
  assert.deepEqual(list[0].categories, ['Gemini models'])
})

test('extractGoogleArticle turns the article page into reader blocks', async () => {
  const [candidate] = await listGoogle({ config: {}, fetch: async () => response(RSS) })
  const result = await extractGoogleArticle({ candidate, config: {}, fetch: async () => response(ARTICLE) })
  assert.equal(result.excerpt, false)
  assert.equal(result.meta.sourceLanguage, 'en')
  assert.match(result.meta.title, /Gemini Omni/)
  assert.ok(result.blocks.some(block => block.type === 'paragraph' && /faster model/.test(block.original)))
})

test('Google posts participate in the blog quota', async () => {
  const list = await listGoogle({ config: {}, fetch: async () => response(RSS) })
  const selection = selectDaily(list, { quota: { total: 10, papers: 6, blogs: 4 } })
  assert.equal(selection.selected.length, 2)
  assert.ok(selection.selected.every(candidate => candidate.sourceId === 'google'))
})
