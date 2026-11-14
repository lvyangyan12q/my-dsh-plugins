import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dropSeen } from '../src/shared/url.js'

test('dropSeen removes urls an earlier day already offered', () => {
  const candidates = [
    { url: 'https://blog.google/technology/ai/a/' },
    { url: 'https://blog.google/technology/ai/b' },
    { url: 'https://blog.google/technology/ai/c' },
  ]
  const kept = dropSeen(candidates, ['https://blog.google/technology/ai/a', 'https://blog.google/technology/ai/b/'])
  assert.equal(kept.length, 1)
  assert.match(kept[0].url, /\/c$/)
})

test('dropSeen keeps a candidate with no url and is a no-op without memory', () => {
  assert.equal(dropSeen([{ url: null }], ['https://x/y']).length, 1)
  const all = [{ url: 'https://x/y' }]
  assert.equal(dropSeen(all, []).length, 1)
  assert.equal(dropSeen(all).length, 1)
})

test('dropSeen matches a canonicalised link by its slug', () => {
  const candidates = [
    { url: 'https://www.kimi.com/en/blog/agent-swarm' },
    { url: 'https://www.kimi.com/en/blog/worldvqa' },
  ]
  const kept = dropSeen(candidates, ['https://www.kimi.ai/blog/agent-swarm'])
  assert.equal(kept.length, 1)
  assert.match(kept[0].url, /worldvqa/)
})
