import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { maxTopicBytes } from '../src/spaces.ts'
import { classroomFixture } from './support/fixture.mjs'

async function prepare(fixture, title = '概率论', goal = '先学会条件概率。') {
  const chosen = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(chosen.status, 200)
  const created = await fixture.post({ action: 'space-create', title, goal })
  assert.equal(created.status, 200)
  return created.body.spaces.find(space => space.title === title)
}

test('主题目标存为知识文件：创建时写入、Obsidian 读同一份、跨重启保留，且不改写整个 Vault', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '概率论', '能独立完成条件概率题。')
    const goalFile = join(fixture.vault, space.directory, '学习目标.md')
    assert.equal(await readFile(goalFile, 'utf8'), '能独立完成条件概率题。')

    // The default template touches only its own new topic folder: no vault-wide
    // rewrite and no Obsidian configuration.
    assert.deepEqual((await readdir(fixture.vault)), [space.directory])

    const topic = await fixture.post({ action: 'topic-read', spaceId: space.id })
    assert.equal(topic.status, 200)
    assert.deepEqual(
      { path: topic.body.path, title: topic.body.title, goal: topic.body.goal, fileMissing: topic.body.fileMissing },
      { path: '学习目标.md', title: '概率论', goal: '能独立完成条件概率题。', fileMissing: false },
    )
    assert.equal(typeof topic.body.version, 'string')
    assert.equal(typeof topic.body.updatedAt, 'string')

    // A write from another editor is what the classroom reads back: one file, not a copy.
    await writeFile(goalFile, '从 Obsidian 改写的目标。', 'utf8')
    const reread = await fixture.post({ action: 'topic-read', spaceId: space.id })
    assert.equal(reread.body.goal, '从 Obsidian 改写的目标。')

    await fixture.restart()
    const restored = await fixture.post({ action: 'topic-read', spaceId: space.id })
    assert.equal(restored.body.goal, '从 Obsidian 改写的目标。')
  } finally {
    await fixture.close()
  }
})

test('外部修改后保存被拒绝并保留磁盘内容，重新加载后可保存', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '概率论', '旧目标')
    const goalFile = join(fixture.vault, space.directory, '学习目标.md')
    const original = await fixture.post({ action: 'topic-read', spaceId: space.id })
    const staleVersion = original.body.version

    // External edit in Obsidian after the learner opened the topic.
    await writeFile(goalFile, 'Obsidian 新目标', 'utf8')
    const refused = await fixture.post({ action: 'topic-save', spaceId: space.id, goal: '我想覆盖的新目标', version: staleVersion })
    assert.equal(refused.status, 409)
    assert.equal(refused.body.code, 'topic-conflict')
    assert.match(refused.body.error, /外部修改|重新加载/)
    assert.equal(await readFile(goalFile, 'utf8'), 'Obsidian 新目标')

    const reloaded = await fixture.post({ action: 'topic-read', spaceId: space.id })
    const saved = await fixture.post({ action: 'topic-save', spaceId: space.id, goal: '保存后的目标', version: reloaded.body.version })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.goal, '保存后的目标')
    assert.notEqual(saved.body.version, staleVersion)
    assert.equal(await readFile(goalFile, 'utf8'), '保存后的目标')
  } finally {
    await fixture.close()
  }
})

test('目标文件被外部删除后可读为缺失状态，保存与重新创建都有明确规则', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '概率论', '会消失的目标')
    const goalFile = join(fixture.vault, space.directory, '学习目标.md')
    const before = await fixture.post({ action: 'topic-read', spaceId: space.id })

    await rm(goalFile)
    const missing = await fixture.post({ action: 'topic-read', spaceId: space.id })
    assert.equal(missing.status, 200)
    assert.equal(missing.body.fileMissing, true)
    assert.equal(missing.body.goal, '')
    assert.equal(missing.body.version, null)
    assert.equal(missing.body.updatedAt, null)
    assert.match(missing.body.path, /学习目标\.md/)

    const staleSave = await fixture.post({ action: 'topic-save', spaceId: space.id, goal: '重新写', version: before.body.version })
    assert.equal(staleSave.status, 409)
    assert.equal(staleSave.body.code, 'topic-conflict')
    assert.equal(await readFile(goalFile, 'utf8').catch(() => null), null)

    const recreated = await fixture.post({ action: 'topic-save', spaceId: space.id, goal: '重新写', version: null })
    assert.equal(recreated.status, 200)
    assert.equal(recreated.body.fileMissing, false)
    assert.equal(recreated.body.goal, '重新写')
    assert.equal(await readFile(goalFile, 'utf8'), '重新写')
  } finally {
    await fixture.close()
  }
})

test('保存目标前做类型与大小限制：超大文件与目录被明确拒绝，不整份读取', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const goalFile = join(fixture.vault, space.directory, '学习目标.md')
    const before = await fixture.post({ action: 'topic-read', spaceId: space.id })

    await writeFile(goalFile, 'x'.repeat(maxTopicBytes + 1024), 'utf8')
    const readHuge = await fixture.post({ action: 'topic-read', spaceId: space.id })
    assert.equal(readHuge.status, 413)
    assert.equal(readHuge.body.code, 'topic-too-large')

    // The version read earlier is now stale, but size must be refused before any
    // conflict logic or full-file read: the cap is about resource safety first.
    const saveHuge = await fixture.post({ action: 'topic-save', spaceId: space.id, goal: '新目标', version: before.body.version })
    assert.equal(saveHuge.status, 413)
    assert.equal(saveHuge.body.code, 'topic-too-large')

    await rm(goalFile)
    await mkdir(goalFile)
    const saveDirectory = await fixture.post({ action: 'topic-save', spaceId: space.id, goal: '新目标', version: before.body.version })
    assert.equal(saveDirectory.status, 409)
    assert.equal(saveDirectory.body.code, 'topic-unavailable')
    assert.match(saveDirectory.body.error, /不是文件/)
    // A refused save leaves the path untouched (still the directory the learner made).
    assert.equal((await readdir(goalFile)).length, 0)
  } finally {
    await fixture.close()
  }
})

test('目标保存沿用 HTTP 边界：未知字段、过大内容与不可用空间都被明确拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const topic = await fixture.post({ action: 'topic-read', spaceId: space.id })

    const extra = await fixture.post({ action: 'topic-save', spaceId: space.id, goal: 'x', version: topic.body.version, path: 'x' })
    assert.equal(extra.status, 400)
    assert.equal(extra.body.code, 'invalid-command')

    const huge = await fixture.post({ action: 'topic-save', spaceId: space.id, goal: 'x'.repeat(maxTopicBytes + 1), version: topic.body.version })
    assert.equal(huge.status, 400)
    assert.equal(huge.body.code, 'invalid-command')

    const unknown = await fixture.post({ action: 'topic-read', spaceId: '不存在' })
    assert.equal(unknown.status, 409)
    assert.equal(unknown.body.code, 'space-not-found')

    await rm(join(fixture.vault, space.directory), { recursive: true, force: true })
    const gone = await fixture.post({ action: 'topic-read', spaceId: space.id })
    assert.equal(gone.status, 409)
    assert.equal(gone.body.code, 'space-unavailable')
  } finally {
    await fixture.close()
  }
})
