import assert from 'node:assert/strict'
import { readFile, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
const source = process.env.DSH_SOURCE
assert(source, 'Set DSH_SOURCE to an independently built, unpatched official runtime')
const root = await realpath(source)
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
assert.equal(manifest.version, '0.2.0-rc.2', 'This release is validated against rc.2; newer native versions require independent compatibility acceptance')
assert((await stat(join(root, 'apps/cli/lib/bin.js'))).isFile(), 'Build the independent official runtime before release compilation')
// This read-only preflight never installs native patches. Public types, Client factories,
// selected runtime anchors and installed consumers are validated by subsequent release gates.
console.log(JSON.stringify({ nativeSource: root, version: manifest.version, nativeSourceWrites: 0, nativePatchRequirements: 0, publicCompilationAndInstalledAcceptance: 'required separately' }))
