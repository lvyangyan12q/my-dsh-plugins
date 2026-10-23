import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {selectedNativeVersion} from '../../../scripts/native-version-matrix.mjs'
const source=process.env.DSH_SOURCE;assert.ok(source)
const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
const {evaluatePluginCompatibility,getDshRuntimeVersion}=await import(pathToFileURL(resolve(source,'packages/boot/app-boot/lib/index.js')).href)
test('selected actual official host accepts supported peers without installing another native runtime',async()=>{const v=await selectedNativeVersion(source);assert.equal(getDshRuntimeVersion(),v);assert.equal(evaluatePluginCompatibility(manifest,{},v),undefined);assert.equal(manifest.optionalDependencies?.['@deepseek-ai/dsh-storage-domain'],undefined);assert.equal(manifest.dependencies?.['@deepseek-ai/dsh-storage-domain'],undefined);assert.ok(manifest.peerDependencies['@deepseek-ai/dsh-storage-domain']);const bad={...manifest,peerDependencies:{...manifest.peerDependencies,'@deepseek-ai/dsh-storage-domain':'0.1.0'}};assert.equal(evaluatePluginCompatibility(bad,{},v).exempted,false)})
