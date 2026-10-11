import { materializeReviewedNativeCombination } from './native-compat-test-fixture.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root,'compat/native-session-chrome/manifest.json'),'utf8'))
const source = process.env.DSH_COMPAT_GIT_SOURCE ?? process.env.DSH_SOURCE
assert(source, 'Set DSH_SOURCE for the reviewed source fixture')
const hash = text => createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex')

test('native adapter rejects local changes, applies only its six reviewed files and supports read-only verification', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(),'my-dsh-native-chrome-'))
  const run = (...args) => spawnSync(process.execPath,[resolve(root,'scripts/check-native-session-chrome.mjs'),...args], { encoding:'utf8',env:{...process.env,DSH_SOURCE:fixture} })
  try {
    for (const row of manifest.files) {
      const path = resolve(fixture,row.path)
      await mkdir(dirname(path),{recursive:true})
      const original = execFileSync('git',['-C',source,'show',`${manifest.baseCommit}:${row.path}`],{encoding:'utf8'})
      assert.equal(hash(original),row.before)
      await writeFile(path,original)
    }
    execFileSync('git',['-C',fixture,'init'],{stdio:'ignore'})
    const unrelated = resolve(fixture,'user-agent-change.txt')
    await writeFile(unrelated,'preserve user changes\n')
    const missing = run()
    assert.notEqual(missing.status,0)
    assert.match(missing.stderr,/adaptation missing/)
    const changed = resolve(fixture,manifest.files[0].path)
    const original = await readFile(changed,'utf8')
    await writeFile(changed,original+'\n// User-owned change\n')
    const conflict = run('--apply')
    assert.notEqual(conflict.status,0)
    assert.match(conflict.stderr,/differs from the reviewed patch baseline/)
    assert.equal(await readFile(changed,'utf8'),original+'\n// User-owned change\n')
    await writeFile(changed,original)
    const applied = run('--apply')
    assert.equal(applied.status,0,applied.stderr)
    for (const row of manifest.files) assert.equal(hash(await readFile(resolve(fixture,row.path),'utf8')),row.after)
    assert.equal(await readFile(unrelated,'utf8'),'preserve user changes\n')
    const checked = run()
    assert.equal(checked.status,0,checked.stderr)
    assert.match(checked.stdout,/adaptation verified/)
  } finally {
    assert(basename(fixture).startsWith('my-dsh-native-chrome-'))
    assert.equal(dirname(fixture),resolve(tmpdir()))
    await rm(fixture,{recursive:true,force:true})
  }
})

test('native-session-chrome accepts only the complete reviewed platform native composition', async () => {
  const fixture = await mkdtemp(resolve(tmpdir(), 'my-dsh-composed-native-'))
  const run = (...args) => spawnSync(process.execPath, [resolve(root, 'scripts/check-native-session-chrome.mjs'), ...args], { encoding:'utf8', env:{...process.env, DSH_SOURCE:fixture} })
  try {
    await materializeReviewedNativeCombination(fixture, 'native-session-chrome', process.env.DSH_COMPAT_GIT_SOURCE ?? process.env.DSH_SOURCE)
    assert.equal(run().status, 0)
    assert.equal(run('--apply').status, 0)
    const altered = resolve(fixture,manifest.files[0].path)
    const original = await readFile(altered,'utf8')
    await writeFile(altered, original + '\n// unrelated local change\n')
    assert.notEqual(run().status, 0)
    assert.notEqual(run('--apply').status, 0)
    assert.equal(await readFile(altered,'utf8'),original + '\n// unrelated local change\n')
    await writeFile(altered, original)
    const legacy = execFileSync('git', ['-C', process.env.DSH_COMPAT_GIT_SOURCE ?? process.env.DSH_SOURCE, 'show', manifest.baseCommit + ':' + manifest.files[0].path], {encoding:'utf8'})
    await writeFile(altered,legacy)
    assert.notEqual(run().status,0)
    assert.notEqual(run('--apply').status,0)
  } finally {
    assert(basename(fixture).startsWith('my-dsh-composed-native-'))
    assert.equal(dirname(fixture),resolve(tmpdir()))
    await rm(fixture,{recursive:true,force:true})
  }
})
