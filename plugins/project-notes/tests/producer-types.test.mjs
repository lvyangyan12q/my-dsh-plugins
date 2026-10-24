import {test} from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,existsSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {spawnSync} from 'node:child_process'
test('producer compiles against the exact archived SDK and one explicit official Cordis identity outside the source tree',async()=>{
 assert.ok(process.env.DSH_SOURCE&&process.env.WORKTABLE_PACKAGE,'producer requires explicit official source and archived SDK')
 const folder=mkdtempSync(join(tmpdir(),'notes-types-public-')),receipt=join(folder,'receipt.json')
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('../check-types.mjs',import.meta.url))],{env:{...process.env,NOTES_TYPES_RECEIPT:receipt},encoding:'utf8'})
 assert.equal(run.status,0,run.stdout+'\n'+run.stderr)
 assert.ok(existsSync(receipt),'public producer must record its actual dependency identities; an ancestor-dependent tsc exit is insufficient')
 const value=JSON.parse(readFileSync(receipt,'utf8'))
 assert.equal(value.status,'public-producer-types-passed');assert.equal(value.nativeCordis.version,'4.0.5');assert.equal(value.nativeSkill.version,value.nativeVersion);assert.equal(value.sdk.name,'dsh-worktable');assert.ok(value.sdk.version);assert.equal(value.worktableSha256,(await import('node:crypto')).createHash('sha256').update(readFileSync(process.env.WORKTABLE_PACKAGE)).digest('hex'))
 assert.equal(value.notesCordis.realpath,value.sdkCordis.realpath);assert.equal(value.notesCordis.realpath,value.skillCordis.realpath);assert.equal(value.npmLegacyPeerBypass,false);assert.equal(value.sourceAndContractTypes,true)
 assert.notEqual(value.producer,fileURLToPath(new URL('..',import.meta.url)))
})
