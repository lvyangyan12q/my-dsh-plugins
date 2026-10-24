import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { inspectLegacy } from '../src/legacy-inspection.mjs'
import { inspectLegacyBankImageEvidence, revalidateLegacyBankImageEvidence, readLegacyBankImageAsset, writeLegacyBankImageEvidence } from '../src/legacy-bank-image-evidence.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const specs = { kaogong_bank: [2, 'questions'], kaogong_knowledge: [1, 'entries'], kaogong_lessons: [1, 'lessons'], kaogong_notebook: [1, 'questions'], kaogong_practice: [1, 'rounds'], kaogong_progress: [1, 'days'], personal_workbench_role_bindings: [1, 'bindings'] }
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bank-image-proof-'))
  t.after(async () => { const rel = path.relative(path.resolve(os.tmpdir()), path.resolve(root)); assert.ok(rel.startsWith('bank-image-proof-') && !rel.includes(path.sep)); await fs.rm(root, { recursive: true, force: true }) })
  const questionImageRoot = path.join(root, 'images'), home = path.join(root, 'home')
  await fs.mkdir(path.join(questionImageRoot, 'verified'), { recursive: true })
  await fs.mkdir(path.join(home, 'storages'), { recursive: true })
  const row = { stem: 'controlled original chart question', options: ['A. first', 'B. second'], explanation: 'unchanged explanation', correctAnswer: 'B', score: 3 }
  const asset = 'verified/chart.png', bytes = Buffer.from('controlled-chart-bytes')
  const association = { questionId: 'q1', stemSha256: sha(row.stem), asset, assetSha256: sha(bytes), sourcePdfSha256: sha('manual-source-pdf'), sourcePage: 4 }
  await fs.writeFile(path.join(questionImageRoot, asset), bytes)
  await fs.writeFile(path.join(questionImageRoot, 'verified/associations.json'), JSON.stringify({ version: 1, associations: [association] }))
  for (const [name, [version, table]] of Object.entries(specs)) await fs.writeFile(path.join(home, 'storages', name + '.json'), JSON.stringify({ unit: { name, version }, global: null, tables: { [table]: name === 'kaogong_bank' ? { q1: row } : {} } }))
  const { snapshot } = await inspectLegacy({ home })
  return { root, questionImageRoot, home, row, association, asset, bytes, snapshot }
}
function replaceBank(f, records) {
  const file = f.snapshot.files.find(row => row.name === 'kaogong_bank')
  const data = JSON.parse(Buffer.from(file.bytesBase64, 'base64')); data.tables.questions = records
  const bytes = Buffer.from(JSON.stringify(data)); file.bytesBase64 = bytes.toString('base64'); file.sha256 = sha(bytes)
  f.snapshot.sourceRevision = sha(JSON.stringify(f.snapshot.files.map(({ name, sha256, resolvedPath }) => [name, sha256, resolvedPath])))
}
async function optionIndex(f, changes = {}) {
  const row = { questionId: 'q1', stemSha256: sha(f.row.stem), optionsSha256: sha(JSON.stringify(f.row.options)), optionIndices: [0, 1], sourceAssets: [{ asset: f.asset, assetSha256: sha(f.bytes) }], sourceOptions: [`A. ![original option](题目_images/${f.asset})`, 'B. second'], sourcePdfSha256: sha('manual-source-pdf'), sourcePage: 4, ...changes }
  await fs.writeFile(path.join(f.questionImageRoot, 'verified/option-repairs.json'), JSON.stringify({ version: 1, associations: [row] }))
  return row
}
test('manually associated exact stem and image bytes give a row-scoped readonly bank asset proof', async t => {
  const f = await fixture(t)
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.deepEqual(result.summary.counts, { records: 1, verifiedRecords: 1, assets: 1, embeddedReferences: 0, documentReferences: 0, overlayReferences: 1, unavailableReferences: 0 })
  const proof = result.evidence.questions[0]
  assert.equal(proof.questionId, 'q1')
  assert.equal(proof.stemSha256, sha(f.row.stem))
  assert.equal(proof.optionsSha256, sha(JSON.stringify(f.row.options)))
  assert.deepEqual(proof.assets.map(({ bindings, ...asset }) => asset), [{ asset: f.asset, relativePath: f.asset, rootKind: 'question-image', sha256: sha(f.bytes) }])
  assert.deepEqual(await readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: f.asset, bindingKey: proof.assets[0].bindings[0].bindingKey }), f.bytes)
  assert.equal((await revalidateLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, evidence: result.evidence })).evidenceHash, result.evidence.evidenceHash)
  assert.doesNotMatch(JSON.stringify(result.summary), /q1|chart|score|correctAnswer|images/)
})
test('an invalid option association cannot partially contribute otherwise unreferenced images', async t => {
  const f = await fixture(t), extra = 'verified/extra.png'
  await fs.writeFile(path.join(f.questionImageRoot, extra), 'extra-image')
  await optionIndex(f, { sourceAssets: [{ asset: extra, assetSha256: sha('extra-image') }, { asset: f.asset, assetSha256: sha('conflicting-image') }], sourceOptions: [`A. ![first](题目_images/${extra})`, `B. ![second](题目_images/${f.asset})`] })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.deepEqual(result.evidence.questions[0].assets.map(row => row.asset), [f.asset])
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: extra }), { code: 'BANK_IMAGE_NOT_PROVEN' })
})
test('source-certified option images require exact stem, original options and option labels', async t => {
  const f = await fixture(t)
  await fs.unlink(path.join(f.questionImageRoot, 'verified/associations.json'))
  await optionIndex(f)
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.equal(result.summary.counts.assets, 1)
  assert.equal(result.evidence.questions[0].proofs[0].kind, 'option-association')
  f.row.options[1] = 'B. changed original'; replaceBank(f, { q1: f.row })
  assert.equal((await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })).summary.counts.assets, 0)
  await optionIndex(f, { sourceOptions: [`A. ![chart](题目_images/${f.asset})`, 'C. mismatched label'] })
  assert.equal((await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })).summary.counts.assets, 0)
})
test('declared but unreferenced option images are never read or exposed', async t => {
  const f = await fixture(t), extra = 'verified/unreferenced.png'
  await fs.writeFile(path.join(f.questionImageRoot, extra), 'unreferenced')
  await optionIndex(f, { sourceAssets: [{ asset: f.asset, assetSha256: sha(f.bytes) }, { asset: extra, assetSha256: sha('unreferenced') }] })
  const reads = [], io = { ...fs, readFile: async target => { reads.push(target); return fs.readFile(target) } }
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, io })
  assert.equal(result.summary.counts.assets, 1)
  assert.ok(reads.every(target => !target.endsWith('unreferenced.png')))
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: extra }), { code: 'BANK_IMAGE_NOT_PROVEN' })
})
test('source-image mode is retained as manual display evidence without editing the bank snapshot', async t => {
  const f = await fixture(t), before = JSON.stringify(f.snapshot)
  await fs.writeFile(path.join(f.questionImageRoot, 'verified/associations.json'), JSON.stringify({ version: 1, associations: [{ ...f.association, displayMode: 'source-image' }] }))
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.equal(result.evidence.questions[0].proofs[0].displayMode, 'source-image')
  assert.equal(result.evidence.questions[0].proofs[0].sourcePdfSha256, f.association.sourcePdfSha256)
  assert.equal(JSON.stringify(f.snapshot), before)
})
test('exact associated local references in stem, options and explanation are allowed without substring normalization', async t => {
  const f = await fixture(t), ref = `![chart](题目_images/${f.asset})`
  f.row.stem += '\n' + ref; f.row.options[0] += ' ' + ref; f.row.explanation += ref
  replaceBank(f, { q1: f.row }); f.association.stemSha256 = sha(f.row.stem)
  await fs.writeFile(path.join(f.questionImageRoot, 'verified/associations.json'), JSON.stringify({ version: 1, associations: [f.association] }))
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.equal(result.summary.counts.unavailableReferences, 0)
  assert.equal(result.summary.counts.assets, 1)
})
for (const target of ['题目_images/verified/unassociated.png', 'https://example.invalid/chart.png', 'C:/private/题目_images/verified/chart.png', '../题目_images/verified/chart.png', '题目_images/verified/../chart.png', '题目_images/verified/%2e%2e%2fchart.png', '/题目_images/verified/chart.png']) test('unassociated or unsupported reference stays unavailable: ' + target, async t => {
  const f = await fixture(t)
  f.row.explanation = `![unproven](${target})`; replaceBank(f, { q1: f.row })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.equal(result.summary.counts.assets, 1, 'only the independent indexed stem supplement remains accessible')
  assert.equal(result.summary.counts.unavailableReferences, 1)
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: target }), { code: 'BANK_IMAGE_NOT_PROVEN' })
})
test('same file under the root cannot be read for an unassociated question or an arbitrary asset name', async t => {
  const f = await fixture(t)
  replaceBank(f, { q1: f.row, q2: { ...f.row } })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q2', asset: f.asset }), { code: 'BANK_IMAGE_NOT_PROVEN' })
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: 'verified/associations.json' }), { code: 'BANK_IMAGE_NOT_PROVEN' })
})
test('changed question stem cannot reuse a previous manual association', async t => {
  const f = await fixture(t)
  f.row.stem += ' edited'; replaceBank(f, { q1: f.row })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.equal(result.summary.counts.verifiedRecords, 0)
})
for (const [label, mutate] of [
  ['duplicate identity', index => index.associations.push(index.associations[0])],
  ['unknown version', index => { index.version = 99 }],
  ['path traversal', index => { index.associations[0].asset = 'verified/../chart.png' }],
  ['extra property', index => { index.associations[0].answer = 'unapproved' }],
]) test(label + ' index blocks proof instead of guessing', async t => {
  const f = await fixture(t), index = { version: 1, associations: [f.association] }
  mutate(index); await fs.writeFile(path.join(f.questionImageRoot, 'verified/associations.json'), JSON.stringify(index))
  await assert.rejects(inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot }), { code: 'BANK_IMAGE_INDEX_INVALID' })
})
test('missing overlay indices preserve exact original embedded references without wildcard root access', async t => {
  const f = await fixture(t)
  await fs.unlink(path.join(f.questionImageRoot, 'verified/associations.json'))
  f.row.explanation = `![chart](题目_images/${f.asset})`; replaceBank(f, { q1: f.row })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.equal(result.summary.counts.assets, 1)
  assert.equal(result.summary.counts.embeddedReferences, 1)
  assert.equal(result.summary.counts.overlayReferences, 0)
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: f.asset }), { code: 'BANK_IMAGE_BINDING_NOT_PROVEN' })
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: 'verified/arbitrary.png' }), { code: 'BANK_IMAGE_NOT_PROVEN' })
})
for (const [label, mutate] of [
  ['image bytes', async f => fs.writeFile(path.join(f.questionImageRoot, f.asset), 'changed')],
  ['association bytes', async f => fs.appendFile(path.join(f.questionImageRoot, 'verified/associations.json'), '\n')],
  ['missing index appears', async f => optionIndex(f)],
  ['root identity', async f => { const target = path.join(f.root, 'old-images'); assert.equal(path.dirname(target), f.root); assert.equal(path.dirname(f.questionImageRoot), f.root); await fs.rename(f.questionImageRoot, target); await fs.mkdir(f.questionImageRoot) }],
]) test(label + ' mutation invalidates an old proof and asset read', async t => {
  const f = await fixture(t), { evidence } = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  await mutate(f)
  await assert.rejects(revalidateLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, evidence }), { code: 'BANK_IMAGE_EVIDENCE_CHANGED' })
  await assert.rejects(readLegacyBankImageAsset({ evidence, questionId: 'q1', asset: f.asset, bindingKey: evidence.questions[0].assets[0].bindings[0].bindingKey }), { code: 'BANK_IMAGE_EVIDENCE_CHANGED' })
})
test('fresh snapshot changes to options, explanations or answers invalidate the previous record proof', async t => {
  const f = await fixture(t), { evidence } = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  for (const row of [{ ...f.row, options: ['A. changed', 'B. second'] }, { ...f.row, explanation: 'changed' }, { ...f.row, correctAnswer: 'A' }]) {
    replaceBank(f, { q1: row })
    await assert.rejects(revalidateLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, evidence }), { code: 'BANK_IMAGE_EVIDENCE_CHANGED' })
  }
})
test('snapshot and evidence tampering are rejected', async t => {
  const f = await fixture(t), { evidence } = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  evidence.questions[0].questionId = 'different'
  await assert.rejects(readLegacyBankImageAsset({ evidence, questionId: 'different', asset: f.asset }), { code: 'INVALID_BANK_IMAGE_EVIDENCE' })
  f.snapshot.files.find(row => row.name === 'kaogong_bank').bytesBase64 = Buffer.from('{}').toString('base64')
  await assert.rejects(inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot }), { code: 'INVALID_INSPECTION_SNAPSHOT' })
})
test('an index directory junction outside the explicit root is blocked before any outside bytes are read', async t => {
  const f = await fixture(t), source = path.join(f.questionImageRoot, 'verified'), outside = path.join(f.root, 'outside')
  assert.equal(path.dirname(outside), f.root); assert.ok(source.startsWith(f.root + path.sep))
  await fs.rename(source, outside); await fs.symlink(outside, source, process.platform === 'win32' ? 'junction' : 'dir')
  const reads = [], io = { ...fs, readFile: async target => { reads.push(target); return fs.readFile(target) } }
  await assert.rejects(inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, io }), { code: 'BANK_IMAGE_PATH_ESCAPE' })
  assert.equal(reads.length, 0)
})
test('private output rejects both source roots and directory aliases and never overwrites', async t => {
  const f = await fixture(t), alias = path.join(f.root, 'alias')
  await fs.symlink(f.questionImageRoot, alias, process.platform === 'win32' ? 'junction' : 'dir')
  for (const output of [path.join(alias, 'proof.json'), path.join(f.home, 'proof.json')]) await assert.rejects(writeLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, output }), { code: 'OUTPUT_IN_SOURCE' })
  const output = path.join(f.root, 'proof.private.json')
  const result = await writeLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, output })
  assert.equal(result.counts.assets, 1)
  await assert.rejects(writeLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, output }), { code: 'OUTPUT_EXISTS' })
})
test('concurrent image mutation blocks an inconsistent proof', async t => {
  const f = await fixture(t)
  let edited = false
  const io = { ...fs, readFile: async target => { const bytes = await fs.readFile(target); if (!edited && target.endsWith('chart.png')) { edited = true; await fs.writeFile(target, 'changed') } return bytes } }
  await assert.rejects(inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, io }), { code: 'BANK_IMAGE_EVIDENCE_CHANGED' })
})
test('an asset realpath escaping the root is unavailable without reading the outside file', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside.png'), reads = []
  await fs.writeFile(outside, 'outside-private-image')
  const io = { ...fs, realpath: async target => target.endsWith('chart.png') ? outside : fs.realpath(target), readFile: async target => { reads.push(target); return fs.readFile(target) } }
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, io })
  assert.equal(result.summary.counts.assets, 0)
  assert.ok(!reads.includes(outside))
})
test('an unchanged embedded original reference proves continuity without a manual overlay index', async t => {
  const f = await fixture(t)
  await fs.unlink(path.join(f.questionImageRoot, 'verified/associations.json'))
  f.row.options[0] += ` ![original](题目_images/${f.asset})`; replaceBank(f, { q1: f.row })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.equal(result.summary.counts.assets, 1)
  const binding = result.evidence.questions[0].assets[0].bindings[0]
  assert.equal(binding.provenance, 'legacy-embedded-reference')
  assert.equal(binding.field, 'options')
  assert.equal(binding.optionIndex, 0)
  assert.equal(binding.referenceSha256, sha(`题目_images/${f.asset}`))
  assert.deepEqual(await readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: f.asset, bindingKey: binding.bindingKey }), f.bytes)
})
test('an original absolute alias reference is preserved only while it resolves inside the explicit root', async t => {
  const f = await fixture(t), alias = path.join(f.root, 'old-images')
  await fs.symlink(f.questionImageRoot, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const target = path.join(alias, f.asset)
  f.row.explanation += ` ![original](${target})`; replaceBank(f, { q1: f.row })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  const asset = result.evidence.questions[0].assets.find(asset => asset.asset === f.asset)
  const binding = asset.bindings.find(binding => binding.provenance === 'legacy-embedded-reference')
  assert.equal(binding.reference, target)
  assert.equal(binding.referenceSha256, sha(target))
  assert.deepEqual(await readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: f.asset, bindingKey: binding.bindingKey }), f.bytes)
  await fs.unlink(alias)
  const outside = path.join(f.root, 'outside'); await fs.mkdir(path.join(outside, 'verified'), { recursive: true }); await fs.writeFile(path.join(outside, f.asset), 'outside')
  await fs.symlink(outside, alias, process.platform === 'win32' ? 'junction' : 'dir')
  const reads = [], io = { ...fs, readFile: async target => { reads.push(target); return fs.readFile(target) } }
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: f.asset, bindingKey: binding.bindingKey, io }), { code: 'BANK_IMAGE_EVIDENCE_CHANGED' })
  assert.ok(reads.every(target => !target.startsWith(outside)))
})
test('embedded local images need no verified prefix and still cannot expose an unreferenced sibling', async t => {
  const f = await fixture(t), asset = 'original/chart.png'
  await fs.mkdir(path.join(f.questionImageRoot, 'original'))
  await fs.writeFile(path.join(f.questionImageRoot, asset), f.bytes)
  await fs.writeFile(path.join(f.questionImageRoot, 'original/sibling.png'), 'private-sibling')
  await fs.unlink(path.join(f.questionImageRoot, 'verified/associations.json'))
  f.row.explanation = `![original](题目_images/${asset})`; replaceBank(f, { q1: f.row })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot })
  assert.equal(result.summary.counts.embeddedReferences, 1)
  const proof = result.evidence.questions[0].assets[0]
  assert.equal(proof.asset, asset)
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: 'original/sibling.png', bindingKey: proof.bindings[0].bindingKey }), { code: 'BANK_IMAGE_NOT_PROVEN' })
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset, bindingKey: 'different-field-reference' }), { code: 'BANK_IMAGE_BINDING_NOT_PROVEN' })
})
test('original absolute references outside the image root are never read', async t => {
  const f = await fixture(t), outside = path.join(f.root, 'outside.png'), reads = []
  await fs.writeFile(outside, 'outside-private-file')
  f.row.explanation = `![outside](${outside})`; replaceBank(f, { q1: f.row })
  const io = { ...fs, readFile: async target => { reads.push(target); return fs.readFile(target) } }
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, io })
  assert.equal(result.summary.counts.embeddedReferences, 0)
  assert.equal(result.summary.counts.unavailableReferences, 1)
  assert.ok(!reads.includes(outside))
})
async function documentFixture(f) {
  const mineruRoot = path.join(f.root, 'mineru'), jobId = '12345678-1234-1234-1234-123456789012', asset = 'images/chart.png'
  await fs.mkdir(path.join(mineruRoot, jobId, 'assets/images'), { recursive: true })
  await fs.writeFile(path.join(mineruRoot, jobId, 'assets', asset), 'controlled-document-image')
  const source = path.join(f.root, 'original.pdf')
  const doc = { file: source, fingerprint: sha('declared-source'), pages: 1, subject: 'subject', kind: '其他', jobs: [{ id: jobId, pages: '1-1', state: 'done' }] }
  await fs.writeFile(path.join(mineruRoot, 'rebuild-manifest.json'), JSON.stringify({ version: 1, documents: [doc] }))
  await fs.writeFile(path.join(mineruRoot, jobId, 'job.json'), JSON.stringify({ id: jobId, source, subject: 'subject', title: 'original.pdf', pages: '1-1' }))
  const reference = `/api/kaogong/document-image?id=${jobId}&asset=images%2Fchart.png`
  f.row.explanation = `![original parsed diagram](${reference})`; replaceBank(f, { q1: f.row })
  return { mineruRoot, jobId, asset, reference, doc }
}
test('original bank document-image references use their own bank field proof and explicit MinerU root', async t => {
  const f = await fixture(t), d = await documentFixture(f)
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, mineruRoot: d.mineruRoot })
  assert.equal(result.summary.counts.documentReferences, 1)
  const asset = result.evidence.questions[0].assets.find(asset => asset.rootKind === 'mineru-document')
  assert.equal(asset.jobId, d.jobId)
  assert.equal(asset.documentAsset, d.asset)
  assert.equal(asset.bindings[0].provenance, 'legacy-embedded-document-reference')
  assert.equal(asset.bindings[0].reference, d.reference)
  assert.equal((await readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: asset.asset, bindingKey: asset.bindings[0].bindingKey })).toString(), 'controlled-document-image')
})
for (const [label, mutate] of [
  ['job source mismatch', async (f, d) => fs.writeFile(path.join(d.mineruRoot, d.jobId, 'job.json'), JSON.stringify({ id: d.jobId, source: 'different', pages: '1-1', subject: 'subject', title: 'original.pdf' }))],
  ['duplicate job mapping', async (f, d) => fs.writeFile(path.join(d.mineruRoot, 'rebuild-manifest.json'), JSON.stringify({ version: 1, documents: [d.doc, d.doc] }))],
  ['unknown job', async (f, d) => { f.row.explanation = f.row.explanation.replace(d.jobId, '87654321-1234-1234-1234-123456789012'); replaceBank(f, { q1: f.row }) }],
  ['path traversal query', async (f, d) => { f.row.explanation = `![bad](/api/kaogong/document-image?id=${d.jobId}&asset=..%2Foutside.png)`; replaceBank(f, { q1: f.row }) }],
  ['duplicate query key', async (f, d) => { f.row.explanation = `![bad](${d.reference}&id=${d.jobId})`; replaceBank(f, { q1: f.row }) }],
]) test('document reference ' + label + ' is unavailable without arbitrary fallback', async t => {
  const f = await fixture(t), d = await documentFixture(f)
  await mutate(f, d)
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, mineruRoot: d.mineruRoot })
  assert.equal(result.summary.counts.documentReferences, 0)
  assert.equal(result.summary.counts.unavailableReferences, 1)
})
test('document assets remain bound to the original bank row and reference, not private knowledge grants', async t => {
  const f = await fixture(t), d = await documentFixture(f)
  replaceBank(f, { q1: f.row, q2: { ...f.row, explanation: 'no image reference' } })
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, mineruRoot: d.mineruRoot })
  const asset = result.evidence.questions[0].assets.find(row => row.rootKind === 'mineru-document')
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q2', asset: asset.asset, bindingKey: asset.bindings[0].bindingKey }), { code: 'BANK_IMAGE_NOT_PROVEN' })
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: asset.asset, bindingKey: 'private-knowledge-grant' }), { code: 'BANK_IMAGE_BINDING_NOT_PROVEN' })
  await assert.rejects(writeLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, mineruRoot: d.mineruRoot, output: path.join(d.mineruRoot, 'proof.json') }), { code: 'OUTPUT_IN_SOURCE' })
})
test('document manifest or asset mutation invalidates the old bank proof', async t => {
  const f = await fixture(t), d = await documentFixture(f)
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, mineruRoot: d.mineruRoot })
  const asset = result.evidence.questions[0].assets.find(row => row.rootKind === 'mineru-document')
  await fs.writeFile(path.join(d.mineruRoot, d.jobId, 'assets', d.asset), 'changed')
  await assert.rejects(readLegacyBankImageAsset({ evidence: result.evidence, questionId: 'q1', asset: asset.asset, bindingKey: asset.bindings[0].bindingKey }), { code: 'BANK_IMAGE_EVIDENCE_CHANGED' })
  await assert.rejects(revalidateLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, mineruRoot: d.mineruRoot, evidence: result.evidence }), { code: 'BANK_IMAGE_EVIDENCE_CHANGED' })
})
test('cross-job asset directory links are rejected before their bytes are read', async t => {
  const f = await fixture(t), d = await documentFixture(f), original = path.join(d.mineruRoot, d.jobId, 'assets'), otherJob = path.join(d.mineruRoot, '87654321-1234-1234-1234-123456789012')
  assert.ok(original.startsWith(f.root + path.sep)); assert.ok(otherJob.startsWith(f.root + path.sep))
  await fs.mkdir(otherJob); await fs.rename(original, path.join(otherJob, 'assets')); await fs.symlink(path.join(otherJob, 'assets'), original, process.platform === 'win32' ? 'junction' : 'dir')
  const reads = [], io = { ...fs, readFile: async target => { reads.push(target); return fs.readFile(target) } }
  const result = await inspectLegacyBankImageEvidence({ snapshot: f.snapshot, questionImageRoot: f.questionImageRoot, mineruRoot: d.mineruRoot, io })
  assert.equal(result.summary.counts.documentReferences, 0)
  assert.ok(reads.every(target => !target.startsWith(otherJob)))
})
