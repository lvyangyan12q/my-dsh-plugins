/**
 * Reading-page proxy degradation notice.
 *
 * When a run skipped a source because its proxy was unavailable, the page must
 * say which sources are missing and why. The day document already carries that
 * in `run.sources`; this test mounts the real bundle and reads the banner.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountPage } from './helpers/client.mjs'

const DATE = '2026-11-04'

function item(id, sourceId = 'arxiv') {
  return {
    id,
    sourceId,
    sourceLanguage: 'en',
    title: { original: `Title ${id}`, translation: `标题 ${id}` },
    summary: { original: 'Summary.', translation: '摘要。' },
    direction: 'agent',
    collectedAt: `${DATE}T08:00:00+08:00`,
    translationState: 'complete',
    blocks: [{ type: 'paragraph', original: 'Body.', translation: '正文。' }],
  }
}

function dayDocument(sources, items = [item('arxiv-one')]) {
  return {
    schemaVersion: 2,
    date: DATE,
    generatedAt: `${DATE}T09:02:00+08:00`,
    run: {
      status: 'partial',
      proxy: { status: sources.some(source => source.status === 'skipped') ? 'failed' : 'not_needed' },
      sources,
    },
    directions: [{ id: 'agent', label: 'Agent' }],
    sources: [
      { id: 'arxiv', label: 'arXiv', short: 'A' },
      { id: 'hf', label: 'Hugging Face', short: 'H' },
    ],
    items,
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
      days: [{ date: DATE, items: document.items.length, runStatus: 'partial', sources: document.run.sources }],
    },
    [`/api/paper-reader/digest/${DATE}`]: document,
  }
}

test('a proxy-skipped source is named on the page with its reason', async () => {
  const document = dayDocument([
    { id: 'arxiv', status: 'ok', items: 1 },
    { id: 'hf', status: 'skipped', code: 'proxy_auth', reason: '代理认证失败', label: 'Hugging Face' },
  ])
  const page = await mountPage({ routes: routesFor(document), prefs: { activeId: 'arxiv-one' } })
  try {
    const notice = page.container.querySelector('.pr-proxy-notice')
    assert.ok(notice, 'the page explains why a source is missing')
    assert.match(notice.textContent, /代理/)
    assert.match(notice.textContent, /Hugging Face/)
    assert.match(notice.textContent, /代理认证失败/)
    assert.doesNotMatch(notice.textContent, /arXiv/, 'a healthy source is not listed as skipped')
  } finally {
    await page.unmount()
  }
})

test('a run with no proxy skip shows no notice', async () => {
  const document = dayDocument([{ id: 'arxiv', status: 'ok', items: 1 }])
  const page = await mountPage({ routes: routesFor(document), prefs: { activeId: 'arxiv-one' } })
  try {
    assert.equal(page.container.querySelector('.pr-proxy-notice'), null)
  } finally {
    await page.unmount()
  }
})
