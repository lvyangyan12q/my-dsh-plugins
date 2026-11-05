/**
 * Daily selection: keyword/category filtering, arXiv-id/URL/title dedupe and
 * the configurable paper quota. These are pure rules over candidates, so the
 * tests describe ranking outcomes rather than how the score is computed.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectDaily } from '../src/pipeline/select.js'

let sequence = 0

function candidate(patch = {}) {
  sequence += 1
  const id = patch.id ?? `arxiv:2611.${String(10000 + sequence)}`
  return {
    id,
    sourceId: 'arxiv',
    arxivId: id.startsWith('arxiv:') ? id.slice('arxiv:'.length) : null,
    title: `Paper ${sequence}`,
    summary: 'A summary.',
    url: `https://arxiv.org/abs/2611.${String(10000 + sequence)}`,
    publishedAt: '2026-11-04T18:59:56Z',
    categories: ['cs.AI'],
    direction: 'agent',
    tags: [],
    ...patch,
  }
}

test('keeps the first occurrence and drops duplicates by id, URL or title', () => {
  const first = candidate({ title: 'Same Paper', url: 'https://arxiv.org/abs/2611.00001' })
  const byUrl = candidate({ id: 'arxiv:2611.00002', title: 'Different title', url: 'https://arxiv.org/abs/2611.00001/' })
  const byTitle = candidate({ id: 'arxiv:2611.00003', title: 'Same  paper!', url: 'https://arxiv.org/abs/2611.00003' })
  const byId = candidate({ ...first, url: 'https://example.com/other' })

  const { selected, stats } = selectDaily([first, byUrl, byId, byTitle], {
    quota: { total: 10, papers: 6 },
  })

  assert.equal(selected.length, 1)
  assert.equal(selected[0], first)
  assert.equal(stats.duplicates, 3)
})

test('applies the paper quota and the daily total cap without padding the list', () => {
  const candidates = Array.from({ length: 8 }, () => candidate())

  const six = selectDaily(candidates, { quota: { total: 10, papers: 6 } })
  assert.equal(six.selected.length, 6)
  assert.equal(six.stats.droppedByQuota, 2)

  const three = selectDaily(candidates, { quota: { total: 10, papers: 3 } })
  assert.equal(three.selected.length, 3)

  const capped = selectDaily(candidates, { quota: { total: 2, papers: 6 } })
  assert.equal(capped.selected.length, 2)

  const short = selectDaily(candidates.slice(0, 4), { quota: { total: 10, papers: 6 } })
  assert.equal(short.selected.length, 4, 'fewer candidates than quota is not padded')
  assert.equal(short.stats.droppedByQuota, 0)
})

test('keyword filters narrow the candidates before the quota is applied', () => {
  const agent = candidate({ title: 'Agentic browsing with tools' })
  const summaryOnly = candidate({ title: 'A study of planning', summary: 'We build an agent that browses.' })
  const survey = candidate({ title: 'Agent survey of the field' })
  const unrelated = candidate({ title: 'A new kernel for attention' })

  const { selected, stats } = selectDaily([agent, summaryOnly, survey, unrelated], {
    quota: { total: 10, papers: 6 },
    includeKeywords: ['agent'],
    excludeKeywords: ['survey'],
  })

  assert.deepEqual(selected.map(item => item.title), ['Agentic browsing with tools', 'A study of planning'])
  assert.equal(stats.filtered, 2)
})

test('category filters drop off-category papers but keep sources without categories', () => {
  const inCategory = candidate({ categories: ['cs.CL'] })
  const offCategory = candidate({ categories: ['cs.LG'] })
  const noCategories = candidate({ categories: [] })

  const { selected } = selectDaily([inCategory, offCategory, noCategories], {
    quota: { total: 10, papers: 6 },
    categories: ['cs.CL'],
  })

  assert.deepEqual(selected.map(item => item.id), [inCategory.id, noCategories.id])
})

test('keyword hits in the title outrank summary-only hits, then recency breaks ties', () => {
  const summaryOld = candidate({ title: 'A study of planning', summary: 'We use an agent.', publishedAt: '2026-11-04T09:00:00Z' })
  const summaryNew = candidate({ title: 'Another planning study', summary: 'We also use an agent.', publishedAt: '2026-11-04T20:00:00Z' })
  const titleHit = candidate({ title: 'An agent that browses', summary: 'Nothing here.', publishedAt: '2026-11-04T10:00:00Z' })
  const noHit = candidate({ title: 'Kernel tricks', summary: 'Nothing here.', publishedAt: '2026-11-04T23:00:00Z' })

  const { selected } = selectDaily([summaryOld, summaryNew, titleHit, noHit], {
    quota: { total: 10, papers: 2 },
    includeKeywords: ['agent'],
  })

  assert.deepEqual(selected.map(item => item.title), ['An agent that browses', 'Another planning study'])
})
