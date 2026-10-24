/** Offline inspection only. Never imports a plugin, storageDomain, session controller or migration runtime. */
import * as fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

const specs = Object.freeze({ kaogong_bank: [2, 'questions'], kaogong_knowledge: [1, 'entries'], kaogong_lessons: [1, 'lessons'], kaogong_notebook: [1, 'questions'], kaogong_practice: [1, 'rounds'], kaogong_progress: [1, 'days'], personal_workbench_role_bindings: [1, 'bindings'] })
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const inside = (root, target) => { const relative = path.relative(root, target); return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)) }
function fail(code) { throw Object.assign(new Error(code), { code }) }
async function sourceRoot(home, io) {
  if (typeof home !== 'string' || !path.isAbsolute(home)) fail('EXPLICIT_ABSOLUTE_HOME_REQUIRED')
  try { return await io.realpath(home) } catch { fail('SOURCE_UNAVAILABLE') }
}
async function capture(root, io) {
  const files = []
  for (const [name, [version, table]] of Object.entries(specs)) {
    const sourcePath = path.join(root, 'storages', name + '.json')
    try {
      const resolved = await io.realpath(sourcePath)
      if (!inside(root, resolved)) fail('SOURCE_PATH_ESCAPE')
      const bytes = await io.readFile(resolved)
      let data
      try { data = JSON.parse(bytes.toString('utf8')) } catch { fail('MALFORMED_SOURCE') }
      if (!object(data) || !object(data.unit) || data.unit.name !== name || data.unit.version !== version) fail('UNSUPPORTED_SOURCE_VERSION')
      if (!Object.hasOwn(data, 'global') || !object(data.tables) || Object.keys(data.tables).length !== 1 || !object(data.tables[table]) || !Object.values(data.tables[table]).every(object)) fail('MALFORMED_SOURCE')
      files.push({ name, sourcePath, resolvedPath: resolved, version, table, sha256: hash(bytes), bytesBase64: bytes.toString('base64'), data })
    } catch (error) {
      if (['SOURCE_PATH_ESCAPE', 'MALFORMED_SOURCE', 'UNSUPPORTED_SOURCE_VERSION'].includes(error.code)) throw error
      fail('SOURCE_UNAVAILABLE')
    }
  }
  return files
}
function revision(files) { return hash(JSON.stringify(files.map(({ name, sha256, resolvedPath }) => [name, sha256, resolvedPath]))) }

/** Public inspection seam. io is the filesystem adapter; default is Node's read-only filesystem methods. */
export async function inspectLegacy({ home, provider = 'json-files', io = fs } = {}) {
  if (provider !== 'json-files') fail('UNSUPPORTED_PROVIDER')
  const root = await sourceRoot(home, io)
  const files = await capture(root, io)
  const counts = Object.fromEntries(files.map(file => [file.name, Object.keys(file.data.tables[file.table]).length]))
  const bindings = files.find(file => file.name === 'personal_workbench_role_bindings').data.tables.bindings
  // Only positively identified Kaogong bindings enter proposed plan inputs. Foreign raw records stay in the private snapshot.
  const selected = Object.entries(bindings).filter(([, row]) => row.key?.appId === 'kaogong')
  const knowledge = files.find(file => file.name === 'kaogong_knowledge').data.tables.entries
  const notes = Object.values(knowledge).filter(row => row.kind === '笔记').length
  const sourceRevision = revision(files)
  if (revision(await capture(root, io)) !== sourceRevision) fail('SOURCE_CHANGED')
  const summary = { formatVersion: 1, status: 'inspection-only', counts, bindings: { kaogong: selected.length, retainedForeign: counts.personal_workbench_role_bindings - selected.length }, knowledge: { privateNotes: notes, unverifiedPrivate: counts.kaogong_knowledge - notes, verifiedShareable: 0 }, hashes: Object.fromEntries(files.map(file => [file.name, file.sha256])), revision: sourceRevision, nativeValidation: 'pending-public-platform-validation' }
  const snapshot = { format: 'kaogong-legacy-inspection', formatVersion: 1, private: true, sourceHome: root, sourceRevision, summary, files: files.map(({ data, ...file }) => file), planInputs: { kaogongBindings: selected.map(([id, binding]) => ({ id, binding })), knowledge: Object.keys(knowledge).map(id => ({ id, ownership: 'private', sourceEvidence: 'unverified' })), nativeIdentity: 'pending-public-platform-validation', nativeMessagesCopied: false, newLearningInstances: 'empty', formalApply: 'requires-concrete-preview-confirmation' } }
  return { summary, snapshot }
}

/** Writes only a new private snapshot outside the source home. Never overwrites an existing file. */
export async function writeLegacyInspection({ home, output, materialRoots = [], io = fs } = {}) {
  const root = await sourceRoot(home, io)
  if (typeof output !== 'string' || !path.isAbsolute(output)) fail('EXPLICIT_ABSOLUTE_OUTPUT_REQUIRED')
  let parent
  try { parent = await io.realpath(path.dirname(output)) } catch { fail('OUTPUT_PARENT_UNAVAILABLE') }
  const target = path.join(parent, path.basename(output))
  if (inside(root, target)) fail('OUTPUT_IN_SOURCE')
  for (const materialRoot of materialRoots) {
    let resolved
    try { resolved = await io.realpath(materialRoot) } catch { fail('MATERIAL_ROOT_UNAVAILABLE') }
    if (inside(resolved, target)) fail('OUTPUT_IN_SOURCE')
  }
  const { summary, snapshot } = await inspectLegacy({ home: root, io })
  // A final complete reread pins the snapshot immediately before the sole output write.
  if (revision(await capture(root, io)) !== snapshot.sourceRevision) fail('SOURCE_CHANGED')
  try { await io.writeFile(target, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 }) }
  catch (error) { fail(error.code === 'EEXIST' ? 'OUTPUT_EXISTS' : 'OUTPUT_WRITE_FAILED') }
  return summary
}
