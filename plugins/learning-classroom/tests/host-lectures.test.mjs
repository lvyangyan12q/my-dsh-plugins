import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classroomFixture } from './support/fixture.mjs'

async function prepare(fixture, title = '概率论') {
  const chosen = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(chosen.status, 200)
  const created = await fixture.post({ action: 'space-create', title })
  assert.equal(created.status, 200)
  return created.body.spaces.find(space => space.title === title)
}

async function addLectures(fixture, space, files) {
  const folder = join(fixture.vault, space.directory, '讲义')
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(folder, name), content, 'utf8')
  }
}

test('目录由讲义文件夹递归推导：子目录是章节，只收 .md/.html，忽略隐藏项并稳定排序', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await addLectures(fixture, space, {
      '02-后讲.md': '---\ntitle: 后讲\norder: 2\n---\n\n# 后讲\n',
      '01-先讲.md': '---\norder: 10\n---\n\n# 先讲\n',
      '03-实验.html': '<!doctype html><h1>实验</h1>',
      'README.txt': '不是讲义',
    })
    await mkdir(join(fixture.vault, space.directory, '讲义', '第一章'))
    await writeFile(join(fixture.vault, space.directory, '讲义', '第一章', '02-基础.md'), '---\ntitle: 基础\norder: 1\n---\n# 基础', 'utf8')
    await writeFile(join(fixture.vault, space.directory, '讲义', '第一章', '01-引言.md'), '# 引言', 'utf8')
    await writeFile(join(fixture.vault, space.directory, '讲义', '第一章', '.草稿.md'), '# 草稿', 'utf8')
    await mkdir(join(fixture.vault, space.directory, '讲义', '.隐藏章节'))
    await writeFile(join(fixture.vault, space.directory, '讲义', '.隐藏章节', '04-隐藏.md'), '# 隐藏', 'utf8')

    const result = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(result.status, 200)
    assert.deepEqual(result.body.lectures, [
      { path: '讲义/02-后讲.md', fileName: '02-后讲.md', title: '后讲', order: 2, kind: 'markdown', chapter: '', source: 'lectures', missing: false },
      { path: '讲义/01-先讲.md', fileName: '01-先讲.md', title: '01-先讲', order: 10, kind: 'markdown', chapter: '', source: 'lectures', missing: false },
      { path: '讲义/03-实验.html', fileName: '03-实验.html', title: '03-实验', order: null, kind: 'experiment', chapter: '', source: 'lectures', missing: false },
      { path: '讲义/第一章/02-基础.md', fileName: '02-基础.md', title: '基础', order: 1, kind: 'markdown', chapter: '第一章', source: 'lectures', missing: false },
      { path: '讲义/第一章/01-引言.md', fileName: '01-引言.md', title: '01-引言', order: null, kind: 'markdown', chapter: '第一章', source: 'lectures', missing: false },
    ])
    assert.equal(result.body.selectedPath, null)
    assert.equal(result.body.missingSelection, null)
    assert.equal(result.body.folderMissing, false)

    // The directory is derived, not stored: listing adds no manifest file, and the
    // only template file is the goal knowledge file.
    assert.deepEqual((await readdir(join(fixture.vault, space.directory))).sort(), ['学习目标.md', '讲义', '笔记', '附件'].sort())
  } finally {
    await fixture.close()
  }
})

test('空空间的目录为空并保留可操作状态；讲义文件夹被删除时明确标记', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '空课')
    const empty = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(empty.status, 200)
    assert.deepEqual(empty.body.lectures, [])
    assert.equal(empty.body.folderMissing, false)

    await rm(join(fixture.vault, space.directory, '讲义'), { recursive: true, force: true })
    const missing = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(missing.status, 200)
    assert.deepEqual(missing.body.lectures, [])
    assert.equal(missing.body.folderMissing, true)
  } finally {
    await fixture.close()
  }
})

test('目录命令仍走同一 HTTP 边界：未知字段与不属于该空间的命令被拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const extra = await fixture.post({ action: 'lecture-list', spaceId: space.id, content: 'x' })
    assert.equal(extra.status, 400)
    assert.equal(extra.body.code, 'invalid-command')

    const unknownSpace = await fixture.post({ action: 'lecture-list', spaceId: '不存在' })
    assert.equal(unknownSpace.status, 409)
    assert.equal(unknownSpace.body.code, 'space-not-found')
  } finally {
    await fixture.close()
  }
})

test('打开讲义返回 Markdown 正文，选择写入插件状态并跨重启恢复', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await addLectures(fixture, space, {
      '01-样本空间.md': '---\ntitle: 样本空间\norder: 1\n---\n\n## 定义\n\n- 随机试验\n- 样本点\n',
      '02-概率.md': '---\ntitle: 概率\norder: 2\n---\n\n# 概率\n',
    })

    const read = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-样本空间.md' })
    assert.equal(read.status, 200)
    assert.equal(read.body.kind, 'markdown')
    assert.equal(read.body.title, '样本空间')
    assert.equal(read.body.content, '---\ntitle: 样本空间\norder: 1\n---\n\n## 定义\n\n- 随机试验\n- 样本点\n')
    assert.equal(read.body.experiment, null)
    assert.equal(read.body.experimentError, null)

    const listed = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(listed.body.selectedPath, '讲义/01-样本空间.md')
    assert.equal(listed.body.missingSelection, null)

    await fixture.restart()
    const restored = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(restored.status, 200)
    assert.equal(restored.body.selectedPath, '讲义/01-样本空间.md')

    // The state file stores navigation only, never the lecture body.
    const stateText = await readFile(fixture.stateFile, 'utf8')
    assert.equal(stateText.includes('随机试验'), false)
    assert.match(stateText, /讲义\/01-样本空间\.md/)
  } finally {
    await fixture.close()
  }
})

test('旧式 HTML/脚本实验不执行、不混入 Markdown 正文，保留路径与可读提示', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await addLectures(fixture, space, {
      '01-实验.html': '---\norder: 1\ntitle: 直觉实验\n---\n<!doctype html><script>alert(1)</script>',
    })
    const read = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-实验.html' })
    assert.equal(read.status, 200)
    assert.equal(read.body.kind, 'experiment')
    assert.equal(read.body.title, '直觉实验')
    assert.equal(read.body.content, null)
    assert.equal(read.body.experiment, null)
    assert.match(read.body.experimentError, /旧式|任意|脚本|不执行|重新生成/)
    assert.deepEqual(read.body.sources, [])
    assert.deepEqual(read.body.parameters, [])
    assert.equal(read.body.version, null)

    const listed = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(listed.body.selectedPath, '讲义/01-实验.html')
  } finally {
    await fixture.close()
  }
})

test('讲义被外部改名后刷新：旧路径提示缺失，新文件出现在目录并可打开', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await addLectures(fixture, space, { '01-旧课.md': '# 旧课\n' })
    const first = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-旧课.md' })
    assert.equal(first.status, 200)

    await rename(
      join(fixture.vault, space.directory, '讲义', '01-旧课.md'),
      join(fixture.vault, space.directory, '讲义', '02-新课.md'),
    )
    const listed = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(listed.status, 200)
    assert.equal(listed.body.selectedPath, null)
    assert.equal(listed.body.missingSelection, '讲义/01-旧课.md')
    assert.deepEqual(listed.body.lectures.map(row => row.path), ['讲义/02-新课.md'])

    const stale = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-旧课.md' })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.code, 'lecture-missing')

    const renamed = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/02-新课.md' })
    assert.equal(renamed.status, 200)
    assert.match(renamed.body.content, /旧课/)
  } finally {
    await fixture.close()
  }
})

test('讲义被外部删除后目录给出缺失提示并清空选择，直接读取返回可操作错误', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await addLectures(fixture, space, { '01-会消失.md': '# 会消失\n', '02-留下.md': '# 留下\n' })
    const read = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-会消失.md' })
    assert.equal(read.status, 200)

    await rm(join(fixture.vault, space.directory, '讲义', '01-会消失.md'))
    const first = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(first.status, 200)
    assert.equal(first.body.selectedPath, null)
    assert.equal(first.body.missingSelection, '讲义/01-会消失.md')
    assert.deepEqual(first.body.lectures.map(row => row.path), ['讲义/02-留下.md'])

    const second = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(second.body.missingSelection, null)
    assert.equal(second.body.selectedPath, null)

    const stale = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-会消失.md' })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.code, 'lecture-missing')
    assert.match(stale.body.error, /删除|不存在/)
  } finally {
    await fixture.close()
  }
})

test('讲义正文带内容版本：同文同版本，外部改文后版本变化，实验不冒充正文版本', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const content = '---\ntitle: 版本\n---\n\n# 版本\n\n第一版正文\n'
    await addLectures(fixture, space, { '01-版本.md': content, '02-实验.html': '<!doctype html><h1>实验</h1>' })

    const first = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-版本.md' })
    assert.equal(first.status, 200)
    assert.match(first.body.version, /^[0-9a-f]{64}$/)
    assert.equal(first.body.version, createHash('sha256').update(content, 'utf8').digest('hex'))

    // Re-reading unchanged content keeps the exact same frozen version.
    const again = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-版本.md' })
    assert.equal(again.body.version, first.body.version)

    await writeFile(join(fixture.vault, space.directory, '讲义', '01-版本.md'), `${content}第二版补充\n`, 'utf8')
    const changed = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/01-版本.md' })
    assert.equal(changed.status, 200)
    assert.notEqual(changed.body.version, first.body.version)

    // An experiment body is never inlined, so the Host does not claim a body version.
    const experiment = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/02-实验.html' })
    assert.equal(experiment.status, 200)
    assert.equal(experiment.body.version, null)
  } finally {
    await fixture.close()
  }
})

test('讲义路径被限制在该空间讲义目录内，章节子目录可正常打开', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await writeFile(join(fixture.vault, '外部秘密.md'), '# 秘密', 'utf8')
    await mkdir(join(fixture.vault, space.directory, '讲义', '第一章'))
    await writeFile(join(fixture.vault, space.directory, '讲义', '第一章', '01-章节.md'), '# 章节\n', 'utf8')

    const nested = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: '讲义/第一章/01-章节.md' })
    assert.equal(nested.status, 200)
    assert.equal(nested.body.path, '讲义/第一章/01-章节.md')
    assert.match(nested.body.content, /章节/)

    for (const path of ['../外部秘密.md', '笔记/我的笔记.md', '讲义/说明.txt', `${space.directory}/笔记/我的笔记.md`, '讲义/.隐藏.md']) {
      const result = await fixture.post({ action: 'lecture-read', spaceId: space.id, path })
      assert.equal(result.status, 400, `${path} 应被拒绝`)
      assert.equal(result.body.code, 'lecture-invalid')
    }
  } finally {
    await fixture.close()
  }
})
