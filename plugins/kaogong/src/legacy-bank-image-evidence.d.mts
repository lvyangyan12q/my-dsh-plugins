import type * as fs from 'node:fs/promises'

export type BankImageReadIO = Pick<typeof fs, 'realpath' | 'stat' | 'readFile'>
export interface ProvenBankImage {
  /** Exact root-relative file proven by an original reference or verified overlay. */
  readonly asset: string
  readonly relativePath: string
  readonly rootKind: 'question-image' | 'mineru-document'
  readonly jobId?: string
  readonly documentAsset?: string
  readonly sha256: string
  readonly bindings: readonly BankImageReferenceBinding[]
}
export interface BankImageReferenceBinding {
  readonly bindingKey: string
  readonly provenance: 'legacy-embedded-reference' | 'legacy-embedded-document-reference' | 'verified-stem-association' | 'verified-option-association'
  readonly field: 'stem' | 'options' | 'explanation' | 'stem-overlay' | 'option-overlay'
  readonly optionIndex?: number
  readonly referenceIndex?: number
  /** Exact literal Markdown target, without trimming, decoding or URL canonicalization. Private Host evidence. */
  readonly reference: string
  /** SHA-256 of UTF-8 reference; not a hash of the surrounding Markdown markup. */
  readonly referenceSha256: string
  readonly fieldSha256: string
  readonly indexRelativePath?: string
}
export interface BankImageManualProof {
  readonly kind: 'stem-association' | 'option-association'
  readonly indexRelativePath: string
  /** Existing manual index declaration; this module does not independently parse or certify its PDF. */
  readonly sourcePdfSha256: string
  readonly sourcePage: number
  readonly displayMode?: 'supplement' | 'source-image'
  readonly sourceOptionsSha256?: string
}
export interface ProvenBankQuestionImages {
  readonly questionId: string
  readonly recordSha256: string
  readonly stemSha256: string
  readonly optionsSha256: string
  readonly explanationSha256: string
  readonly proofs: readonly BankImageManualProof[]
  readonly assets: readonly ProvenBankImage[]
}
/** Private trusted-Host integrity receipt; not a bearer grant or caller-supplied resource descriptor. */
export interface LegacyBankImageEvidence {
  readonly format: 'kaogong-legacy-bank-image-evidence'
  readonly formatVersion: 1
  readonly requestedQuestionImageRoot: string
  readonly questionImageRoot: string
  readonly rootIdentity: string
  readonly sourceRevision: string
  readonly snapshotHash: string
  readonly bankSnapshotSha256: string
  readonly questions: readonly ProvenBankQuestionImages[]
  readonly unavailable: readonly { readonly questionId: string; readonly field: string; readonly reason: string }[]
  readonly sourceAliases: readonly { readonly declaredPath: string; readonly resolvedPath: string; readonly asset: string }[]
  readonly missingIndices: readonly string[]
  readonly files: readonly { readonly relativePath: string; readonly resolvedPath: string; readonly sha256: string }[]
  readonly documentRoot: { readonly requestedMineruRoot: string; readonly mineruRoot: string; readonly rootIdentity: string; readonly manifestSha256: string } | null
  readonly documentFiles: readonly { readonly relativePath: string; readonly resolvedPath: string; readonly sha256: string }[]
  readonly evidenceHash: string
}
export interface BankImageEvidenceSummary {
  readonly formatVersion: 1
  readonly status: 'readonly-bank-image-evidence'
  readonly counts: { readonly records: number; readonly verifiedRecords: number; readonly assets: number; readonly embeddedReferences: number; readonly documentReferences: number; readonly overlayReferences: number; readonly unavailableReferences: number }
  readonly evidenceHash: string
  readonly bankSnapshotSha256: string
}
export interface BankImageEvidenceInput {
  readonly snapshot: unknown
  readonly questionImageRoot: string
  /** Explicit optional MinerU root; no fallback to private knowledge or ambient configuration. */
  readonly mineruRoot?: string
  readonly io?: BankImageReadIO
}
export function inspectLegacyBankImageEvidence(input: BankImageEvidenceInput): Promise<{ evidence: LegacyBankImageEvidence; summary: BankImageEvidenceSummary }>
/** Call with a freshly inspected 09a snapshot before separately confirmed apply. */
export function revalidateLegacyBankImageEvidence(input: BankImageEvidenceInput & { readonly evidence: LegacyBankImageEvidence }): Promise<LegacyBankImageEvidence>
/** Caller must authorize the source owner first; questionId/root must come from trusted Host state. */
export function readLegacyBankImageAsset(input: { readonly evidence: LegacyBankImageEvidence; readonly questionId: string; readonly asset: string; readonly bindingKey: string; readonly io?: BankImageReadIO }): Promise<Buffer>
export function writeLegacyBankImageEvidence(input: Omit<BankImageEvidenceInput, 'io'> & { readonly output: string; readonly io?: BankImageReadIO & Pick<typeof fs, 'writeFile'> }): Promise<BankImageEvidenceSummary>
