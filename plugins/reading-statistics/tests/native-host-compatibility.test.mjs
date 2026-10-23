import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {selectedNativeVersion} from '../../../scripts/native-version-matrix.mjs'
const source=process.env.DSH_SOURCE;assert.ok(source)
const manifest=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'))
const {evaluatePluginCompatibility,getDshRuntimeVersion}=await import(pathToFileURL(resolve(source,'packages/boot/app-boot/lib/index.js')).href)
test('selected actual official host accepts supported peers without installing another native runtime',async()=>{const v=await selectedNativeVersion(source);assert.equal(getDshRuntimeVersion(),v);assert.equal(evaluatePluginCompatibility(manifest,{},v),undefined);assert.equal(manifest.optionalDependencies?.['@deepseek-ai/dsh-storage-domain'],undefined);assert.equal(manifest.dependencies?.['@deepseek-ai/dsh-storage-domain'],undefined);assert.ok(manifest.peerDependencies['@deepseek-ai/dsh-storage-domain']);const bad={...manifest,engines:{...manifest.engines,dsh:'0.1.0'}};assert.equal(evaluatePluginCompatibility(bad,{},v).exempted,false)})

test('native services are optional host-provided peers while Worktable remains an enforced package peer',()=>{for(const name of ['@deepseek-ai/cordis','@deepseek-ai/dsh-host-webserver','@deepseek-ai/dsh-storage-domain']){assert.equal(manifest.peerDependenciesMeta?.[name]?.optional,true,name)}assert.notEqual(manifest.peerDependenciesMeta?.['dsh-worktable']?.optional,true);assert.equal(manifest.peerDependencies['dsh-worktable'],'>=0.10.0-rc.3.1 <1')})

test('optional native metadata does not activate a data owner when required host services are absent',async()=>{const {createRequire}=await import('node:module'),{Readable}=await import('node:stream'),official=createRequire(resolve(source,'packages/client/ui-renderer/package.json')),{Context}=official('@deepseek-ai/cordis'),plugin=await import('../src/index.ts'),ctx=new Context();let route;try{ctx.provide('webServer',{register(value){route=value.handler;return()=>{}}});await ctx.plugin(plugin);await new Promise(r=>setImmediate(r));assert.equal(typeof route,'function');let status,value;await route(Readable.from([]),{writeHead(s){status=s},end(body){value=JSON.parse(body)}});assert.equal(status,503);assert.equal(value.error,'Reading data unavailable')}finally{await ctx.fiber.dispose()}})
