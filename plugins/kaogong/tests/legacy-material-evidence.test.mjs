import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { inspectLegacy } from '../src/legacy-inspection.mjs'
import { inspectLegacyMaterialEvidence, revalidateLegacyMaterialEvidence, readLegacyMaterialAsset, writeLegacyMaterialEvidence } from '../src/legacy-material-evidence.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const jobId = '12345678-1234-1234-1234-123456789012'
const specs = { kaogong_bank: [2, 'questions'], kaogong_knowledge: [1, 'entries'], kaogong_lessons: [1, 'lessons'], kaogong_notebook: [1, 'questions'], kaogong_practice: [1, 'rounds'], kaogong_progress: [1, 'days'], personal_workbench_role_bindings: [1, 'bindings'] }
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'material-evidence-'))
  t.after(async () => {
    const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(root))
    assert.ok(rel.startsWith('material-evidence-') && !rel.includes(path.sep))
    await fs.rm(root, { recursive: true, force: true })
  })
  const materialRoot = path.join(root, 'materials'), home = path.join(root, 'home')
  const jobRoot = path.join(materialRoot, 'storage/mineru', jobId)
  await fs.mkdir(path.join(jobRoot, 'assets/images'), { recursive: true })
  await fs.mkdir(path.join(home, 'storages'), { recursive: true })
  const pdf = path.join(materialRoot, 'source.pdf'), bytes = Buffer.from('%PDF-1.7\ncontrolled fixture\n')
  await fs.writeFile(pdf, bytes)
  const fingerprint = hash(bytes), id = `mineru_${fingerprint}_1-2`
  const content = `# original\n![diagram](/api/kaogong/document-image?id=${jobId}&asset=images%2Fa.png)\n`
  const entry = { title: 'source.pdf [PDF 1-2]', subject: 'subject', knowledgePoint: '', kind: '讲义', content, source: pdf + '#pages=1-2', tags: ['MinerU', '待校对', 'mineru-job:' + jobId], createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  const job = { id: jobId, batchId: 'batch', source: pdf, subject: 'subject', title: 'source.pdf', pages: '1-2' }
  const manifest = { version: 1, documents: [{ file: pdf, fingerprint, pages: 2, subject: 'subject', kind: '讲义', jobs: [{ id: jobId, pages: '1-2', state: 'done', characters: content.length, images: 1 }] }] }
  await fs.writeFile(path.join(jobRoot, 'job.json'), JSON.stringify(job))
  await fs.writeFile(path.join(jobRoot, 'knowledge.md'), content)
  await fs.writeFile(path.join(jobRoot, 'assets/images/a.png'), 'controlled-image-bytes')
  await fs.writeFile(path.join(materialRoot, 'storage/mineru/rebuild-manifest.json'), JSON.stringify(manifest))
  for (const [name, [version, table]] of Object.entries(specs)) await fs.writeFile(path.join(home, 'storages', name + '.json'), JSON.stringify({ unit: { name, version }, global: null, tables: { [table]: name === 'kaogong_knowledge' ? { [id]: entry } : {} } }))
  const { snapshot } = await inspectLegacy({ home })
  return { root, materialRoot, home, jobRoot, pdf, fingerprint, id, content, entry, job, manifest, snapshot }
}
function replaceEntries(f, entries) {
  const file = f.snapshot.files.find(file => file.name === 'kaogong_knowledge')
  const data = JSON.parse(Buffer.from(file.bytesBase64, 'base64'))
  data.tables.entries = entries
  const bytes = Buffer.from(JSON.stringify(data)); file.bytesBase64 = bytes.toString('base64'); file.sha256 = hash(bytes)
  f.snapshot.sourceRevision = hash(JSON.stringify(f.snapshot.files.map(({ name, sha256, resolvedPath }) => [name, sha256, resolvedPath])))
}
async function replaceContent(f, content) {
  f.entry.content = content
  f.manifest.documents[0].jobs[0].characters = content.length
  await fs.writeFile(path.join(f.jobRoot, 'knowledge.md'), content)
  await fs.writeFile(path.join(f.materialRoot, 'storage/mineru/rebuild-manifest.json'), JSON.stringify(f.manifest))
  replaceEntries(f, { [f.id]: f.entry })
}

test('exact manifest, job, PDF, content and inline asset produce a stable readonly proof', async t => {
  const f = await fixture(t)
  const before = await fs.readFile(f.pdf)
  const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
  assert.deepEqual(result.summary.counts, { verified: 1, private: 0, assets: 1 })
  assert.equal(result.evidence.entries[0].id, f.id)
  assert.equal(result.evidence.entries[0].jobId, jobId)
  assert.equal(result.evidence.entries[0].sourcePdfSha256, f.fingerprint)
  assert.equal(result.evidence.entries[0].assets[0].relativePath, `storage/mineru/${jobId}/assets/images/a.png`)
  assert.doesNotMatch(JSON.stringify(result.summary), /source.pdf|12345678|subject|original/)
  assert.equal((await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })).evidence.evidenceHash, result.evidence.evidenceHash)
  assert.equal((await revalidateLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, evidence: result.evidence })).evidenceHash, result.evidence.evidenceHash)
  assert.equal((await readLegacyMaterialAsset({ evidence: result.evidence, entryId: f.id, asset: 'images/a.png' })).toString(), 'controlled-image-bytes')
  assert.deepEqual(await fs.readFile(f.pdf), before)
})
test('private evidence receipt can only be created outside materials and the source home', async t => {
  const f = await fixture(t)
  for (const output of [path.join(f.materialRoot, 'proof.json'), path.join(f.home, 'proof.json')]) await assert.rejects(writeLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, output }), { code: 'OUTPUT_IN_SOURCE' })
  const output = path.join(f.root, 'proof.private.json')
  const result = await writeLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, output })
  assert.equal(result.counts.verified, 1)
  const receipt = JSON.parse(await fs.readFile(output, 'utf8'))
  assert.equal(receipt.evidenceHash, result.evidenceHash)
  await assert.rejects(writeLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, output }), { code: 'OUTPUT_EXISTS' })
})
test('unrecognized business fields keep an otherwise matching entry private', async t => {
  const f = await fixture(t)
  const file = f.snapshot.files.find(file => file.name === 'kaogong_knowledge')
  const data = JSON.parse(Buffer.from(file.bytesBase64, 'base64'))
  data.tables.entries[f.id].personalComment = 'private annotation'
  const bytes = Buffer.from(JSON.stringify(data)); file.bytesBase64 = bytes.toString('base64'); file.sha256 = hash(bytes)
  f.snapshot.sourceRevision = hash(JSON.stringify(f.snapshot.files.map(({ name, sha256, resolvedPath }) => [name, sha256, resolvedPath])))
  const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
  assert.deepEqual(result.summary.counts, { verified: 0, private: 1, assets: 0 })
})
for (const [label, edit] of [
  ['original PDF', async f => fs.writeFile(f.pdf, '%PDF-1.7\nchanged')],
  ['parsed content', async f => fs.writeFile(path.join(f.jobRoot, 'knowledge.md'), f.content + 'changed')],
  ['job source', async f => fs.writeFile(path.join(f.jobRoot, 'job.json'), JSON.stringify({ ...f.job, source: '/different.pdf' }))],
  ['job subject', async f => fs.writeFile(path.join(f.jobRoot, 'job.json'), JSON.stringify({ ...f.job, subject: 'changed' }))],
  ['job pages', async f => fs.writeFile(path.join(f.jobRoot, 'job.json'), JSON.stringify({ ...f.job, pages: '1-1' }))],
  ['job ID', async f => fs.writeFile(path.join(f.jobRoot, 'job.json'), JSON.stringify({ ...f.job, id: '87654321-1234-1234-1234-123456789012' }))],
  ['entry title', async f => { f.entry.title += ' personal'; replaceEntries(f, { [f.id]: f.entry }) }],
  ['entry kind', async f => { f.entry.kind = '其他'; replaceEntries(f, { [f.id]: f.entry }) }],
  ['entry tags', async f => { f.entry.tags.push('personal'); replaceEntries(f, { [f.id]: f.entry }) }],
  ['entry content', async f => { f.entry.content += 'private'; replaceEntries(f, { [f.id]: f.entry }) }],
  ['duplicate manifest mapping', async f => { f.manifest.documents.push(f.manifest.documents[0]); await fs.writeFile(path.join(f.materialRoot, 'storage/mineru/rebuild-manifest.json'), JSON.stringify(f.manifest)) }],
]) test(label + ' mismatch keeps entry private', async t => {
  const f = await fixture(t)
  await edit(f)
  const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
  assert.deepEqual(result.summary.counts, { verified: 0, private: 1, assets: 0 })
})
test('notes remain private even with matching source metadata; ordinary IDs are unsupported', async t => {
  const f = await fixture(t)
  f.entry.kind = '笔记'; f.manifest.documents[0].kind = '笔记'
  await fs.writeFile(path.join(f.materialRoot, 'storage/mineru/rebuild-manifest.json'), JSON.stringify(f.manifest))
  replaceEntries(f, { [f.id]: f.entry, custom: { ...f.entry, kind: '讲义' } })
  const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
  assert.deepEqual(result.summary.counts, { verified: 0, private: 2, assets: 0 })
  assert.equal(result.evidence.privateEntries.find(row => row.id === f.id).reason, 'PRIVATE_NOTE')
})
for (const [label, reference] of [
  ['parent traversal', `/api/kaogong/document-image?id=${jobId}&asset=..%2Foutside.png`],
  ['encoded traversal', `/api/kaogong/document-image?id=${jobId}&asset=%252e%252e%252Foutside.png`],
  ['foreign job', '/api/kaogong/document-image?id=87654321-1234-1234-1234-123456789012&asset=images%2Fa.png'],
  ['external URL', 'https://example.invalid/image.png'],
  ['extra URL parameters', `/api/kaogong/document-image?id=${jobId}&asset=images%2Fa.png&token=private`],
]) test(label + ' image references remain private without fetching a fallback', async t => {
  const f = await fixture(t)
  await replaceContent(f, `![image](${reference})`)
  const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
  assert.deepEqual(result.summary.counts, { verified: 0, private: 1, assets: 0 })
})
test('HTML and reference-style images remain unsupported', async t => {
  const f = await fixture(t)
  for (const content of ['<img src="images/a.png">', '![image][picture]\n[picture]: images/a.png']) {
    await replaceContent(f, content)
    const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
    assert.equal(result.summary.counts.verified, 0)
  }
})
test('snapshot bytes cannot be edited without invalidating their recorded hash', async t => {
  const f = await fixture(t)
  f.snapshot.files.find(file => file.name === 'kaogong_knowledge').bytesBase64 = Buffer.from('{}').toString('base64')
  await assert.rejects(inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot }), { code: 'INVALID_INSPECTION_SNAPSHOT' })
})
test('PDF path traversal is rejected before an outside file is read', async t => {
  const f = await fixture(t), reads = []
  f.manifest.documents[0].file = path.join(f.materialRoot, '..', 'outside.pdf')
  await fs.writeFile(path.join(f.materialRoot, 'storage/mineru/rebuild-manifest.json'), JSON.stringify(f.manifest))
  const io = { ...fs, readFile: async target => { reads.push(target); return fs.readFile(target) } }
  const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, io })
  assert.equal(result.summary.counts.verified, 0)
  assert.ok(reads.every(target => !target.endsWith('outside.pdf')))
})
test('directory junction escapes are rejected without reading outside asset bytes', async t => {
  const f = await fixture(t)
  const outside = path.join(f.root, 'outside'), images = path.join(f.jobRoot, 'assets/images')
  await fs.rename(images, outside)
  await fs.symlink(outside, images, process.platform === 'win32' ? 'junction' : 'dir')
  const reads = [], io = { ...fs, readFile: async target => { reads.push(target); return fs.readFile(target) } }
  const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, io })
  assert.equal(result.summary.counts.verified, 0)
  assert.ok(reads.every(target => !target.startsWith(outside)))
})
for (const [label, mutate] of [
  ['PDF', async f => fs.writeFile(f.pdf, '%PDF-1.7\ntampered')],
  ['asset', async f => fs.writeFile(path.join(f.jobRoot, 'assets/images/a.png'), 'tampered')],
  ['manifest', async f => fs.appendFile(path.join(f.materialRoot, 'storage/mineru/rebuild-manifest.json'), '\n')],
  ['knowledge', async f => fs.appendFile(path.join(f.jobRoot, 'knowledge.md'), 'tampered')],
  ['root identity', async f => { await fs.rename(f.materialRoot, path.join(f.root, 'old-materials')); await fs.mkdir(f.materialRoot) }],
]) test(label + ' mutation invalidates previous evidence and asset reads', async t => {
  const f = await fixture(t), { evidence } = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
  await mutate(f)
  await assert.rejects(revalidateLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, evidence }), { code: 'MATERIAL_EVIDENCE_CHANGED' })
  await assert.rejects(readLegacyMaterialAsset({ evidence, entryId: f.id, asset: 'images/a.png' }), { code: 'MATERIAL_EVIDENCE_CHANGED' })
})
test('asset reads reject unproven names and evidence tampering', async t => {
  const f = await fixture(t), { evidence } = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
  await assert.rejects(readLegacyMaterialAsset({ evidence, entryId: f.id, asset: '../source.pdf' }), { code: 'MATERIAL_ASSET_NOT_PROVEN' })
  evidence.entries[0].assets[0].asset = 'changed'
  await assert.rejects(readLegacyMaterialAsset({ evidence, entryId: f.id, asset: 'changed' }), { code: 'INVALID_MATERIAL_EVIDENCE' })
})
test('a source mutation during inspection blocks stale evidence', async t => {
  const f = await fixture(t)
  let changed = false
  const io = { ...fs, readFile: async target => {
    const bytes = await fs.readFile(target)
    if (!changed && target.endsWith('a.png')) { changed = true; await fs.appendFile(f.pdf, 'changed') }
    return bytes
  } }
  await assert.rejects(inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, io }), { code: 'MATERIAL_EVIDENCE_CHANGED' })
})
test('an original absolute PDF alias is proven only while its realpath stays inside the explicit root', async t => {
  const f = await fixture(t), alias = path.join(f.root, 'old-material-alias')
  await fs.symlink(f.materialRoot, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const declaredPdf = path.join(alias, 'source.pdf')
  f.entry.source = declaredPdf + '#pages=1-2'; f.job.source = declaredPdf; f.manifest.documents[0].file = declaredPdf
  await fs.writeFile(path.join(f.jobRoot, 'job.json'), JSON.stringify(f.job))
  await fs.writeFile(path.join(f.materialRoot, 'storage/mineru/rebuild-manifest.json'), JSON.stringify(f.manifest))
  replaceEntries(f, { [f.id]: f.entry })
  const result = await inspectLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot })
  assert.equal(result.summary.counts.verified, 1)
  await fs.unlink(alias)
  const outside = path.join(f.root, 'outside-root'); await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'source.pdf'), 'outside-private-content')
  await fs.symlink(outside, alias, process.platform === 'win32' ? 'junction' : 'dir')
  await assert.rejects(revalidateLegacyMaterialEvidence({ snapshot: f.snapshot, materialRoot: f.materialRoot, evidence: result.evidence }), { code: 'MATERIAL_EVIDENCE_CHANGED' })
})
