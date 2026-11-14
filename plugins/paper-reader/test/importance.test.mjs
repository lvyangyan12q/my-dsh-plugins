import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildImportanceMessages,
  parseImportance,
  scoreImportance,
} from '../src/pipeline/importance.js'
import { selectDaily } from '../src/pipeline/select.js'
import { mergeConfig, validateConfig } from '../src/config.js'

const SETTINGS = {
  configured: true,
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key',
  model: 'test-model',
  timeoutMs: 5_000,
}

function chatResponse(content) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content } }] }),
  }
}

function paper(id, votes = 0) {
  return { id, sourceId: 'hf', kind: 'paper', title: id, url: `https://example.test/${id}`, upvotes: votes }
}

function blog(id) {
  return { id, sourceId: 'openai', kind: 'blog', title: id, url: `https://example.test/${id}`, publishedAt: '2026-11-09T00:00:00Z' }
}

test('the prompt shows every candidate with its kind and source', () => {
  const messages = buildImportanceMessages([paper('a'), blog('b')])
  assert.equal(messages.length, 2)
  assert.match(messages[1].content, /\[0\].*kind=paper/)
  assert.match(messages[1].content, /\[1\].*kind=blog/)
  assert.match(messages[0].content, /"score"/)
})

test('parseImportance reads JSON lines, clamps scores and ignores junk', () => {
  const content = [
    '{"id": 0, "score": 9, "why": "frontier model"}',
    'noise',
    '{"id": 1, "score": 15}',
    '{"id": 9, "score": 8}',
    '{"id": 2, "score": "high"}',
  ].join('\n')
  const scores = parseImportance(content, 3)
  assert.equal(scores.get(0), 9)
  assert.equal(scores.get(1), 10, 'a score above 10 is clamped')
  assert.equal(scores.has(9), false, 'an out-of-range id is ignored')
  assert.equal(scores.has(2), false, 'a non-numeric score is ignored')
})

test('scoreImportance attaches a score to each candidate', async () => {
  const calls = []
  const result = await scoreImportance({
    candidates: [paper('a'), paper('b')],
    config: { selection: { importance: { enabled: true } } },
    settings: SETTINGS,
    fetchImpl: async (url, init) => {
      calls.push(init.body)
      return chatResponse('{"id":0,"score":9}\n{"id":1,"score":3}')
    },
  })
  assert.equal(result.failed, false)
  assert.equal(calls.length, 1)
  assert.equal(result.scored[0].importance, 9)
  assert.equal(result.scored[1].importance, 3)
})

test('a failed gate changes nothing: candidates stay unscored and the run continues', async () => {
  const result = await scoreImportance({
    candidates: [paper('a')],
    config: { selection: { importance: { enabled: true } } },
    settings: SETTINGS,
    fetchImpl: async () => { throw new Error('connect ECONNREFUSED') },
  })
  assert.equal(result.failed, true)
  assert.equal(result.scored.length, 1)
  assert.equal(result.scored[0].importance, undefined)
})

test('the gate is a no-op unless enabled', async () => {
  const result = await scoreImportance({
    candidates: [paper('a')],
    config: {},
    settings: SETTINGS,
    fetchImpl: async () => chatResponse('{"id":0,"score":9}'),
  })
  assert.equal(result.reason, 'disabled')
  assert.equal(result.scored[0].importance, undefined)
})

test('selection drops weak items, keeps unrated ones and lets a strong item exceed the quota', () => {
  const candidates = [
    { ...paper('weak-1', 50), importance: 2 },
    { ...paper('weak-2', 40), importance: 4 },
    { ...paper('good-1', 30), importance: 7 },
    { ...paper('good-2', 20), importance: 6 },
    { ...paper('star', 10), importance: 10 },
    { ...blog('blog-good'), importance: 8 },
    { ...blog('blog-weak'), importance: 1 },
  ]
  const selection = selectDaily(candidates, {
    quota: { total: 2, papers: 1, blogs: 1 },
    importance: { enabled: true, minScore: 6, strongScore: 9, maxOverflow: 1 },
  })

  const ids = selection.selected.map(candidate => candidate.id)
  assert.equal(ids.includes('weak-1'), false, 'below minScore is dropped')
  assert.equal(ids.includes('blog-weak'), false)
  assert.ok(ids.includes('good-1'))
  assert.ok(ids.includes('blog-good'))
  assert.ok(ids.includes('star'), 'a strong item overflows the quota')
  assert.equal(selection.selected.length, 3)
  assert.equal(selection.stats.droppedByImportance, 3)
  assert.equal(selection.stats.importanceOverflow, 1)
})

test('overflow is capped so a strong day cannot rebuild a long list', () => {
  const candidates = [
    { ...paper('a', 9), importance: 10 },
    { ...paper('b', 8), importance: 10 },
    { ...paper('c', 7), importance: 10 },
    { ...paper('d', 6), importance: 10 },
  ]
  const selection = selectDaily(candidates, {
    quota: { total: 1, papers: 1, blogs: 0 },
    importance: { enabled: true, minScore: 6, strongScore: 9, maxOverflow: 2 },
  })
  assert.equal(selection.selected.length, 3)
  assert.equal(selection.stats.importanceOverflow, 2)
})

test('an empty gate still yields an empty day rather than filler', () => {
  const selection = selectDaily([
    { ...paper('x', 30), importance: 3 },
    { ...blog('y'), importance: 2 },
  ], {
    quota: { total: 8, papers: 3, blogs: 5 },
    importance: { enabled: true, minScore: 6, strongScore: 9, maxOverflow: 3 },
  })
  assert.equal(selection.selected.length, 0)
  assert.equal(selection.stats.droppedByImportance, 2)
})

test('config validation accepts the gate and rejects a nonsensical threshold', () => {
  const ok = mergeConfig({ selection: { importance: { enabled: true, minScore: 5, strongScore: 8, maxOverflow: 2 } } })
  assert.doesNotThrow(() => validateConfig(ok))
  assert.equal(ok.selection.importance.minScore, 5)

  const bad = mergeConfig({ selection: { importance: { enabled: true, minScore: 8, strongScore: 4 } } })
  assert.throws(() => validateConfig(bad), /strongScore must be at least minScore/)

  const worse = mergeConfig({ selection: { importance: { enabled: 'yes' } } })
  assert.throws(() => validateConfig(worse), /enabled must be true or false/)
})
