import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { resolve, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packRelease } from '../scripts/release-archive.mjs'
import { ownedRoot, isolatedEnv, runNode } from '../scripts/release-tools.mjs'

const worktree = fileURLToPath(new URL('..', import.meta.url))
test('actual archive excludes synthetic maps/checks/private-file markers and retains public teaching/image assets', async () => {
  const root = await ownedRoot(worktree, join(worktree, '.scratch', 'archive-fixture-' + Date.now()))
  const env = await isolatedEnv(root)
  const original = join(worktree, 'plugins/kaogong'), clone = join(root, 'package')
  await cp(original, clone, { recursive: true, filter: path => !relative(original, path).split(/[\\/]/).some(segment => ['node_modules', '.checks', 'typecheck', 'npm-cache'].includes(segment)) })
  for (const file of ['lib/stale.map', 'lib/typecheck/absolute.json', '.checks/generated.json', 'storage/mineru/private.pdf', 'data/private-bank.json', 'roles/cordis.yml', '题目_images/verified/private.pdf', '题目_images/verified/unreviewed.png', '.env']) {
    const path = join(clone, file); await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, 'TICKET11_SYNTHETIC_EXCLUSION')
  }
  const packed = await packRelease(clone, join(root, 'archives'), env)
  assert(packed.files.includes('lib/types/index.d.ts'))
  assert(packed.files.includes('roles/skills/kaogong-teach/SKILL.md'))
  assert.equal(packed.files.filter(file => file.startsWith('题目_images/')).length, 2)
  assert.equal(packed.files.filter(file => file.startsWith('roles/personas/')).length, 3)
  for (const file of packed.files) assert(!String(await readFile(join(clone, file))).includes('TICKET11_SYNTHETIC_EXCLUSION'))
  await writeFile(join(clone, 'lib/unreferenced-old.mjs'), 'export const stale = true\n')
  await assert.rejects(packRelease(clone, join(root, 'stale-archives'), env), /Stale\/unreferenced/)
})

test('release fixture root refuses the workspace root and previously allocated directories without purging', async () => {
  await assert.rejects(ownedRoot(worktree, worktree), /strict child/)
  const root = join(worktree, '.scratch', 'root-fixture-' + Date.now())
  await ownedRoot(worktree, root)
  await writeFile(join(root, 'retain.txt'), 'synthetic durable data')
  await assert.rejects(ownedRoot(worktree, root), /EEXIST/)
  assert.equal(await readFile(join(root, 'retain.txt'), 'utf8'), 'synthetic durable data')
})

test('owned installer timeout terminates and awaits its child tree', async () => {
  const root = await ownedRoot(worktree, join(worktree, '.scratch', 'timeout-fixture-' + Date.now()))
  const env = await isolatedEnv(root), pidFile = join(root, 'child.pid')
  await assert.rejects(runNode(['-e', `const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'inherit' }); require('node:fs').writeFileSync(process.argv[1], String(child.pid)); setInterval(() => {}, 1000)`, pidFile], { cwd: root, env, timeout: 1500 }), /timedOut=true/)
  const pid = Number(await readFile(pidFile, 'utf8'))
  await new Promise(yes => setTimeout(yes, 100))
  assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' })
})
