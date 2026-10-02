import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Mineru } from '../src/mineru.ts'
import { importMineruKnowledge } from '../src/knowledge-import.ts'
import { knowledgeExcerpt } from '../src/knowledge.ts'

test('knowledge search excerpts stay bounded around the match without changing the original', () => {
  const source = 'a'.repeat(4000) + 'chart topic' + 'b'.repeat(4000)
  const excerpt = knowledgeExcerpt(source, 'chart topic')
  assert.equal(excerpt.length, 1600)
  assert.ok(excerpt.includes('chart topic'))
  assert.equal(source.length, 8011)
})

test('completed knowledge imports preserve pictures, source and old records; reruns are idempotent', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'kg-import-'))
  try {
    const mineru = new Mineru(() => ({}), dir)
    const id = '12345678-1234-1234-1234-123456789012'
    await mkdir(mineru.jobDir(id))
    const content = '![diagram](/api/kaogong/document-image?id=' + id + '&asset=images%2Fa.jpg)\n<table><tr><td>42</td></tr></table>'
    await writeFile(resolve(mineru.jobDir(id), 'knowledge.md'), content)
    await writeFile(resolve(dir, 'rebuild-manifest.json'), JSON.stringify({ documents: [{
      file: '/lectures/test.pdf', fingerprint: 'a'.repeat(64), subject: 'test', kind: '讲义',
      jobs: [{ id, pages: '1-10', state: 'done' }, { id, pages: '11-20', state: 'running' }],
    }] }))
    const map = new Map<string, any>([['legacy', { content: 'old' }]])
    const table = { get: (key: string) => map.get(key), put: async (key: string, value: any) => { map.set(key, value) } }
    assert.equal(await importMineruKnowledge(mineru, table), 1)
    assert.equal(await importMineruKnowledge(mineru, table), 0)
    assert.equal(map.size, 2)
    const record = map.get('mineru_' + 'a'.repeat(64) + '_1-10')
    assert.equal(record.content, content)
    assert.equal(record.source, '/lectures/test.pdf#pages=1-10')
    assert.equal(record.kind, '讲义')
    assert.equal(map.get('legacy').content, 'old')
  } finally { await rm(dir, { recursive: true, force: true }) }
})
