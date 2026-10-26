import fs from 'node:fs/promises'
import path from 'node:path'
import { inspectMaterials, materialEvidenceSnapshot } from '../src/materials-inspection.mjs'
import { inspectLegacyMaterialEvidence, revalidateLegacyMaterialEvidence } from '../src/legacy-material-evidence.mjs'
import { createMaterialLocationIO } from '../src/material-location-map.mjs'

const rootIndex = process.argv.indexOf('--plugin-root')
const outputIndex = process.argv.indexOf('--output-dir')
const root = rootIndex < 0 ? path.resolve(import.meta.dirname, '../materials') : path.join(process.argv[rootIndex + 1], 'materials')
const output = outputIndex < 0 ? path.join(root, 'manifests') : process.argv[outputIndex + 1]
if (!path.isAbsolute(root) || !path.isAbsolute(output)) throw Error('ABSOLUTE_MIGRATION_PATH_REQUIRED')
await fs.mkdir(output, {recursive:true})
const manifest = path.join(root, 'manifests')
const old = JSON.parse(await fs.readFile(path.join(manifest, 'old-root-evidence.json'), 'utf8'))
const migration = JSON.parse(await fs.readFile(path.join(manifest, 'migration.json'), 'utf8'))
const map = { format: 'kaogong-material-location-map', version: 1, root, sourceEvidenceHash: old.evidence.evidenceHash, aliases: [] }
for (const alias of old.evidence.sourceAliases) {
  const original = old.evidence.files.find(row => row.resolvedPath === alias.resolvedPath)
  const copy = migration.files.find(row => row.oldPath === alias.resolvedPath && row.verified)
  if (!original || !copy || copy.sha256 !== original.sha256) throw Error('UNVERIFIED_RELOCATION_SOURCE')
  map.aliases.push({ declaredPath: alias.declaredPath, relativePath: original.relativePath, sha256: original.sha256 })
}
const io = await createMaterialLocationIO(map)
const { snapshot } = await inspectMaterials({ home: path.join(root, 'source-home') })
const input = { snapshot: materialEvidenceSnapshot(snapshot), materialRoot: root, io }
const next = await inspectLegacyMaterialEvidence(input)
if (JSON.stringify(next.summary.counts) !== JSON.stringify(old.summary.counts)) throw Error('RELOCATION_COVERAGE_CHANGED')
await revalidateLegacyMaterialEvidence({ ...input, evidence: next.evidence })
await fs.writeFile(path.join(output, 'location-map.json'), JSON.stringify(map, null, 2))
await fs.writeFile(path.join(output, 'relocated-root-evidence.json'), JSON.stringify(next, null, 2))
console.log(JSON.stringify({ aliases: map.aliases.length, ...next.summary, applied: false }))
