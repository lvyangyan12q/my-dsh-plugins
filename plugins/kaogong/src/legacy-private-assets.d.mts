import type * as fs from 'node:fs/promises'
export type PrivateAssetIO=Pick<typeof fs,'realpath'|'stat'|'readFile'>
export interface PrivateAssetBinding {
 readonly kind:'markdown'|'html';readonly src:string;readonly asset:string;readonly relativePath:string;readonly sha256:string;readonly bindingKey:string
}
export interface PrivateAssetEntry {
 readonly id:string;readonly jobId:string;readonly provenance:'legacy-private-reference';readonly recordSha256:string;readonly contentSha256:string;readonly jobRelativePath:string;readonly bindings:readonly PrivateAssetBinding[]
}
/** Private trusted-Host receipt only; integrity hash is not a MAC, bearer grant, or PDF provenance. */
export interface LegacyPrivateAssetEvidence {
 readonly format:'kaogong-legacy-private-assets';readonly formatVersion:1;readonly provenance:'legacy-private-reference'
 readonly requestedMaterialRoot:string;readonly materialRoot:string;readonly rootIdentity:string;readonly sourceRevision:string;readonly snapshotHash:string;readonly privateEntryIds:readonly string[];readonly manifestRelativePath:string
 readonly entries:readonly PrivateAssetEntry[];readonly unprovenEntries:readonly {readonly id:string;readonly reason:string}[]
 readonly sourceAliases:readonly {readonly declaredPath:string;readonly resolvedPath:string}[]
 readonly files:readonly {readonly relativePath:string;readonly resolvedPath:string;readonly sha256:string}[];readonly evidenceHash:string
}
export interface PrivateAssetSummary {
 readonly formatVersion:1;readonly status:'readonly-private-reference-evidence';readonly provenance:'legacy-private-reference'
 readonly counts:{readonly selected:number;readonly provenEntries:number;readonly unprovenEntries:number;readonly bindings:number;readonly assets:number};readonly evidenceHash:string
}
export interface PrivateAssetInput {
 /** Full original private09a snapshot from a trusted inspector, never arbitrary browser/model input. */
 readonly snapshot:unknown;readonly materialRoot:string
 /** Original private IDs selected by the trusted plan/09d classification; no sharing classification is inferred here. */
 readonly privateEntryIds:readonly string[];readonly io?:PrivateAssetIO
}
export function inspectLegacyPrivateAssets(input:PrivateAssetInput):Promise<{evidence:LegacyPrivateAssetEvidence;summary:PrivateAssetSummary}>
/** Supply a freshly inspected snapshot to detect business source changes, not merely the old pinned snapshot. */
export function revalidateLegacyPrivateAssets(input:PrivateAssetInput&{readonly evidence:LegacyPrivateAssetEvidence}):Promise<LegacyPrivateAssetEvidence>
/** Host selects its stored receipt and binding after authorizing the own private historical instance. No cross-instance grant is accepted. */
export function readLegacyPrivateAsset(input:{readonly evidence:LegacyPrivateAssetEvidence;readonly entryId:string;readonly jobId:string;readonly asset:string;readonly bindingKey?:string;readonly currentRecord:unknown;readonly access:{readonly kind:'private-history';readonly ownerInstanceId:string;readonly instanceId:string};readonly io?:PrivateAssetIO}):Promise<Buffer>
