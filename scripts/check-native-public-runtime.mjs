import assert from 'node:assert/strict'
import { realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { selectedNativeVersion } from './native-version-matrix.mjs'
const source = process.env.DSH_SOURCE
assert(source, 'Set DSH_SOURCE to an independently built, unpatched official runtime')
const root = await realpath(source)
const version = await selectedNativeVersion(root)
assert((await stat(join(root, 'apps/cli/lib/bin.js'))).isFile(), 'Build the independent official runtime before release compilation')
// This read-only preflight never installs native patches. Public types, Client factories,
// selected runtime anchors and installed consumers are validated by subsequent release gates.
console.log(JSON.stringify({ nativeSource: root, version, nativeSourceWrites: 0, nativePatchRequirements: 0, publicCompilationAndInstalledAcceptance: 'required separately' }))


