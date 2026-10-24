import type * as fs from 'node:fs/promises'

export type MaterialEvidenceIO = Pick<typeof fs, 'realpath' | 'stat' | 'readFile' | 'writeFile'>
export interface ProvenMaterialAsset {
  readonly asset: string
  /** POSIX relative path from the explicit canonical material root, including job/assets. */
  readonly relativePath: string
  readonly sha256: string
}
export interface ProvenMaterialEntry {
  readonly id: string
  readonly jobId: string
  readonly sourceContentSha256: string
  readonly sourcePdfSha256: string
  readonly sourcePdfRelativePath: string
  readonly knowledgeRelativePath: string
  readonly jobRelativePath: string
  readonly assets: readonly ProvenMaterialAsset[]
}
/** Private trusted-Host receipt, never a bearer grant or model-supplied resource descriptor. */
export interface LegacyMaterialEvidence {
  readonly format: 'kaogong-legacy-material-evidence'
  readonly formatVersion: 1
  readonly requestedMaterialRoot: string
  readonly materialRoot: string
  readonly rootIdentity: string
  readonly sourceRevision: string
  readonly snapshotHash: string
  readonly manifestRelativePath: string
  readonly manifestSha256: string
  readonly entries: readonly ProvenMaterialEntry[]
  readonly privateEntries: readonly { readonly id: string; readonly reason: string }[]
  readonly sourceAliases: readonly { readonly declaredPath: string; readonly resolvedPath: string }[]
  readonly files: readonly { readonly relativePath: string; readonly resolvedPath: string; readonly sha256: string }[]
  readonly evidenceHash: string
}
export interface MaterialEvidenceSummary {
  readonly formatVersion: 1
  readonly status: 'readonly-material-evidence'
  readonly counts: { readonly verified: number; readonly private: number; readonly assets: number }
  readonly evidenceHash: string
  readonly manifestSha256: string
}
export interface MaterialEvidenceInput {
  /** Full private 09a snapshot; raw bytes and source revision are validated. */
  readonly snapshot: unknown
  readonly materialRoot: string
  readonly io?: MaterialEvidenceIO
}
/** Readonly exact supported-import proof. Unsupported or ambiguous entries remain private. */
export function inspectLegacyMaterialEvidence(input: MaterialEvidenceInput): Promise<{ evidence: LegacyMaterialEvidence; summary: MaterialEvidenceSummary }>
/** Recomputes proof before separately confirmed apply; throws on any pinned dependency change. */
export function revalidateLegacyMaterialEvidence(input: MaterialEvidenceInput & { readonly evidence: LegacyMaterialEvidence }): Promise<LegacyMaterialEvidence>
/** Caller must authorize the instance/resource first; only an exact proven asset is readable. */
export function readLegacyMaterialAsset(input: { readonly evidence: LegacyMaterialEvidence; readonly entryId: string; readonly asset: string; readonly io?: MaterialEvidenceIO }): Promise<Buffer>
/** Sole optional output write: explicit new private file outside both source roots, using wx. */
export function writeLegacyMaterialEvidence(input: MaterialEvidenceInput & { readonly output: string }): Promise<MaterialEvidenceSummary>
