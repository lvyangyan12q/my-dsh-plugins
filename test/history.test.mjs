/**
 * Reading-page history: the page starts from the index, loads the newest seven
 * days first, then older days on demand, capped at the 30-day retention window.
 * A day that fails to load is reported by name without taking the page down.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mountPage } from './helpers/client.mjs'

const DIRECTION = [{ id: 'agent', label: 'Agent' }]
const SOURCE = [{ id: 'arxiv', label: 'arXiv', short: 'A' }]

function dayDocument(date) {
  return {
    schemaVersion: 2,
    date,
    generatedAt: `${date}T09:02:00+08:00`,
    run: { status: 'ok', sources: [{ id: 'arxiv', status: 'ok', items: 1 }] },
    directions: DIRECTION,
    sources: SOURCE,
    items: [{
      id: `${date}-item`,
      sourceId: 'arxiv',
      sourceLanguage: 'en',
      title: { original: `Paper ${date}`, translation: `论文 ${date}` },
      summary: { original: 'Summary.', translation: '摘要。' },
      direction: 'agent',
      collectedAt: `${date}T08:00:00+08:00`,
      translationState: 'complete',
      blocks: [{ type: 'paragraph', original: `Body ${date}.`, translation: `正文 ${date}。` }],
    }],
  }
}

/** Newest-first calendar dates ending on `end`. */
function datesEndingAt(end, count) {
  const out = []
  const base = new Date(`${end}T00:00:00Z`).getTime()
  for (let offset = 0; offset < count; offset += 1) {
    out.push(new Date(base - offset * 86_400_000).toISOString().slice(0, 10))
  }
  return out
}

function historyRoutes(dates, overrides = {}) {
  const routes = {
    '/api/paper-reader/index': {
      schemaVersion: 2,
      updatedAt: `${dates[0]}T09:05:00Z`,
      retentionDays: 30,
      missing: false,
      demo: false,
      days: dates.map(date => ({ date, items: 1, runStatus: 'ok' })),
    },
  }
  for (const date of dates) routes[`/api/paper-reader/digest/${date}`] = dayDocument(date)
  return { ...routes, ...overrides }
}

async function withPage(options, run) {
  const page = await mountPage(options)
  try {
    await run(page)
  } finally {
    await page.unmount()
  }
}

test('starts from the index and loads only the newest seven days', async () => {
  const dates = datesEndingAt('2026-11-08', 8)
  await withPage({ routes: historyRoutes(dates) }, async ({ container, fetchCalls }) => {
    assert.equal(fetchCalls[0], '/api/paper-reader/index')
    const dayCalls = fetchCalls.filter(url => url.startsWith('/api/paper-reader/digest/'))
    assert.equal(dayCalls.length, 7)
    assert.deepEqual(dayCalls.sort(), dates.slice(0, 7).map(date => `/api/paper-reader/digest/${date}`).sort())

    assert.equal(container.querySelectorAll('.pr-day').length, 7)
    const text = container.textContent
    for (const date of dates.slice(0, 7)) assert.match(text, new RegExp(`Paper ${date}`))
    assert.doesNotMatch(text, /Paper 2026-11-01/, 'the eighth day waits for 加载更早')

    assert.match(container.querySelector('.pr-status').textContent, /已加载 7\/8 天/)
    const more = container.querySelector('.pr-history-more')
    assert.ok(more, 'an older-day control is offered')
    assert.match(more.textContent, /加载更早/)
  })
})

test('加载更早 appends the next day and then disappears', async () => {
  const dates = datesEndingAt('2026-11-08', 8)
  await withPage({ routes: historyRoutes(dates) }, async ({ container, click }) => {
    await click(container.querySelector('.pr-history-more'))
    assert.equal(container.querySelectorAll('.pr-day').length, 8)
    assert.match(container.textContent, /Paper 2026-11-01/)
    assert.equal(container.querySelector('.pr-history-more'), null)
  })
})

test('history stops at the 30-day retention window even when the index is longer', async () => {
  const dates = datesEndingAt('2026-11-08', 40)
  await withPage({ routes: historyRoutes(dates) }, async ({ container, click }) => {
    for (let attempt = 0; attempt < 8 && container.querySelector('.pr-history-more'); attempt += 1) {
      await click(container.querySelector('.pr-history-more'))
    }
    assert.equal(container.querySelectorAll('.pr-day').length, 30)
    assert.equal(container.querySelector('.pr-history-more'), null)
    assert.doesNotMatch(container.textContent, /Paper 2026-10-01/, 'days past the retention window are not offered')
  })
})

test('a failed day is named in the list without hiding the days that loaded', async () => {
  const dates = datesEndingAt('2026-11-08', 8)
  const routes = historyRoutes(dates, {
    '/api/paper-reader/digest/2026-11-06': { status: 500, body: { error: 'digest_unavailable', message: 'read failed' } },
  })
  await withPage({ routes }, async ({ container }) => {
    assert.equal(container.querySelectorAll('.pr-day').length, 6)
    const failed = container.querySelectorAll('.pr-day-error')
    assert.equal(failed.length, 1)
    assert.match(failed[0].textContent, /2026-11-06/)
    assert.match(failed[0].textContent, /read failed/)
    assert.ok(failed[0].querySelector('.pr-day-retry'), 'the failed day can be retried')
    assert.match(container.textContent, /Paper 2026-11-07/)
  })
})

test('the failed day loads after a retry', async () => {
  const dates = datesEndingAt('2026-11-08', 8)
  let attempts = 0
  const routes = historyRoutes(dates, {
    '/api/paper-reader/digest/2026-11-06': () => {
      attempts += 1
      return attempts === 1
        ? { status: 500, body: { error: 'digest_unavailable', message: 'read failed' } }
        : dayDocument('2026-11-06')
    },
  })
  await withPage({ routes }, async ({ container, click }) => {
    assert.equal(container.querySelectorAll('.pr-day-error').length, 1)
    await click(container.querySelector('.pr-day-retry'))
    assert.equal(container.querySelectorAll('.pr-day-error').length, 0)
    assert.equal(container.querySelectorAll('.pr-day').length, 7)
    assert.match(container.textContent, /Paper 2026-11-06/)
  })
})

test('an index that does not exist yet falls back to the legacy digest', async () => {
  const legacy = { ...dayDocument('2026-11-04'), days: undefined }
  const routes = {
    '/api/paper-reader/index': { schemaVersion: 2, updatedAt: null, retentionDays: 30, missing: true, demo: false, days: [] },
    '/api/paper-reader/digest': {
      schemaVersion: 2,
      demo: false,
      days: [{ date: '2026-11-04', items: legacy.items }],
    },
  }
  await withPage({ routes }, async ({ container }) => {
    assert.equal(container.querySelectorAll('.pr-day').length, 1)
    assert.match(container.textContent, /Paper 2026-11-04/)
    assert.equal(container.querySelector('.pr-history-more'), null)
  })
})

test('an empty history is an empty state, not an error', async () => {
  const routes = {
    '/api/paper-reader/index': { schemaVersion: 2, updatedAt: null, retentionDays: 30, missing: true, demo: false, days: [] },
    '/api/paper-reader/digest': { schemaVersion: 2, demo: false, days: [] },
  }
  await withPage({ routes }, async ({ container }) => {
    assert.ok(container.querySelector('.pr-empty'))
    assert.equal(container.querySelector('.pr-error'), null)
    assert.match(container.textContent, /还没有/)
  })
})

test('when every day fails the page reports each date instead of an empty state', async () => {
  const dates = datesEndingAt('2026-11-08', 7)
  const routes = historyRoutes(dates)
  for (const date of dates) {
    routes[`/api/paper-reader/digest/${date}`] = { status: 500, body: { error: 'digest_unavailable', message: 'offline' } }
  }
  await withPage({ routes }, async ({ container }) => {
    assert.equal(container.querySelectorAll('.pr-day-error').length, 7)
    assert.equal(container.querySelector('.pr-empty'), null)
    assert.match(container.textContent, /2026-11-08/)
  })
})

test('a corrupt index is an explicit error with the host message', async () => {
  const routes = {
    '/api/paper-reader/index': { status: 422, body: { error: 'index_unavailable', message: 'index.json is not valid JSON' } },
  }
  await withPage({ routes }, async ({ container }) => {
    const error = container.querySelector('.pr-error')
    assert.ok(error)
    assert.match(error.textContent, /索引/)
    assert.match(error.textContent, /index\.json is not valid JSON/)
    assert.ok(error.querySelector('.pr-primary-btn'))
  })
})
