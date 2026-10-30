import {inspectionTable} from './legacy-inspection-envelope.mjs'
/** Offline bank-image associations only. Never repairs questions, answers, options or source files. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseLegacyDocumentReference, resolveLegacyDocumentPath } from './legacy-document-paths.mjs'

const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const canonical = value => JSON.stringify(value, (_key, item) => object(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)
const digest = value => sha(canonical(value))
const inside = (root, target) => { const rel = path.relative(root, target); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + path.sep)) }
const assetPattern = /^verified\/[\p{L}\p{N}_-]+\.(?:png|jpg|jpeg|webp)$/iu
const hashPattern = /^[a-f0-9]{64}$/
const indices = ['verified/associations.json', 'verified/option-repairs.json']
function fail(code) { throw Object.assign(new Error(code), { code }) }
function absolute(value) { if (typeof value !== 'string' || !path.isAbsolute(value) || value.startsWith('\\\\') || value.startsWith('//') || value.split(/[\\/]/).includes('..')) fail('EXPLICIT_ABSOLUTE_IMAGE_ROOT_REQUIRED'); return path.resolve(value) }
function imageAsset(value) { return typeof value === 'string' && value.length < 2000 && !value.includes('\\') && /\.(png|jpe?g|webp|gif)$/i.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$|[:?#%\x00-\x1f]/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) }
async function rootFacts(questionImageRoot, io) {
  const requestedQuestionImageRoot = absolute(questionImageRoot)
  try { const questionImageRoot = await io.realpath(requestedQuestionImageRoot), stat = await io.stat(questionImageRoot); if (!stat.isDirectory()) fail('IMAGE_ROOT_UNAVAILABLE'); return { requestedQuestionImageRoot, questionImageRoot, rootIdentity: `${stat.dev}:${stat.ino}` } } catch { fail('IMAGE_ROOT_UNAVAILABLE') }
}
async function file(root, relativePath, io, index = false) {
  if (!(indices.includes(relativePath) || imageAsset(relativePath))) fail('UNPROVEN_BANK_IMAGE_PATH')
  try {
    const requested = path.resolve(root, relativePath), resolvedPath = await io.realpath(requested)
    if (!inside(root, resolvedPath)) fail('BANK_IMAGE_PATH_ESCAPE')
    const stat = await io.stat(resolvedPath)
    if (!stat.isFile() || (index && stat.size > 1_000_000)) fail('BANK_IMAGE_FILE_UNAVAILABLE')
    const bytes = await io.readFile(resolvedPath)
    if ((index && bytes.length > 1_000_000) || await io.realpath(requested) !== resolvedPath) fail('BANK_IMAGE_SOURCE_CHANGED')
    return { bytes, receipt: { relativePath, resolvedPath, sha256: sha(bytes) } }
  } catch (error) { if (index && error.code === 'ENOENT') return null; if (['BANK_IMAGE_PATH_ESCAPE', 'BANK_IMAGE_SOURCE_CHANGED'].includes(error.code)) throw error; fail('BANK_IMAGE_FILE_UNAVAILABLE') }
}
function bankFrom(snapshot) {
  const {data,file}=inspectionTable(snapshot,'kaogong_bank',bytes=>{try{return JSON.parse(bytes.toString('utf8'))}catch{fail('INVALID_INSPECTION_SNAPSHOT')}})
  if (data.unit?.name !== 'kaogong_bank' || data.unit.version !== 2 || !object(data.tables?.questions)) fail('INVALID_INSPECTION_SNAPSHOT')
  return { records: data.tables.questions, bankSnapshotSha256: file.sha256 }
}
function exactKeys(row, required, optional = []) { return object(row) && required.every(key => Object.hasOwn(row, key)) && Object.keys(row).every(key => required.includes(key) || optional.includes(key)) }
function parsedIndex(bytes, options) {
  let data
  try { data = JSON.parse(bytes.toString('utf8')) } catch { fail('BANK_IMAGE_INDEX_INVALID') }
  if (!exactKeys(data, ['version', 'associations']) || data.version !== 1 || !Array.isArray(data.associations) || data.associations.length > 5000) fail('BANK_IMAGE_INDEX_INVALID')
  const result = new Map()
  for (const row of data.associations) {
    const common = ['questionId', 'stemSha256', 'sourcePdfSha256', 'sourcePage']
    if (!exactKeys(row, [...common, ...(options ? ['optionsSha256', 'optionIndices'] : ['asset', 'assetSha256'])], options ? ['sourceAssets', 'sourceOptions'] : ['displayMode']) || typeof row.questionId !== 'string' || !row.questionId.length || row.questionId.length > 200 || result.has(row.questionId) || !hashPattern.test(row.stemSha256) || !hashPattern.test(row.sourcePdfSha256) || !Number.isSafeInteger(row.sourcePage) || row.sourcePage < 1) fail('BANK_IMAGE_INDEX_INVALID')
    if (!options) {
      if (!assetPattern.test(row.asset) || !hashPattern.test(row.assetSha256) || (row.displayMode !== undefined && !['supplement', 'source-image'].includes(row.displayMode))) fail('BANK_IMAGE_INDEX_INVALID')
    } else {
      if (!hashPattern.test(row.optionsSha256) || !Array.isArray(row.optionIndices) || !row.optionIndices.length || row.optionIndices.length > 26 || row.optionIndices.some(index => !Number.isSafeInteger(index) || index < 0 || index > 25) || new Set(row.optionIndices).size !== row.optionIndices.length) fail('BANK_IMAGE_INDEX_INVALID')
      if (row.sourceAssets !== undefined && (!Array.isArray(row.sourceAssets) || row.sourceAssets.length > 26 || row.sourceAssets.some(asset => !exactKeys(asset, ['asset', 'assetSha256']) || !assetPattern.test(asset.asset) || !hashPattern.test(asset.assetSha256)) || new Set(row.sourceAssets.map(asset => asset.asset)).size !== row.sourceAssets.length)) fail('BANK_IMAGE_INDEX_INVALID')
      if (row.sourceOptions !== undefined && (!Array.isArray(row.sourceOptions) || !row.sourceOptions.length || row.sourceOptions.length > 26 || row.sourceOptions.some(option => typeof option !== 'string' || !option.length || option.length > 10000 || /答案|解析|批注|SKA674/.test(option)))) fail('BANK_IMAGE_INDEX_INVALID')
    }
    result.set(row.questionId, row)
  }
  return result
}
function references(text) {
  const matches = [...text.matchAll(/!\[[^\]\r\n]*\]\(([^)\r\n]+)\)/g)]
  const unsupported = /<\s*(img|picture|svg|object|embed|iframe)\b/i.test(text) || (text.match(/!\[/g) ?? []).length !== matches.length
  return { targets: matches.map(match => match[1]), unsupported }
}
function localAsset(target) { const prefix = '题目_images/'; return typeof target === 'string' && target.startsWith(prefix) && assetPattern.test(target.slice(prefix.length)) ? target.slice(prefix.length) : null }
async function embeddedAsset(target, root, io) {
  let declaredPath
  if (target.startsWith('题目_images/') || target.startsWith('题目_images\\')) {
    const asset = target.slice('题目_images/'.length).replaceAll('\\', '/')
    if (!imageAsset(asset)) fail('UNSUPPORTED_IMAGE_REFERENCE')
    declaredPath = path.resolve(root, asset)
  } else if (imageAsset(target)) {
    // Exact original root-relative references use the same explicitly configured owner root.
    declaredPath = path.resolve(root, target)
  } else {
    if (!path.isAbsolute(target) || (process.platform === 'win32' && !/^[A-Za-z]:[\\/]/.test(target))) fail('UNSUPPORTED_IMAGE_REFERENCE')
    declaredPath = absolute(target)
  }
  let resolvedPath
  try { resolvedPath = await io.realpath(declaredPath) } catch { fail('BANK_IMAGE_FILE_UNAVAILABLE') }
  if (!inside(root, resolvedPath)) fail('BANK_IMAGE_PATH_ESCAPE')
  const asset = path.relative(root, resolvedPath).split(path.sep).join('/')
  if (!imageAsset(asset)) fail('UNSUPPORTED_IMAGE_REFERENCE')
  return { asset, declaredPath, resolvedPath }
}
async function documentFile(root, relativePath, io) {
  let resolvedPath
  if (relativePath === 'rebuild-manifest.json') {
    resolvedPath = await io.realpath(path.resolve(root, relativePath))
    if (!inside(root, resolvedPath)) fail('BANK_IMAGE_PATH_ESCAPE')
  } else {
    const match = /^([0-9a-f-]{36})\/(job\.json|assets\/(.+))$/.exec(relativePath)
    if (!match) fail('UNPROVEN_BANK_IMAGE_PATH')
    resolvedPath = (await resolveLegacyDocumentPath({ root, jobId: match[1], kind: match[2] === 'job.json' ? 'job' : 'asset', asset: match[3], io })).resolvedPath
  }
  const stat = await io.stat(resolvedPath)
  if (!stat.isFile() || ((relativePath.endsWith('.json')) && stat.size > 1_000_000)) fail('BANK_DOCUMENT_FILE_UNAVAILABLE')
  const bytes = await io.readFile(resolvedPath)
  if (await io.realpath(path.resolve(root, relativePath)) !== resolvedPath) fail('BANK_IMAGE_SOURCE_CHANGED')
  return { bytes, receipt: { relativePath, resolvedPath, sha256: sha(bytes) } }
}
function evidenceBody(evidence) { const { evidenceHash, ...body } = evidence; return body }
function validEvidence(evidence) { if (!object(evidence) || evidence.format !== 'kaogong-legacy-bank-image-evidence' || evidence.formatVersion !== 1 || !Array.isArray(evidence.questions) || !Array.isArray(evidence.sourceAliases) || !Array.isArray(evidence.files) || !Array.isArray(evidence.documentFiles) || !Array.isArray(evidence.missingIndices) || digest(evidenceBody(evidence)) !== evidence.evidenceHash) fail('INVALID_BANK_IMAGE_EVIDENCE') }
async function verify(evidence, io, selected) {
  validEvidence(evidence)
  const facts = await rootFacts(evidence.requestedQuestionImageRoot, io)
  if (facts.questionImageRoot !== evidence.questionImageRoot || facts.rootIdentity !== evidence.rootIdentity) fail('BANK_IMAGE_EVIDENCE_CHANGED')
  for (const alias of evidence.sourceAliases.filter(row => !selected || row.asset === selected.asset)) { let resolved; try { resolved = await io.realpath(absolute(alias.declaredPath)) } catch { fail('BANK_IMAGE_EVIDENCE_CHANGED') } if (!inside(facts.questionImageRoot, resolved) || resolved !== alias.resolvedPath) fail('BANK_IMAGE_EVIDENCE_CHANGED') }
  for (const missing of evidence.missingIndices) { let current; try { current = await file(facts.questionImageRoot, missing, io, true) } catch { fail('BANK_IMAGE_EVIDENCE_CHANGED') } if (current) fail('BANK_IMAGE_EVIDENCE_CHANGED') }
  const files = selected ? evidence.files.filter(row => indices.includes(row.relativePath) || (selected.rootKind === 'question-image' && row.relativePath === selected.relativePath)) : evidence.files
  for (const expected of files) { let current; try { current = await file(facts.questionImageRoot, expected.relativePath, io, indices.includes(expected.relativePath)) } catch { fail('BANK_IMAGE_EVIDENCE_CHANGED') } if (!current || canonical(current.receipt) !== canonical(expected)) fail('BANK_IMAGE_EVIDENCE_CHANGED') }
  if (selected?.rootKind === 'question-image' && !files.some(row => row.relativePath === selected.relativePath)) fail('INVALID_BANK_IMAGE_EVIDENCE')
  if (evidence.documentRoot) {
    const doc = evidence.documentRoot, current = await rootFacts(doc.requestedMineruRoot, io)
    if (current.questionImageRoot !== doc.mineruRoot || current.rootIdentity !== doc.rootIdentity) fail('BANK_IMAGE_EVIDENCE_CHANGED')
    const receipts = selected ? evidence.documentFiles.filter(row => row.relativePath === 'rebuild-manifest.json' || (selected.rootKind === 'mineru-document' && [selected.relativePath, selected.jobId + '/job.json'].includes(row.relativePath))) : evidence.documentFiles
    for (const expected of receipts) { let actual; try { actual = (await documentFile(doc.mineruRoot, expected.relativePath, io)).receipt } catch { fail('BANK_IMAGE_EVIDENCE_CHANGED') } if (canonical(actual) !== canonical(expected)) fail('BANK_IMAGE_EVIDENCE_CHANGED') }
    if (selected?.rootKind === 'mineru-document' && !receipts.some(row => row.relativePath === selected.relativePath)) fail('INVALID_BANK_IMAGE_EVIDENCE')
    const after = await rootFacts(doc.requestedMineruRoot, io)
    if (canonical(after) !== canonical(current)) fail('BANK_IMAGE_EVIDENCE_CHANGED')
  }
  if (canonical(await rootFacts(evidence.requestedQuestionImageRoot, io)) !== canonical(facts)) fail('BANK_IMAGE_EVIDENCE_CHANGED')
}

/** Preserves exact embedded references separately from manually certified overlays. No access grants. */
export async function inspectLegacyBankImageEvidence({ snapshot, questionImageRoot, mineruRoot, io = fs } = {}) {
  const { records, bankSnapshotSha256 } = bankFrom(snapshot), facts = await rootFacts(questionImageRoot, io)
  const files = new Map(), sourceAliases = new Map(), missingIndices = [], maps = []
  let documentRoot = null
  const documentFiles = new Map(), jobs = new Map()
  const captureDocument = async relativePath => {
    const result = await documentFile(documentRoot.mineruRoot, relativePath, io), prior = documentFiles.get(relativePath)
    if (prior && canonical(prior) !== canonical(result.receipt)) fail('BANK_IMAGE_SOURCE_CHANGED')
    documentFiles.set(relativePath, result.receipt)
    return result
  }
  if (mineruRoot !== undefined) {
    const root = await rootFacts(mineruRoot, io)
    documentRoot = { requestedMineruRoot: root.requestedQuestionImageRoot, mineruRoot: root.questionImageRoot, rootIdentity: root.rootIdentity }
    const manifest = await captureDocument('rebuild-manifest.json')
    documentRoot.manifestSha256 = manifest.receipt.sha256
    let data
    try { data = JSON.parse(manifest.bytes.toString('utf8')) } catch { fail('BANK_DOCUMENT_MANIFEST_INVALID') }
    if (data.version !== 1 || !Array.isArray(data.documents)) fail('BANK_DOCUMENT_MANIFEST_INVALID')
    for (const doc of data.documents) {
      if (!object(doc) || !Array.isArray(doc.jobs)) fail('BANK_DOCUMENT_MANIFEST_INVALID')
      for (const job of doc.jobs) { if (!object(job)) fail('BANK_DOCUMENT_MANIFEST_INVALID'); const found = jobs.get(job.id) ?? []; found.push({ doc, job }); jobs.set(job.id, found) }
    }
  }
  const capture = async asset => {
    const result = await file(facts.questionImageRoot, asset, io), previous = files.get(asset)
    if (previous && canonical(previous) !== canonical(result.receipt)) fail('BANK_IMAGE_SOURCE_CHANGED')
    files.set(asset, result.receipt)
    return result.receipt
  }
  for (const relativePath of indices) {
    const result = await file(facts.questionImageRoot, relativePath, io, true)
    if (!result) { missingIndices.push(relativePath); maps.push(new Map()); continue }
    files.set(relativePath, result.receipt); maps.push(parsedIndex(result.bytes, relativePath === indices[1]))
  }
  const questions = [], unavailable = []
  for (const questionId of Object.keys(records).sort()) {
    const record = records[questionId]
    if (!object(record) || typeof record.stem !== 'string' || !Array.isArray(record.options) || record.options.some(option => typeof option !== 'string') || typeof record.explanation !== 'string') { unavailable.push({ questionId, field: 'record', reason: 'UNSUPPORTED_BANK_RECORD' }); continue }
    const stemSha256 = sha(record.stem), optionsSha256 = sha(JSON.stringify(record.options)), proven = new Map(), proofs = []
    const register = (asset, hash, binding, metadata = {}) => {
      let row = proven.get(asset)
      if (row && (row.rootKind !== (metadata.rootKind ?? 'question-image') || row.relativePath !== (metadata.relativePath ?? asset))) fail('AMBIGUOUS_BANK_IMAGE_ASSOCIATION')
      if (row && row.sha256 !== hash) fail('BANK_IMAGE_SOURCE_CHANGED')
      if (!row) { row = { asset, relativePath: asset, rootKind: 'question-image', ...metadata, sha256: hash, bindings: [] }; proven.set(asset, row) }
      const complete = { ...binding, referenceSha256: sha(binding.reference) }, bindingKey = digest(complete)
      if (!row.bindings.some(item => item.bindingKey === bindingKey)) row.bindings.push({ ...complete, bindingKey })
    }
    const overlay = async (proof, requested) => {
      const receipts = new Map()
      // Validate every file before contributing any binding from this overlay proof.
      for (const item of requested) {
        const receipt = await capture(item.asset)
        if (receipt.sha256 !== item.hash) fail('BANK_IMAGE_BYTES_CHANGED')
        receipts.set(item.asset, receipt)
      }
      for (const item of requested) register(item.asset, receipts.get(item.asset).sha256, item.binding)
      if (requested.length) proofs.push(proof)
    }
    const stem = maps[0].get(questionId), option = maps[1].get(questionId)
    if (stem) {
      try {
        if (stem.stemSha256 !== stemSha256) fail('BANK_RECORD_CHANGED')
        await overlay({ kind: 'stem-association', indexRelativePath: indices[0], sourcePdfSha256: stem.sourcePdfSha256, sourcePage: stem.sourcePage, displayMode: stem.displayMode ?? 'supplement' }, [{ asset: stem.asset, hash: stem.assetSha256, binding: { provenance: 'verified-stem-association', field: 'stem-overlay', reference: '题目_images/' + stem.asset, fieldSha256: stemSha256, indexRelativePath: indices[0] } }])
      } catch (error) { if (error.code === 'BANK_IMAGE_SOURCE_CHANGED') throw error; unavailable.push({ questionId, field: 'stem-association', reason: error.code ?? 'UNSUPPORTED_STEM_ASSOCIATION' }) }
    }
    if (option) {
      try {
        if (option.stemSha256 !== stemSha256 || option.optionsSha256 !== optionsSha256) fail('BANK_RECORD_CHANGED')
        if (option.sourceOptions) {
          const key = text => /^\s*([A-Z])(?:[.、)\s]|$)/.exec(text)?.[1]
          if (option.sourceOptions.length !== record.options.length || option.optionIndices.length !== record.options.length || option.optionIndices.some(index => index >= record.options.length) || option.sourceOptions.some((text, index) => !key(text) || key(text) !== key(record.options[index]))) fail('UNSUPPORTED_OPTION_ASSOCIATION')
          const declared = new Map((option.sourceAssets ?? []).map(asset => [asset.asset, asset.assetSha256])), requested = []
          for (const [optionIndex, text] of option.sourceOptions.entries()) {
            const refs = references(text)
            if (refs.unsupported) fail('UNSUPPORTED_IMAGE_REFERENCE')
            for (const [referenceIndex, target] of refs.targets.entries()) { const asset = localAsset(target); if (!asset || !declared.has(asset)) fail('UNASSOCIATED_IMAGE_REFERENCE'); requested.push({ asset, hash: declared.get(asset), binding: { provenance: 'verified-option-association', field: 'option-overlay', optionIndex, referenceIndex, reference: target, fieldSha256: sha(text), indexRelativePath: indices[1] } }) }
          }
          await overlay({ kind: 'option-association', indexRelativePath: indices[1], sourcePdfSha256: option.sourcePdfSha256, sourcePage: option.sourcePage, sourceOptionsSha256: sha(JSON.stringify(option.sourceOptions)) }, requested)
        }
      } catch (error) { if (error.code === 'BANK_IMAGE_SOURCE_CHANGED') throw error; unavailable.push({ questionId, field: 'option-association', reason: error.code ?? 'UNSUPPORTED_OPTION_ASSOCIATION' }) }
    }
    for (const [field, text, optionIndex] of [['stem', record.stem], ...record.options.map((text, index) => ['options', text, index]), ['explanation', record.explanation]]) {
      const refs = references(text)
      if (refs.unsupported) unavailable.push({ questionId, field, reason: 'UNSUPPORTED_IMAGE_REFERENCE' })
      for (const [referenceIndex, target] of refs.targets.entries()) {
        try {
          if (target.startsWith('/api/kaogong/document-image?')) {
            if (!documentRoot) fail('EXPLICIT_MINERU_ROOT_REQUIRED')
            const reference = parseLegacyDocumentReference(target)
            if (!reference) fail('UNSUPPORTED_IMAGE_REFERENCE')
            const matches = jobs.get(reference.jobId)
            if (matches?.length !== 1 || matches[0].job.state !== 'done') fail('BANK_DOCUMENT_JOB_UNVERIFIED')
            const { doc, job } = matches[0], stored = await captureDocument(reference.jobId + '/job.json')
            let metadata
            try { metadata = JSON.parse(stored.bytes.toString('utf8')) } catch { fail('BANK_DOCUMENT_JOB_UNVERIFIED') }
            if (metadata.id !== reference.jobId || metadata.source !== doc.file || metadata.pages !== job.pages || metadata.subject !== doc.subject || metadata.title !== path.basename(doc.file)) fail('BANK_DOCUMENT_JOB_UNVERIFIED')
            const relativePath = reference.jobId + '/assets/' + reference.asset, result = await captureDocument(relativePath)
            register('document/' + reference.jobId + '/' + reference.asset, result.receipt.sha256, { provenance: 'legacy-embedded-document-reference', field, ...(optionIndex === undefined ? {} : { optionIndex }), referenceIndex, reference: target, fieldSha256: sha(text) }, { rootKind: 'mineru-document', relativePath, jobId: reference.jobId, documentAsset: reference.asset })
            continue
          }
          const alias = await embeddedAsset(target, facts.questionImageRoot, io), previous = sourceAliases.get(alias.declaredPath)
          if (previous && canonical(previous) !== canonical(alias)) fail('BANK_IMAGE_SOURCE_CHANGED')
          const receipt = await capture(alias.asset)
          if (receipt.resolvedPath !== alias.resolvedPath) fail('BANK_IMAGE_SOURCE_CHANGED')
          sourceAliases.set(alias.declaredPath, alias)
          register(alias.asset, receipt.sha256, { provenance: 'legacy-embedded-reference', field, ...(optionIndex === undefined ? {} : { optionIndex }), referenceIndex, reference: target, fieldSha256: sha(text) })
        } catch (error) { if (error.code === 'BANK_IMAGE_SOURCE_CHANGED') throw error; unavailable.push({ questionId, field, ...(optionIndex === undefined ? {} : { optionIndex }), referenceIndex, reason: error.code ?? 'UNSUPPORTED_IMAGE_REFERENCE' }) }
      }
    }
    const assets = [...proven.values()].sort((a, b) => a.asset < b.asset ? -1 : a.asset > b.asset ? 1 : 0)
    if (assets.length) questions.push({ questionId, recordSha256: digest(record), stemSha256, optionsSha256, explanationSha256: sha(record.explanation), proofs, assets })
  }
  const body = { format: 'kaogong-legacy-bank-image-evidence', formatVersion: 1, ...facts, documentRoot, documentFiles: [...documentFiles.values()].sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0), sourceRevision: snapshot.sourceRevision, snapshotHash: digest(snapshot), bankSnapshotSha256, questions, unavailable, sourceAliases: [...sourceAliases.values()].sort((a, b) => a.declaredPath < b.declaredPath ? -1 : a.declaredPath > b.declaredPath ? 1 : 0), missingIndices, files: [...files.values()].sort((a, b) => a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0) }
  const evidence = { ...body, evidenceHash: digest(body) }
  await verify(evidence, io)
  const bindings = questions.flatMap(question => question.assets.flatMap(asset => asset.bindings))
  return { evidence, summary: { formatVersion: 1, status: 'readonly-bank-image-evidence', counts: { records: Object.keys(records).length, verifiedRecords: questions.length, assets: questions.reduce((n, row) => n + row.assets.length, 0), embeddedReferences: bindings.filter(binding => binding.provenance === 'legacy-embedded-reference').length, documentReferences: bindings.filter(binding => binding.provenance === 'legacy-embedded-document-reference').length, overlayReferences: bindings.filter(binding => binding.provenance.startsWith('verified-')).length, unavailableReferences: unavailable.length }, evidenceHash: evidence.evidenceHash, bankSnapshotSha256 } }
}
export async function revalidateLegacyBankImageEvidence({ snapshot, questionImageRoot, mineruRoot, evidence, io = fs } = {}) {
  await verify(evidence, io)
  const current = await inspectLegacyBankImageEvidence({ snapshot, questionImageRoot, mineruRoot, io })
  if (current.evidence.evidenceHash !== evidence.evidenceHash) fail('BANK_IMAGE_EVIDENCE_CHANGED')
  return current.evidence
}
/** Host must authorize the trusted source owner first; neither question identity nor root comes from the browser. */
export async function readLegacyBankImageAsset({ evidence, questionId, asset, bindingKey, io = fs } = {}) {
  validEvidence(evidence)
  const allowed = evidence.questions.find(row => row.questionId === questionId)?.assets.find(row => row.asset === asset)
  if (!allowed) fail('BANK_IMAGE_NOT_PROVEN')
  if (typeof bindingKey !== 'string' || !allowed.bindings.some(binding => binding.bindingKey === bindingKey)) fail('BANK_IMAGE_BINDING_NOT_PROVEN')
  await verify(evidence, io, allowed)
  const result = allowed.rootKind === 'mineru-document' ? await documentFile(evidence.documentRoot.mineruRoot, allowed.relativePath, io) : await file(evidence.questionImageRoot, allowed.relativePath, io)
  if (result.receipt.sha256 !== allowed.sha256) fail('BANK_IMAGE_EVIDENCE_CHANGED')
  return result.bytes
}
export async function writeLegacyBankImageEvidence({ snapshot, questionImageRoot, mineruRoot, output, io = fs } = {}) {
  if (typeof output !== 'string' || !path.isAbsolute(output)) fail('EXPLICIT_ABSOLUTE_OUTPUT_REQUIRED')
  const facts = await rootFacts(questionImageRoot, io)
  let target, home
  try { target = path.join(await io.realpath(path.dirname(output)), path.basename(output)); home = await io.realpath(absolute(snapshot?.sourceHome)) } catch { fail('OUTPUT_PARENT_OR_SOURCE_UNAVAILABLE') }
  if (inside(facts.questionImageRoot, target) || inside(home, target)) fail('OUTPUT_IN_SOURCE')
  if (mineruRoot !== undefined && inside((await rootFacts(mineruRoot, io)).questionImageRoot, target)) fail('OUTPUT_IN_SOURCE')
  const { evidence, summary } = await inspectLegacyBankImageEvidence({ snapshot, questionImageRoot, mineruRoot, io })
  try { await io.writeFile(target, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx', mode: 0o600 }) } catch (error) { fail(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_WRITE_FAILED') }
  return summary
}

/** Recheck only the pinned roots/index receipts before practice projection; asset reads remain individually pinned. */
export async function verifyLegacyBankPracticeEvidence({evidence,io=fs}) { await verify(evidence,io,{rootKind:'practice-index'}) }
