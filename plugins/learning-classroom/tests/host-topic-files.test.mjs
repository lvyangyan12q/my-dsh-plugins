import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classroomFixture } from './support/fixture.mjs'

async function prepare(fixture, title = '概率论', goal = '') {
  const chosen = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(chosen.status, 200)
  const created = await fixture.post({ action: 'space-create', title, goal })
  assert.equal(created.status, 200)
  return created.body.spaces.find(space => space.title === title)
}

async function addExisting(fixture, space, relative, content) {
  const file = join(fixture.vault, space.directory, relative)
  await mkdir(join(file, '..'), { recursive: true })
  await writeFile(file, content, 'utf8')
  return file
}

async function exists(path) {
  try { await stat(path); return true } catch { return false }
}

test('关联已有主题内文件：不复制不移动，重启后保留，取消关联不改原文件', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const original = await addExisting(fixture, space, '资料/概率入门.md', '---\ntitle: 概率入门\norder: 4\n---\n\n# 概率\n\n已有正文。\n')

    const candidates = await fixture.post({ action: 'lecture-candidates', spaceId: space.id })
    assert.equal(candidates.status, 200)
    assert.deepEqual(candidates.body.files, [
      { path: '资料/概率入门.md', fileName: '概率入门.md', title: '概率入门', chapter: '资料' },
    ])
    assert.equal(candidates.body.truncated, false)

    const linked = await fixture.post({ action: 'lecture-link', spaceId: space.id, path: '资料/概率入门.md' })
    assert.equal(linked.status, 200)
    assert.deepEqual(linked.body.lectures, [
      {
        path: '资料/概率入门.md',
        fileName: '概率入门.md',
        title: '概率入门',
        order: 4,
        kind: 'markdown',
        chapter: '资料',
        source: 'linked',
        missing: false,
      },
    ])

    // The file stays exactly where the learner had it: nothing was copied or moved.
    assert.equal(await readFile(original, 'utf8'), '---\ntitle: 概率入门\norder: 4\n---\n\n# 概率\n\n已有正文。\n')
    assert.equal(await exists(join(fixture.vault, space.directory, '讲义', '概率入门.md')), false)

    const after = await fixture.post({ action: 'lecture-candidates', spaceId: space.id })
    assert.deepEqual(after.body.files, [])

    const read = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '资料/概率入门.md' })
    assert.equal(read.status, 200)
    assert.match(read.body.content, /已有正文/)

    await fixture.restart()
    const restored = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(restored.body.lectures.length, 1)
    assert.equal(restored.body.lectures[0].source, 'linked')
    assert.equal(restored.body.selectedPath, '资料/概率入门.md')

    const unlinked = await fixture.post({ action: 'lecture-unlink', spaceId: space.id, path: '资料/概率入门.md' })
    assert.equal(unlinked.status, 200)
    assert.deepEqual(unlinked.body.lectures, [])
    // Removing the open link clears the stored selection so no dangling path remains.
    assert.equal(unlinked.body.selectedPath, null)
    assert.equal(await exists(original), true)
  } finally {
    await fixture.close()
  }
})

test('关联文件被外部删除后仍显示缺失项并明确标记，取消关联可清理', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const original = await addExisting(fixture, space, '资料/会消失.md', '# 会消失\n')
    const linked = await fixture.post({ action: 'lecture-link', spaceId: space.id, path: '资料/会消失.md' })
    assert.equal(linked.status, 200)

    await rm(original)
    const list = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.lectures.map(row => [row.path, row.title, row.missing, row.source]), [
      ['资料/会消失.md', '会消失', true, 'linked'],
    ])
    assert.equal(list.body.missingSelection, null)

    const stale = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '资料/会消失.md' })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.code, 'lecture-missing')

    const removed = await fixture.post({ action: 'lecture-unlink', spaceId: space.id, path: '资料/会消失.md' })
    assert.equal(removed.status, 200)
    assert.deepEqual(removed.body.lectures, [])
  } finally {
    await fixture.close()
  }
})

test('候选文件排除讲义、笔记、附件、目标文件与隐藏项，只接受空间内真实 .md/.html', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '概率论', '先学会条件概率。')
    await addExisting(fixture, space, '讲义/01-已有讲义.md', '# 讲义\n')
    await addExisting(fixture, space, '笔记/我的笔记.md', '# 笔记\n')
    await addExisting(fixture, space, '附件/说明.md', '# 附件\n')
    await addExisting(fixture, space, '资料/.隐藏.md', '# 隐藏\n')
    await addExisting(fixture, space, '资料/图.png', 'not markdown')
    await addExisting(fixture, space, '资料/实验.html', '<!doctype html>')

    const candidates = await fixture.post({ action: 'lecture-candidates', spaceId: space.id })
    assert.equal(candidates.status, 200)
    assert.deepEqual(candidates.body.files.map(file => file.path), ['资料/实验.html'])
  } finally {
    await fixture.close()
  }
})

test('关联负例：越界、笔记、目标文件、讲义内文件、隐藏与不存在都被拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '概率论', '目标正文')
    await addExisting(fixture, space, '讲义/01-已有.md', '# 已有\n')
    await addExisting(fixture, space, '资料/没有关系.md', '# 在\n')
    await writeFile(join(fixture.vault, '外部秘密.md'), '# 秘密', 'utf8')

    const cases = [
      ['../外部秘密.md', 400, 'lecture-invalid'],
      ['笔记/我的笔记.md', 400, 'lecture-invalid'],
      ['附件/说明.md', 400, 'lecture-invalid'],
      ['学习目标.md', 400, 'lecture-invalid'],
      ['资料/.隐藏.md', 400, 'lecture-invalid'],
      ['讲义/01-已有.md', 409, 'lecture-already-listed'],
      ['资料/不存在.md', 409, 'lecture-missing'],
      [`${space.directory}/资料/没有关系.md`, 409, 'lecture-missing'],
    ]
    for (const [path, status, code] of cases) {
      const result = await fixture.post({ action: 'lecture-link', spaceId: space.id, path })
      assert.equal(result.status, status, `${path} 的状态`)
      assert.equal(result.body.code, code, `${path} 的错误码：${result.body.error}`)
    }

    const unknownSpace = await fixture.post({ action: 'lecture-link', spaceId: '不存在', path: '资料/没有关系.md' })
    assert.equal(unknownSpace.status, 409)
    assert.equal(unknownSpace.body.code, 'space-not-found')

    const extra = await fixture.post({ action: 'lecture-link', spaceId: space.id, path: '资料/没有关系.md', content: 'x' })
    assert.equal(extra.status, 400)
    assert.equal(extra.body.code, 'invalid-command')

    // The directory only ever lists what was actually linked.
    const list = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.deepEqual(list.body.lectures.map(row => row.path), ['讲义/01-已有.md'])
  } finally {
    await fixture.close()
  }
})

test('讲义根目录的符号链接必须仍在本主题内：指向其他主题时拒绝且不泄露其标题', async t => {
  const fixture = await classroomFixture()
  try {
    const first = await prepare(fixture, '主题甲')
    const second = await prepare(fixture, '主题乙')
    const otherLecture = join(fixture.vault, second.directory, '讲义', '别人的讲义.md')
    await writeFile(otherLecture, '---\ntitle: 别人的标题\n---\n# 秘密\n', 'utf8')

    // Replace 甲/讲义 with a junction to 乙/讲义, i.e. still inside the vault.
    await rm(join(fixture.vault, first.directory, '讲义'), { recursive: true, force: true })
    let linked = false
    try {
      await symlink(
        join(fixture.vault, second.directory, '讲义'),
        join(fixture.vault, first.directory, '讲义'),
        'junction',
      )
      linked = true
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') { t.skip('当前环境不允许创建目录链接'); return }
      throw error
    }
    assert.equal(linked, true)

    const result = await fixture.post({ action: 'lecture-list', spaceId: first.id })
    assert.equal(result.status, 409)
    assert.equal(result.body.code, 'lecture-folder-outside')
    assert.match(result.body.error, /符号链接|学习空间/)
    assert.equal(JSON.stringify(result.body).includes('别人的标题'), false)

    const read = await fixture.post({ action: 'lecture-read', spaceId: first.id, path: '讲义/别人的讲义.md' })
    assert.equal(read.status, 400)
    assert.equal(read.body.code, 'lecture-invalid')

    // A junction that stays inside the same topic is allowed: containment, not a ban.
    await rm(join(fixture.vault, first.directory, '讲义'), { recursive: true, force: true })
    await mkdir(join(fixture.vault, first.directory, '真实讲义'))
    await writeFile(join(fixture.vault, first.directory, '真实讲义', '01-本主题.md'), '# 本主题\n', 'utf8')
    await symlink(
      join(fixture.vault, first.directory, '真实讲义'),
      join(fixture.vault, first.directory, '讲义'),
      'junction',
    )
    const allowed = await fixture.post({ action: 'lecture-list', spaceId: first.id })
    assert.equal(allowed.status, 200)
    assert.deepEqual(allowed.body.lectures.map(row => row.path), ['讲义/01-本主题.md'])
  } finally {
    await fixture.close()
  }
})

test('符号链接指向空间外时，关联与目录遍历都不跟随', async t => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const outside = join(fixture.folder, '空间外')
    await mkdir(outside)
    await writeFile(join(outside, '秘密.md'), '# 秘密\n', 'utf8')
    let linked = false
    try {
      await symlink(outside, join(fixture.vault, space.directory, '链接'), 'junction')
      linked = true
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') { t.skip('当前环境不允许创建目录链接'); return }
      throw error
    }
    assert.equal(linked, true)

    const denied = await fixture.post({ action: 'lecture-link', spaceId: space.id, path: '链接/秘密.md' })
    assert.equal(denied.status, 400)
    assert.equal(denied.body.code, 'lecture-invalid')

    const candidates = await fixture.post({ action: 'lecture-candidates', spaceId: space.id })
    assert.equal(candidates.status, 200)
    assert.deepEqual(candidates.body.files, [])

    // A link planted inside 讲义/ is not followed by the directory walk either.
    await symlink(outside, join(fixture.vault, space.directory, '讲义', '章节链接'), 'junction')
    const list = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(list.status, 200)
    assert.deepEqual(list.body.lectures, [])
  } finally {
    await fixture.close()
  }
})
