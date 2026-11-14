import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { maxNoteBytes } from '../src/notes.ts'
import { writeVaultText } from '../src/notes-io.ts'
import { classroomFixture } from './support/fixture.mjs'

async function spaceWithVault(fixture) {
  await fixture.post({ action: 'vault-choose', path: fixture.vault })
  const created = await fixture.post({ action: 'space-create', title: '线性代数' })
  assert.equal(created.status, 200)
  return created.body.spaces[0]
}

test('原子写：同目录暂存文件重命名替换，成功后没有临时文件残留', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const folder = join(fixture.vault, space.directory, '笔记')
    const target = join(folder, '我的笔记.md')
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body
    const before = await readdir(folder)

    const content = '# 我的笔记\n\n原子替换后的完整正文\n'
    const saved = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content, version: read.version })
    assert.equal(saved.status, 200)

    assert.equal(await readFile(target, 'utf8'), content, '磁盘上是完整新正文，不是半截内容')
    const after = await readdir(folder)
    assert.deepEqual(after.sort(), before.sort(), '目录里没有多出暂存文件')
    assert.equal(after.filter(name => name.includes('.tmp')).length, 0)

    const reread = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body
    assert.equal(reread.content, content)
    assert.equal(reread.version, saved.body.version)
  } finally {
    await fixture.close()
  }
})

test('原子写：超过上限的保存被拒绝，原文件逐字保留且不产生暂存文件', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const folder = join(fixture.vault, space.directory, '笔记')
    const target = join(folder, '我的笔记.md')
    const original = await readFile(target, 'utf8')
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body

    await assert.rejects(
      writeVaultText(fixture.vault, `${space.directory}/笔记/我的笔记.md`, 'a'.repeat(maxNoteBytes + 1), {
        actor: 'note-save',
        expectedVersion: read.version,
      }),
      error => error.code === 'note-too-large',
    )

    assert.equal(await readFile(target, 'utf8'), original)
    assert.deepEqual((await readdir(folder)).filter(name => name.includes('.tmp')), [])
  } finally {
    await fixture.close()
  }
})

test('原子写：版本已过期时在落盘前拒绝，不替换也不留暂存文件', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const folder = join(fixture.vault, space.directory, '笔记')
    const target = join(folder, '我的笔记.md')
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body
    const external = '# 外部先写\n'
    const { writeFile } = await import('node:fs/promises')
    await writeFile(target, external, 'utf8')

    const rejected = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: '# 我的\n', version: read.version })
    assert.equal(rejected.status, 409)
    assert.equal(rejected.body.code, 'note-conflict')
    assert.equal(await readFile(target, 'utf8'), external)
    assert.deepEqual((await readdir(folder)).filter(name => name.includes('.tmp')), [])
  } finally {
    await fixture.close()
  }
})
