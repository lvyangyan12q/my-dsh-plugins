import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import AdmZip from 'adm-zip'
import { Mineru, safeAsset, rewriteImages } from '../src/mineru.ts'

test('document assets reject traversal and missing images', () => {
  for (const path of ['../a.png', '/a.png', 'C:/a.png', 'a\\b.png', 'a/../../b']) assert.throws(() => safeAsset(path))
  const files = new Set(['doc/images/a.png'])
  assert.match(rewriteImages('![chart](images/a.png)', 'abc', 'doc', files), /document-image\?id=abc&asset=doc%2Fimages%2Fa.png/)
  assert.throws(() => rewriteImages('![chart](missing.png)', 'abc', 'doc', files))
})

test('upload, poll, restore archive and resume without uploading again', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'kaogong-mineru-'))
  try {
    const source = join(dir, 'test.pdf')
    await writeFile(source, '%PDF-1.7\nfixture')
    let id = ''
    let ready = false
    const calls: string[] = []
    const zip = new AdmZip()
    zip.addFile('full.md', Buffer.from('# Material\n![chart](images/chart.png)'))
    zip.addFile('images/chart.png', Buffer.from('image-fixture'))
    zip.addFile('example_content_list.json', Buffer.from('[{"page_idx":3}]'))
    const mock = (async (input: any, init: any) => {
      const url = String(input)
      calls.push(url)
      if (url.endsWith('file-urls/batch')) {
        assert.equal(init.headers.Authorization, 'Bearer fixture-token')
        const body = JSON.parse(init.body)
        id = body.files[0].data_id
        assert.equal(body.files[0].page_ranges, '4')
        assert.equal(body.model_version, 'vlm')
        return Response.json({ code: 0, data: { batch_id: 'batch', file_urls: ['https://upload.example/pdf'] } })
      }
      assert.equal(init?.headers?.Authorization, url.includes('extract-results') ? 'Bearer fixture-token' : undefined)
      if (url.includes('upload.example')) return new Response('')
      if (url.includes('extract-results')) return Response.json({ code: 0, data: { extract_result: [{ data_id: id, state: ready ? 'done' : 'running', full_zip_url: 'https://result.example/a.zip' }] } })
      return new Response(zip.toBuffer())
    }) as typeof fetch
    const client = new Mineru(() => ({ token: 'fixture-token' }), dir, mock)
    const started = await client.start(source, 'test', '4')
    assert.equal((await client.collect(started.id)).state, 'running')
    ready = true
    const result = await client.collect(started.id)
    assert.match(result.content!, /document-image/)
    assert.equal((await client.image(started.id, 'images/chart.png')).toString(), 'image-fixture')
    assert.match(await readFile(join(dir, id, 'assets/example_content_list.json'), 'utf8'), /page_idx/)
    const count = calls.length
    assert.equal((await client.collect(started.id)).content, result.content)
    assert.equal(calls.length, count)
    await assert.rejects(client.start(source, 'test', '1-201'))
    await assert.rejects(client.start(source, 'test', '0'))
    await assert.rejects(client.image(started.id, '../job.json'))
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('remote errors do not expose credentials or response body', async () => {
  const client = new Mineru(() => ({ token: 'fixture-token' }), '.', (async () => Response.json({ code: -1, msg: 'fixture-token' })) as typeof fetch)
  await assert.rejects(client.api('test'), { message: 'MinerU API error code: -1' })
})
