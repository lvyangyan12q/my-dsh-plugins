import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
/** Candidate versions only. Compilation, installed consumers and Browser prove each separately. */
export const nativeCandidateVersions = Object.freeze(['0.2.0-rc.2', '0.2.1-alpha.2'])
export async function selectedNativeVersion(source) {
 const { version } = JSON.parse(await readFile(join(source, 'package.json'), 'utf8'))
 assert(nativeCandidateVersions.includes(version), `Unsupported native runtime ${version}; independently validate a new candidate before release`)
 return version
}
