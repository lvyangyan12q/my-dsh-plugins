/**
 * Reading-page OpenAI excerpt marker.
 *
 * When a run could not reach the article page, the digest carries
 * `excerptReason`; the page must say「节选 / 代理不可用」so the reader never
 * mistakes the RSS dek for the full article.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountPage } from './helpers/client.mjs'

const DATE = '2026-11-04'

function openAiItem(overrides = {}) {
  return {
    id: 'openai:introducing-agent-mode',
    sourceId: 'openai',
    sourceLanguage: 'en',
    title: { original: 'Introducing agent mode in ChatGPT', translation: '在 ChatGPT 中引入智能体模式' },
    summary: { original: 'Agent mode lets ChatGPT plan multi-step tasks.', translation: '智能体模式让 ChatGPT 规划多步任务。' },
    direction: 'agent',
    collectedAt: `${DATE}T09:02:00+08:00`,
    published: '2026-11-04',
    url: 'https://openai.com/index/introducing-agent-mode/',
    translationState: 'complete',
    blocks: [{ type: 'paragraph', original: 'Agent mode lets ChatGPT plan multi-step tasks.', translation: '智能体模式让 ChatGPT 规划多步任务。' }],
    ...overrides,
  }
}

function routesFor(document) {
  return {
    '/api/paper-reader/index': {
      schemaVersion: 2,
      updatedAt: `${DATE}T09:05:00Z`,
      retentionDays: 30,
      missing: false,
      demo: false,
      days: [{ date: DATE, items: document.items.length, runStatus: document.run.status, sources: document.run.sources }],
    },
    [`/api/paper-reader/digest/${DATE}`]: document,
  }
}

function dayDocument(items) {
  return {
    schemaVersion: 2,
    date: DATE,
    generatedAt: `${DATE}T09:02:00+08:00`,
    run: { status: 'ok', sources: [{ id: 'openai', status: 'ok', items: items.length }] },
    directions: [{ id: 'agent', label: 'Agent' }],
    sources: [{ id: 'openai', label: 'OpenAI', short: 'O' }],
    items,
  }
}

test('an excerpt item shows 节选 and the proxy reason, not a full-text mask', async () => {
  const item = openAiItem({
    excerpt: true,
    excerptReason: { code: 'proxy_unavailable', message: '代理不可用，仅显示 RSS 节选' },
  })
  const page = await mountPage({ routes: routesFor(dayDocument([item])), prefs: { activeId: item.id } })
  try {
    const notice = page.container.querySelector('.pr-excerpt-notice')
    assert.ok(notice, 'the page explains that this item is an excerpt')
    assert.match(notice.textContent, /节选/)
    assert.match(notice.textContent, /代理不可用/)

    const chips = [...page.container.querySelectorAll('.pr-chip-inline')].map(chip => chip.textContent)
    assert.ok(chips.includes('节选'), 'the header keeps the 节选 chip')

    const listItem = page.container.querySelector('.pr-item')
    assert.match(listItem.textContent, /节选/, 'the list marks the item too')
  } finally {
    await page.unmount()
  }
})

test('a full-text item shows no excerpt notice', async () => {
  const item = openAiItem({ excerpt: false })
  const page = await mountPage({ routes: routesFor(dayDocument([item])), prefs: { activeId: item.id } })
  try {
    assert.equal(page.container.querySelector('.pr-excerpt-notice'), null)
    assert.doesNotMatch(page.container.querySelector('.pr-item').textContent, /节选/)
  } finally {
    await page.unmount()
  }
})
