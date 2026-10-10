import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm, rmdir, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { loadVerifiedPracticeMaterials, loadVerifiedPracticeOptions } from '../src/verified-practice-materials.ts'
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'verified-material-associations-'))
  await mkdir(join(root, 'verified'))
  const image = Buffer.from('existing-image-bytes'), stem = '原题正文 [图：原始图示占位]'
  await writeFile(join(root, 'verified', 'diagram.jpg'), image)
  const row = { questionId: 'q1', stemSha256: sha(stem), asset: 'verified/diagram.jpg', assetSha256: sha(image), sourcePdfSha256: sha('source-pdf'), sourcePage: 83 }
  const save = rows => writeFile(join(root, 'verified', 'associations.json'), JSON.stringify({ version: 1, associations: rows }))
  await save([row])
  return { root, row, stem, save, close: async () => { assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }) } }
}
test('verified supplements require exact original identity/content and keep original text intact', async () => {
  const f = await fixture()
  try {
    const material = await loadVerifiedPracticeMaterials(f.root)
    const result = material('q1', f.stem)
    assert.ok(result.startsWith(f.stem))
    assert.match(result, /PDF 第 83 页.*题目_images\/verified\/diagram.jpg/)
    assert.equal(material('different-question', f.stem), f.stem)
    assert.equal(material('q1', '原题已编辑'), '原题已编辑')
    assert.equal((await loadVerifiedPracticeMaterials())('q1', f.stem), f.stem)
  } finally { await f.close() }
})
test('changed image bytes and duplicate identities reject the index instead of guessing', async () => {
  const f = await fixture()
  try {
    await writeFile(join(f.root, 'verified', 'diagram.jpg'), 'changed')
    await assert.rejects(loadVerifiedPracticeMaterials(f.root), /image changed/)
    await f.save([f.row, f.row])
    await writeFile(join(f.root, 'verified', 'diagram.jpg'), 'existing-image-bytes')
    await assert.rejects(loadVerifiedPracticeMaterials(f.root), /Duplicate/)
  } finally { await f.close() }
})
test('traversal and directory links outside the configured material root are refused', async () => {
  const f = await fixture(), outside = await mkdtemp(join(tmpdir(), 'verified-material-outside-'))
  let linked = false
  try {
    await f.save([{ ...f.row, asset: 'verified/../outside.jpg' }])
    await assert.rejects(loadVerifiedPracticeMaterials(f.root))
    await writeFile(join(outside, 'associations.json'), JSON.stringify({ version: 1, associations: [f.row] }))
    await writeFile(join(outside, 'diagram.jpg'), 'existing-image-bytes')
    await unlink(join(f.root, 'verified', 'associations.json'))
    await unlink(join(f.root, 'verified', 'diagram.jpg'))
    await rmdir(join(f.root, 'verified'))
    await symlink(outside, join(f.root, 'verified'), 'junction'); linked = true
    await assert.rejects(loadVerifiedPracticeMaterials(f.root), /escapes configured root/)
  } finally {
    if (linked) await unlink(join(f.root, 'verified'))
    await f.close()
    assert.equal(dirname(outside), resolve(tmpdir())); await rm(outside, { recursive: true, force: true })
  }
})


test('option footer proofs remain scoped to exact question content and reject ambiguous repair indices', async () => {
  const root = await mkdtemp(join(tmpdir(), 'verified-options-'))
  const stem = 'Original question', options = ['A. first', 'B. second\n公考最新资料、更新进度微信 SKA674']
  const row = { questionId: 'q1', stemSha256: sha(stem), optionsSha256: sha(JSON.stringify(options)), optionIndices: [1], sourcePdfSha256: sha('source-pdf'), sourcePage: 29 }
  const save = associations => writeFile(join(root, 'verified', 'option-repairs.json'), JSON.stringify({ version: 1, associations }))
  try {
    await mkdir(join(root, 'verified'))
    assert.deepEqual((await loadVerifiedPracticeOptions(root))('q1', stem, options), options)
    await save([row]); const repair = await loadVerifiedPracticeOptions(root)
    assert.deepEqual(repair('q1', stem, options), ['A. first', 'B. second'])
    assert.deepEqual(options, ['A. first', 'B. second\n公考最新资料、更新进度微信 SKA674'])
    assert.deepEqual(repair('other', stem, options), options)
    assert.deepEqual(repair('q1', stem + ' changed', options), options)
    const revised = [options[0], options[1] + '\nnext question']; assert.deepEqual(repair('q1', stem, revised), revised)
    await save([{ ...row, optionsSha256: sha(JSON.stringify(revised)) }]); assert.deepEqual((await loadVerifiedPracticeOptions(root))('q1', stem, revised), revised, 'proof cannot authorize removal of unknown trailing text')
    await save([row, row]); await assert.rejects(loadVerifiedPracticeOptions(root), /Duplicate/)
    await save([{ ...row, optionIndices: [1, 1] }]); await assert.rejects(loadVerifiedPracticeOptions(root), /Duplicate/)
  } finally { assert.equal(dirname(root), resolve(tmpdir())); await rm(root, { recursive: true, force: true }) }
})
