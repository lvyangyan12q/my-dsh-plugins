/**
 * Shared helpers extracted during the review cleanup.
 *
 * These are the seams every adapter, the selector, the storage layer and the
 * reader now share: date normalization, URL keys, block predicates and the
 * fetch-with-timeout helper. Testing them directly keeps the adapters' fixture
 * tests about their sources rather than about duplicated plumbing.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isCodeBlock,
  isEquationBlock,
  isFigureBlock,
  isNeutralBlock,
  isTextBlock,
  readableTextOf,
} from '../src/shared/blocks.js'
import {
  addDays,
  dateOnly,
  isDigestDate,
  localDate,
  normalizeInstant,
  shiftDate,
} from '../src/shared/date.js'
import { fetchText } from '../src/shared/http.js'
import { canonicalUrl, normalizeUrl, slugFromUrl } from '../src/shared/url.js'

test('digest dates are real calendar days and shift by whole days', () => {
  assert.equal(isDigestDate('2026-11-05'), true)
  assert.equal(isDigestDate('2026-02-30'), false)
  assert.equal(isDigestDate('2026-1-5'), false)
  assert.equal(shiftDate('2026-11-05', -1), '2026-11-04')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(dateOnly('2026-11-05T09:00:00+08:00'), '2026-11-05')
  assert.equal(dateOnly('not a date'), null)
})

test('localDate follows the provided clock, not UTC', () => {
  const date = new Date(2026, 10, 5, 0, 30, 0)
  assert.equal(localDate(date), '2026-11-05')
})

test('publishedAt normalizes to one ISO instant shape', () => {
  assert.equal(normalizeInstant('2026-11-05'), '2026-11-05T00:00:00.000Z')
  assert.equal(normalizeInstant('2026-11-05T09:00:00+08:00'), '2026-11-05T01:00:00.000Z')
  assert.equal(normalizeInstant(null), null)
  assert.equal(normalizeInstant('not a date'), null)
})

test('the two URL keys answer different questions: same page vs same paper', () => {
  assert.equal(normalizeUrl('https://example.test/a/#part'), 'https://example.test/a')
  assert.equal(
    canonicalUrl('https://www.arxiv.org/abs/2611.05377v2'),
    canonicalUrl('http://arxiv.org/abs/2611.05377/'),
    'scheme, www, trailing slash and the arXiv version all collapse',
  )
  assert.equal(canonicalUrl(''), '')
  assert.equal(slugFromUrl('https://openai.com/index/introducing-agent-mode/'), 'introducing-agent-mode')
})

test('block predicates are the one place that decides text vs neutral', () => {
  assert.equal(isTextBlock({ type: 'heading' }), true)
  assert.equal(isTextBlock({ type: 'paragraph' }), true)
  assert.equal(isTextBlock({ type: 'code' }), false)
  assert.equal(isNeutralBlock({ type: 'code' }), true)
  assert.equal(isEquationBlock({ type: 'equation' }), true)
  assert.equal(isFigureBlock({ type: 'figure' }), true)
  assert.equal(isCodeBlock({ type: 'code' }), true)
  assert.equal(readableTextOf({ type: 'code', code: 'x = 1' }), 'x = 1')
  assert.equal(readableTextOf({ type: 'figure', caption: { original: 'Caption' } }), 'Caption')
})

test('fetchText applies the timeout, accept and user agent once', async () => {
  const calls = []
  const result = await fetchText(async (url, init) => {
    calls.push({ url, init })
    return { ok: true, status: 200, text: async () => 'body' }
  }, 'https://example.test/feed', {
    timeoutMs: 20,
    accept: 'application/atom+xml',
    userAgent: 'test-agent',
  })

  assert.equal(result.text, 'body')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].init.headers.accept, 'application/atom+xml')
  assert.equal(calls[0].init.headers['user-agent'], 'test-agent')
  assert.ok(calls[0].init.signal, 'the request is abortable')
})
