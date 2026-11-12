import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { writeVaultText } from '../src/notes-io.ts'
import { classroomFixture } from './support/fixture.mjs'

// SHA-256 of the files written by the fixture, frozen here as known-good values.
const defaultNoteVersion = '5442b024786f9c067a36eec5c31384dc667a77df2d2fe7593d5b0beae1917479'

async function spaceWithVault(fixture, title = '线性代数') {
  await fixture.post({ action: 'vault-choose', path: fixture.vault })
  const created = await fixture.post({ action: 'space-create', title })
  assert.equal(created.status, 200)
  return created.body.spaces[0]
}

test('笔记列表读出 笔记/ 下的 Markdown，读取返回磁盘内容与内容哈希版本', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    await writeFile(join(fixture.vault, space.directory, '笔记', '第二份.md'), '# 第二\n', 'utf8')

    const list = await fixture.post({ action: 'note-list', spaceId: space.id })
    assert.equal(list.status, 200)
    assert.equal(list.body.defaultPath, '笔记/我的笔记.md')
    assert.deepEqual(list.body.notes.map(note => note.path), ['笔记/我的笔记.md', '笔记/第二份.md'])
    assert.equal(list.body.notes.some(note => note.path === '笔记/读完.txt'), false)

    const read = await fixture.post({ action: 'note-read', spaceId: space.id, path: '笔记/我的笔记.md' })
    assert.equal(read.status, 200)
    assert.equal(read.body.path, '笔记/我的笔记.md')
    assert.equal(read.body.content, '# 我的笔记\n\n')
    assert.equal(read.body.version, defaultNoteVersion)

    const missing = await fixture.post({ action: 'note-read', spaceId: space.id, path: '笔记/不存在.md' })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.code, 'note-not-found')
    assert.match(missing.body.error, /不存在/)
  } finally {
    await fixture.close()
  }
})

test('保存笔记把内容原子写入磁盘，版本随内容更新，重读与文件一致', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const noteFile = join(fixture.vault, space.directory, '笔记', '我的笔记.md')
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body

    const content = '# 我的笔记\n\n我自己的理解\n'
    const saved = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content, version: read.version })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.path, '笔记/我的笔记.md')
    // Known-good SHA-256 of `content`, computed independently.
    assert.equal(saved.body.version, 'c49ef9124c6014a8c3b6468800c653b6b19a6eddd0c3feea90b3795b0d40fe3f')

    assert.equal(await readFile(noteFile, 'utf8'), content)
    const reread = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body
    assert.equal(reread.content, content)
    assert.equal(reread.version, saved.body.version)

    const missingVersion = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: 'x' })
    assert.equal(missingVersion.status, 400)
    assert.equal(missingVersion.body.code, 'invalid-command')
    assert.equal(await readFile(noteFile, 'utf8'), content)
  } finally {
    await fixture.close()
  }
})

test('外部修改后保存被拒绝且不静默覆盖；显式覆盖才用我的内容替换', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const noteFile = join(fixture.vault, space.directory, '笔记', '我的笔记.md')
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body

    const external = '# 外部版本\n\n在 Obsidian 里改的\n'
    await writeFile(noteFile, external, 'utf8')

    const rejected = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: '# 我的新版本\n', version: read.version })
    assert.equal(rejected.status, 409)
    assert.equal(rejected.body.code, 'note-conflict')
    assert.match(rejected.body.error, /外部修改|重新加载/)
    assert.equal(await readFile(noteFile, 'utf8'), external)

    const overwritten = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: '# 我的新版本\n', version: read.version, overwrite: true })
    assert.equal(overwritten.status, 200)
    assert.equal(await readFile(noteFile, 'utf8'), '# 我的新版本\n')

    const reloaded = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body
    assert.equal(reloaded.content, '# 我的新版本\n')
    assert.equal(reloaded.version, overwritten.body.version)
  } finally {
    await fixture.close()
  }
})

test('真 Host 校版本：空正文也必须在外部修改后报冲突，空版本直接拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const noteFile = join(fixture.vault, space.directory, '笔记', '我的笔记.md')
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body
    const external = '# 外部内容\n\n不能被空正文清空\n'
    await writeFile(noteFile, external, 'utf8')

    const emptyWithOldVersion = await fixture.post({
      action: 'note-save',
      spaceId: space.id,
      path: space.notePath,
      content: '',
      version: read.version,
    })
    assert.equal(emptyWithOldVersion.status, 409)
    assert.equal(emptyWithOldVersion.body.code, 'note-conflict')
    assert.equal(await readFile(noteFile, 'utf8'), external, '外部正文不被空内容覆盖')

    const emptyVersion = await fixture.post({
      action: 'note-save',
      spaceId: space.id,
      path: space.notePath,
      content: '',
      version: '',
    })
    assert.equal(emptyVersion.status, 400)
    assert.equal(emptyVersion.body.code, 'invalid-command')
    assert.equal(await readFile(noteFile, 'utf8'), external, '空版本不得清空文件')
  } finally {
    await fixture.close()
  }
})

test('笔记目录被删后读取给出可操作原因，保存失败且不在半路创建目录', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body
    await rm(join(fixture.vault, space.directory, '笔记'), { recursive: true, force: true })

    const listed = await fixture.post({ action: 'note-list', spaceId: space.id })
    assert.equal(listed.status, 409)
    assert.equal(listed.body.code, 'notes-unavailable')
    assert.match(listed.body.error, /不存在/)

    const readAgain = await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })
    assert.equal(readAgain.status, 404)
    assert.equal(readAgain.body.code, 'note-not-found')

    const saved = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: '# 新内容\n', version: read.version })
    assert.equal(saved.status, 409)
    assert.match(saved.body.error, /目录不存在/)
    assert.equal(saved.body.code === 'note-conflict', false, '目录缺失不是静默重建，也不是可覆盖的冲突')
    await assert.rejects(readFile(join(fixture.vault, space.directory, '笔记', '我的笔记.md'), 'utf8'))
  } finally {
    await fixture.close()
  }
})

test('笔记文件被外部删除后保存报冲突，用我的覆盖可以重新创建', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const noteFile = join(fixture.vault, space.directory, '笔记', '我的笔记.md')
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body
    await rm(noteFile)

    const rejected = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: '# 重建\n', version: read.version })
    assert.equal(rejected.status, 409)
    assert.equal(rejected.body.code, 'note-conflict')
    assert.match(rejected.body.error, /不存在|外部/)

    const recreated = await fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: '# 重建\n', version: read.version, overwrite: true })
    assert.equal(recreated.status, 200)
    assert.equal(await readFile(noteFile, 'utf8'), '# 重建\n')
  } finally {
    await fixture.close()
  }
})

test('并发保存同一笔记串行化：只有一个成功，另一个明确冲突，磁盘不混合内容', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const noteFile = join(fixture.vault, space.directory, '笔记', '我的笔记.md')
    const read = (await fixture.post({ action: 'note-read', spaceId: space.id, path: space.notePath })).body

    const [first, second] = await Promise.all([
      fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: '# 甲\n', version: read.version }),
      fixture.post({ action: 'note-save', spaceId: space.id, path: space.notePath, content: '# 乙\n', version: read.version }),
    ])
    const statuses = [first.status, second.status].sort()
    assert.deepEqual(statuses, [200, 409])
    const failed = first.status === 409 ? first : second
    assert.equal(failed.body.code, 'note-conflict')
    const winner = first.status === 200 ? '# 甲\n' : '# 乙\n'
    assert.equal(await readFile(noteFile, 'utf8'), winner)

    // No staging file survives a save.
    const entries = await readdir(join(fixture.vault, space.directory, '笔记'))
    assert.deepEqual(entries.filter(name => name.endsWith('.tmp')), [])
  } finally {
    await fixture.close()
  }
})

test('笔记命令拒绝越出 笔记/ 或知识库根的路径，不写任何文件', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const original = await readFile(join(fixture.vault, space.directory, '笔记', '我的笔记.md'), 'utf8')
    for (const path of ['讲义/01.md', '笔记/../讲义/01.md', '../笔记/我的笔记.md', '笔记/我的笔记.txt', 'D:/笔记/我的笔记.md']) {
      const result = await fixture.post({ action: 'note-save', spaceId: space.id, path, content: 'hack', version: 'x' })
      assert.equal(result.status, 400, `${path} 应被拒绝`)
      assert.equal(result.body.code, 'note-path-invalid')
    }
    const traversal = await fixture.post({ action: 'note-read', spaceId: space.id, path: '笔记/../../outside.md' })
    assert.equal(traversal.status, 400)
    assert.equal(traversal.body.code, 'note-path-invalid')
    assert.equal(await readFile(join(fixture.vault, space.directory, '笔记', '我的笔记.md'), 'utf8'), original)
  } finally {
    await fixture.close()
  }
})

test('老师写入 笔记/ 的守卫在落盘前拒绝，原笔记不被破坏', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await spaceWithVault(fixture)
    const noteFile = join(fixture.vault, space.directory, '笔记', '我的笔记.md')
    const original = await readFile(noteFile, 'utf8')
    await assert.rejects(
      writeVaultText(fixture.vault, `${space.directory}/笔记/我的笔记.md`, '老师覆盖', { actor: 'teacher', overwrite: true }),
      error => error.code === 'note-write-forbidden',
    )
    assert.equal(await readFile(noteFile, 'utf8'), original)

    const lecture = await writeVaultText(fixture.vault, `${space.directory}/讲义/01-第一课.md`, '# 第一课\n', { actor: 'teacher' })
    assert.equal(lecture.path, `${space.directory}/讲义/01-第一课.md`)
    assert.equal(await readFile(join(fixture.vault, lecture.path), 'utf8'), '# 第一课\n')
  } finally {
    await fixture.close()
  }
})
