import type * as fs from 'node:fs/promises'
export interface LegacyDocumentReference {readonly jobId:string;readonly asset:string}
export function parseLegacyDocumentReference(target:unknown):LegacyDocumentReference|null
/** Explicit MinerU root, metadata only; no file reads, directory scans, or authorization. */
export function resolveLegacyDocumentPath(input:{readonly root:string;readonly jobId:string;readonly kind:'job'|'asset';readonly asset?:string;readonly io?:Pick<typeof fs,'realpath'|'stat'>}):Promise<{relativePath:string;resolvedPath:string}>
