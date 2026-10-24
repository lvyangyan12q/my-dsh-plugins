import {inspectionTable} from './legacy-inspection-envelope.mjs'
/** Offline evidence only. No plugin startup, collection, repair, configuration or network access. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)) }
const canonical = value => JSON.stringify(value, function (_key, item) { return object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item })
const digest = value => sha(canonical(value))
function fail(code) { throw Object.assign(new Error(code), { code }) }
function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$|[:%\x00-\x1f]/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail('UNSAFE_MATERIAL_PATH')
  return value
}
function safeAbsolute(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) fail('UNSAFE_MATERIAL_PATH')
  return path.resolve(value)
}
async function rootFacts(materialRoot, io) {
  const requested = safeAbsolute(materialRoot)
  try {
    const root = await io.realpath(requested), stat = await io.stat(root)
    if (!stat.isDirectory()) fail('MATERIAL_ROOT_UNAVAILABLE')
    return { requestedMaterialRoot: requested, materialRoot: root, rootIdentity: `${stat.dev}:${stat.ino}` }
  } catch { fail('MATERIAL_ROOT_UNAVAILABLE') }
}
async function materialFile(root, relativePath, io) {
  safeRelative(relativePath)
  const target = path.resolve(root, relativePath)
  if (!inside(root, target)) fail('UNSAFE_MATERIAL_PATH')
  try {
    const resolvedPath = await io.realpath(target)
    if (!inside(root, resolvedPath)) fail('UNSAFE_MATERIAL_PATH')
    const stat = await io.stat(resolvedPath)
    if (!stat.isFile()) fail('MATERIAL_FILE_UNAVAILABLE')
    const bytes = await io.readFile(resolvedPath)
    if (await io.realpath(target) !== resolvedPath) fail('MATERIAL_SOURCE_CHANGED')
    return { bytes, receipt: { relativePath, resolvedPath, sha256: sha(bytes) } }
  } catch (error) {
    if (['UNSAFE_MATERIAL_PATH', 'MATERIAL_SOURCE_CHANGED'].includes(error.code)) throw error
    fail('MATERIAL_FILE_UNAVAILABLE')
  }
}
function json(bytes) { try { return JSON.parse(bytes.toString('utf8')) } catch { fail('MATERIAL_FORMAT_UNSUPPORTED') } }
function snapshotEntries(snapshot) {
  const {data}=inspectionTable(snapshot,'kaogong_knowledge',json)
  if (data.unit?.name !== 'kaogong_knowledge' || data.unit.version !== 1 || !object(data.tables?.entries)) fail('INVALID_INSPECTION_SNAPSHOT')
  return data.tables.entries
}
function images(content, jobId) {
  if (/<\s*(img|picture|svg|object|embed|iframe|video|audio|source)\b/i.test(content)) fail('UNSUPPORTED_IMAGE_REFERENCE')
  const references = [...content.matchAll(/!\[[^\]\r\n]*\]\(([^)\r\n]+)\)/g)]
  if ((content.match(/!\[/g) ?? []).length !== references.length) fail('UNSUPPORTED_IMAGE_REFERENCE')
  const assets = []
  for (const [, raw] of references) {
    if (!raw.startsWith('/api/kaogong/document-image?')) fail('UNSUPPORTED_IMAGE_REFERENCE')
    let url
    try { url = new URL(raw, 'https://offline.invalid') } catch { fail('UNSUPPORTED_IMAGE_REFERENCE') }
    if (url.hash || url.pathname !== '/api/kaogong/document-image' || [...url.searchParams.keys()].sort().join(',') !== 'asset,id' || url.searchParams.get('id') !== jobId) fail('UNSUPPORTED_IMAGE_REFERENCE')
    const asset = safeRelative(url.searchParams.get('asset'))
    if (!/\.(png|jpe?g|webp|gif)$/i.test(asset)) fail('UNSUPPORTED_IMAGE_REFERENCE')
    assets.push(asset)
  }
  return assets
}
function withoutHash(evidence) { const { evidenceHash, ...body } = evidence; return body }
function validateEvidence(evidence) {
  if (!object(evidence) || evidence.format !== 'kaogong-legacy-material-evidence' || evidence.formatVersion !== 1 || !Array.isArray(evidence.entries) || !Array.isArray(evidence.sourceAliases) || !Array.isArray(evidence.files) || digest(withoutHash(evidence)) !== evidence.evidenceHash) fail('INVALID_MATERIAL_EVIDENCE')
}
async function verifyPinned(evidence, io, selectedPaths) {
  validateEvidence(evidence)
  const facts = await rootFacts(evidence.requestedMaterialRoot, io)
  if (facts.materialRoot !== evidence.materialRoot || facts.rootIdentity !== evidence.rootIdentity) fail('MATERIAL_EVIDENCE_CHANGED')
  for (const alias of evidence.sourceAliases) {
    let resolved
    try { resolved = await io.realpath(safeAbsolute(alias.declaredPath)) } catch { fail('MATERIAL_EVIDENCE_CHANGED') }
    if (!inside(evidence.materialRoot, resolved) || resolved !== alias.resolvedPath) fail('MATERIAL_EVIDENCE_CHANGED')
  }
  const files = selectedPaths ? evidence.files.filter(file => selectedPaths.has(file.relativePath)) : evidence.files
  if (selectedPaths && files.length !== selectedPaths.size) fail('INVALID_MATERIAL_EVIDENCE')
  for (const expected of files) {
    let actual
    try { actual = (await materialFile(evidence.materialRoot, expected.relativePath, io)).receipt } catch { fail('MATERIAL_EVIDENCE_CHANGED') }
    if (canonical(actual) !== canonical(expected)) fail('MATERIAL_EVIDENCE_CHANGED')
  }
  const after = await rootFacts(evidence.requestedMaterialRoot, io)
  if (canonical(after) !== canonical(facts)) fail('MATERIAL_EVIDENCE_CHANGED')
}

/** Positive proof is a library candidate only; it does not grant access or write any data. */
export async function inspectLegacyMaterialEvidence({ snapshot, materialRoot, io = fs } = {}) {
  const entries = snapshotEntries(snapshot), facts = await rootFacts(materialRoot, io)
  const receipts = new Map(), pdfFacts = new Map(), sourceAliases = new Map()
  const read = async relativePath => {
    const result = await materialFile(facts.materialRoot, relativePath, io), prior = receipts.get(relativePath)
    if (prior && canonical(prior) !== canonical(result.receipt)) fail('MATERIAL_SOURCE_CHANGED')
    receipts.set(relativePath, result.receipt)
    return result.bytes
  }
  const manifestRelativePath = 'storage/mineru/rebuild-manifest.json'
  const manifestBytes = await read(manifestRelativePath), manifest = json(manifestBytes)
  if (manifest.version !== 1 || !Array.isArray(manifest.documents)) fail('MATERIAL_FORMAT_UNSUPPORTED')
  const candidates = new Map()
  for (const doc of manifest.documents) {
    if (!object(doc) || !Array.isArray(doc.jobs)) fail('MATERIAL_FORMAT_UNSUPPORTED')
    for (const job of doc.jobs) {
      if (!object(job)) fail('MATERIAL_FORMAT_UNSUPPORTED')
      const id = `mineru_${doc.fingerprint}_${job.pages}`
      const list = candidates.get(id) ?? []
      list.push({ doc, job }); candidates.set(id, list)
    }
  }
  const verified = [], privateEntries = []
  for (const id of Object.keys(entries).sort()) {
    const entry = entries[id]
    if (entry?.kind === '笔记') { privateEntries.push({ id, reason: 'PRIVATE_NOTE' }); continue }
    try {
      if (!object(entry) || !/^mineru_[a-f0-9]{64}_\d+-\d+$/.test(id)) fail('UNSUPPORTED_SOURCE_RECORD')
      if (Object.keys(entry).sort().join(',') !== 'content,createdAt,kind,knowledgePoint,source,subject,tags,title,updatedAt' || typeof entry.createdAt !== 'string' || typeof entry.updatedAt !== 'string') fail('UNSUPPORTED_SOURCE_RECORD')
      const matches = candidates.get(id)
      if (matches?.length !== 1) fail('UNMATCHED_OR_AMBIGUOUS_SOURCE')
      const { doc, job } = matches[0]
      if (!/^[a-f0-9]{64}$/.test(doc.fingerprint) || !['讲义', '真题解析', '其他'].includes(doc.kind) || !/^[0-9a-f-]{36}$/.test(job.id) || job.state !== 'done' || !/^\d+-\d+$/.test(job.pages)) fail('UNSUPPORTED_SOURCE_RECORD')
      const [start, end] = job.pages.split('-').map(Number)
      if (!Number.isSafeInteger(doc.pages) || start < 1 || end < start || end > doc.pages) fail('UNSUPPORTED_SOURCE_RECORD')
      const declaredSource = safeAbsolute(doc.file)
      if (path.extname(declaredSource).toLowerCase() !== '.pdf') fail('UNSAFE_MATERIAL_PATH')
      // Historic declared paths may be directory aliases. Resolve metadata first, never read outside the explicit root.
      let source
      try { source = await io.realpath(declaredSource) } catch { fail('MATERIAL_FILE_UNAVAILABLE') }
      if (!inside(facts.materialRoot, source)) fail('UNSAFE_MATERIAL_PATH')
      const priorAlias = sourceAliases.get(declaredSource)
      if (priorAlias && priorAlias.resolvedPath !== source) fail('MATERIAL_SOURCE_CHANGED')
      sourceAliases.set(declaredSource, { declaredPath: declaredSource, resolvedPath: source })
      const pdfRelativePath = path.relative(facts.materialRoot, source).split(path.sep).join('/')
      if (entry.title !== path.basename(doc.file) + ' [PDF ' + job.pages + ']' || entry.source !== doc.file + '#pages=' + job.pages || entry.subject !== doc.subject || entry.kind !== doc.kind || entry.knowledgePoint !== '' || canonical(entry.tags) !== canonical(['MinerU', '待校对', 'mineru-job:' + job.id])) fail('SOURCE_RECORD_EDITED')
      if (!pdfFacts.has(pdfRelativePath)) {
        const bytes = await read(pdfRelativePath)
        if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) fail('SOURCE_PDF_MISMATCH')
        pdfFacts.set(pdfRelativePath, sha(bytes))
      }
      if (pdfFacts.get(pdfRelativePath) !== doc.fingerprint) fail('SOURCE_PDF_MISMATCH')
      const jobRelativePath = `storage/mineru/${job.id}/job.json`, knowledgeRelativePath = `storage/mineru/${job.id}/knowledge.md`
      const storedJob = json(await read(jobRelativePath))
      if (storedJob.id !== job.id || storedJob.source !== doc.file || storedJob.pages !== job.pages || storedJob.subject !== doc.subject || storedJob.title !== path.basename(doc.file)) fail('SOURCE_JOB_MISMATCH')
      const contentBytes = await read(knowledgeRelativePath), content = contentBytes.toString('utf8')
      if (!Buffer.from(content, 'utf8').equals(contentBytes)) fail('MATERIAL_FORMAT_UNSUPPORTED')
      if (!content.trim() || content !== entry.content || (job.characters !== undefined && job.characters !== content.length)) fail('SOURCE_CONTENT_MISMATCH')
      const referenced = images(content, job.id)
      if (job.images !== undefined && job.images !== referenced.length) fail('SOURCE_IMAGE_MISMATCH')
      const assets = []
      for (const asset of [...new Set(referenced)].sort()) {
        const relativePath = `storage/mineru/${job.id}/assets/${asset}`, bytes = await read(relativePath)
        assets.push({ asset, relativePath, sha256: sha(bytes) })
      }
      verified.push({ id, jobId: job.id, sourceContentSha256: sha(contentBytes), sourcePdfSha256: doc.fingerprint, sourcePdfRelativePath: pdfRelativePath, knowledgeRelativePath, jobRelativePath, assets })
    } catch (error) {
      if (error.code === 'MATERIAL_SOURCE_CHANGED') throw error
      privateEntries.push({ id, reason: error.code ?? 'UNVERIFIED_SOURCE' })
    }
  }
  const body = { format: 'kaogong-legacy-material-evidence', formatVersion: 1, ...facts, sourceRevision: snapshot.sourceRevision, snapshotHash: digest(snapshot), manifestRelativePath, manifestSha256: sha(manifestBytes), entries: verified, privateEntries, sourceAliases: [...sourceAliases.values()].sort((a, b) => a.declaredPath < b.declaredPath ? -1 : a.declaredPath > b.declaredPath ? 1 : 0), files: [...receipts.values()].sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0) }
  const evidence = { ...body, evidenceHash: digest(body) }
  await verifyPinned(evidence, io)
  return { evidence, summary: { formatVersion: 1, status: 'readonly-material-evidence', counts: { verified: verified.length, private: privateEntries.length, assets: verified.reduce((n, entry) => n + entry.assets.length, 0) }, evidenceHash: evidence.evidenceHash, manifestSha256: evidence.manifestSha256 } }
}

/** Recompute immediately before a separately confirmed migration. No apply is performed here. */
export async function revalidateLegacyMaterialEvidence({ snapshot, materialRoot, evidence, io = fs } = {}) {
  await verifyPinned(evidence, io)
  const next = await inspectLegacyMaterialEvidence({ snapshot, materialRoot, io })
  if (next.evidence.evidenceHash !== evidence.evidenceHash) fail('MATERIAL_EVIDENCE_CHANGED')
  return next.evidence
}

/** Caller must authorize the instance/resource first. No arbitrary path or fallback is accepted. */
export async function readLegacyMaterialAsset({ evidence, entryId, asset, io = fs } = {}) {
  validateEvidence(evidence)
  const entry = evidence.entries.find(row => row.id === entryId), allowed = entry?.assets.find(row => row.asset === asset)
  if (!allowed) fail('MATERIAL_ASSET_NOT_PROVEN')
  // An image request rechecks its own proven source, not every unrelated PDF and image in the library.
  await verifyPinned(evidence, io, new Set([evidence.manifestRelativePath, entry.sourcePdfRelativePath, entry.jobRelativePath, entry.knowledgeRelativePath, allowed.relativePath]))
  const result = await materialFile(evidence.materialRoot, allowed.relativePath, io)
  if (result.receipt.sha256 !== allowed.sha256) fail('MATERIAL_EVIDENCE_CHANGED')
  return result.bytes
}

/** Optional private receipt: explicit new file only, outside both source roots. */
export async function writeLegacyMaterialEvidence({ snapshot, materialRoot, output, io = fs } = {}) {
  if (typeof output !== 'string' || !path.isAbsolute(output)) fail('EXPLICIT_ABSOLUTE_OUTPUT_REQUIRED')
  const facts = await rootFacts(materialRoot, io)
  let target, sourceHome
  try {
    target = path.join(await io.realpath(path.dirname(output)), path.basename(output))
    sourceHome = await io.realpath(safeAbsolute(snapshot?.sourceHome))
  } catch { fail('OUTPUT_PARENT_OR_SOURCE_UNAVAILABLE') }
  if (inside(facts.materialRoot, target) || inside(sourceHome, target)) fail('OUTPUT_IN_SOURCE')
  const { evidence, summary } = await inspectLegacyMaterialEvidence({ snapshot, materialRoot, io })
  try { await io.writeFile(target, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 }) }
  catch (error) { fail(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_WRITE_FAILED') }
  return summary
}
