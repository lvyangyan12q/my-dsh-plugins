import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { maxSummaryBytes } from '../src/summary.ts'
import { classroomFixture } from './support/fixture.mjs'

async function prepare(fixture, title = '概率论', goal = '') {
  const chosen = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(chosen.status, 200)
  const created = await fixture.post(goal === ''
    ? { action: 'space-create', title }
    : { action: 'space-create', title, goal })
  assert.equal(created.status, 200)
  return created.body.spaces.find(space => space.title === title)
}

test('学习小结与下一步是普通知识文件：同一份内容可被 Obsidian 读取，跨重启保留', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const empty = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(empty.status, 200)
    assert.deepEqual(
      {
        path: empty.body.path,
        summary: empty.body.summary,
        nextStep: empty.body.nextStep,
        version: empty.body.version,
        fileMissing: empty.body.fileMissing,
      },
      { path: '学习小结.md', summary: '', nextStep: '', version: null, fileMissing: true },
    )

    const saved = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '理解了条件概率的定义。',
      nextStep: '做三道条件概率练习。',
      version: null,
    })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.summary, '理解了条件概率的定义。')
    assert.equal(saved.body.nextStep, '做三道条件概率练习。')
    assert.equal(saved.body.fileMissing, false)
    assert.equal(typeof saved.body.version, 'string')
    assert.equal(typeof saved.body.updatedAt, 'string')

    // One ordinary file in the topic folder: readable as plain Markdown, no
    // plugin-private format and no second copy in plugin state.
    const summaryFile = join(fixture.vault, space.directory, '学习小结.md')
    const disk = await readFile(summaryFile, 'utf8')
    assert.match(disk, /^# 学习小结/m)
    assert.match(disk, /^## 本次小结$/m)
    assert.match(disk, /^## 下一步$/m)
    assert.ok(disk.includes('理解了条件概率的定义。'))
    assert.ok(disk.includes('做三道条件概率练习。'))

    // An edit made in Obsidian is what the classroom reads back.
    await writeFile(summaryFile, '# 学习小结\n\n## 本次小结\n\n从 Obsidian 改写的小结。\n\n## 下一步\n\n复习。\n', 'utf8')
    const reread = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(reread.body.summary, '从 Obsidian 改写的小结。')
    assert.equal(reread.body.nextStep, '复习。')

    await fixture.restart()
    const restored = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(restored.body.summary, '从 Obsidian 改写的小结。')
    assert.equal(restored.body.nextStep, '复习。')
  } finally {
    await fixture.close()
  }
})

test('小结被外部修改后保存被拒绝并保留磁盘内容，重新加载后可保存', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const summaryFile = join(fixture.vault, space.directory, '学习小结.md')
    const first = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '第一版小结',
      nextStep: '第一步',
      version: null,
    })
    assert.equal(first.status, 200)

    await writeFile(summaryFile, '# 学习小结\n\n## 本次小结\n\nObsidian 的新内容\n', 'utf8')
    const stale = first.body.version
    const refused = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '想覆盖的新小结',
      nextStep: '新一步',
      version: stale,
    })
    assert.equal(refused.status, 409)
    assert.equal(refused.body.code, 'summary-conflict')
    assert.match(refused.body.error, /外部修改|重新加载/)
    assert.match(await readFile(summaryFile, 'utf8'), /Obsidian 的新内容/)

    const reloaded = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(reloaded.body.summary, 'Obsidian 的新内容')
    const saved = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '重新加载后保存的小结',
      nextStep: '下一步',
      version: reloaded.body.version,
    })
    assert.equal(saved.status, 200)
    assert.match(await readFile(summaryFile, 'utf8'), /重新加载后保存的小结/)
  } finally {
    await fixture.close()
  }
})

test('小结文件被外部删除时可读为缺失并显式重建，过时版本不静默覆盖', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const summaryFile = join(fixture.vault, space.directory, '学习小结.md')
    const before = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '会消失的小结',
      nextStep: '会消失的下一步',
      version: null,
    })
    await rm(summaryFile)

    const missing = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(missing.status, 200)
    assert.equal(missing.body.fileMissing, true)
    assert.equal(missing.body.summary, '')
    assert.equal(missing.body.nextStep, '')
    assert.equal(missing.body.version, null)

    const stale = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '旧界面重新写',
      nextStep: '',
      version: before.body.version,
    })
    assert.equal(stale.status, 409)
    assert.equal(stale.body.code, 'summary-conflict')
    assert.equal(await readFile(summaryFile, 'utf8').catch(() => null), null)

    const recreated = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '重新写的小结',
      nextStep: '下一步',
      version: null,
    })
    assert.equal(recreated.status, 200)
    assert.equal(recreated.body.fileMissing, false)
  } finally {
    await fixture.close()
  }
})

test('小结读写仍在知识库真实路径边界内：符号链接越界与目录冒充都明确拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const outside = join(fixture.folder, '库外')
    await mkdir(outside)
    await symlink(outside, join(fixture.vault, space.directory, '学习小结.md'), 'junction')

    const escapedRead = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(escapedRead.status, 400)
    assert.equal(escapedRead.body.code, 'vault-path-invalid')
    const escapedSave = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '不该写到库外',
      nextStep: '',
      version: null,
    })
    assert.equal(escapedSave.status, 400)
    assert.equal(escapedSave.body.code, 'vault-path-invalid')
    assert.equal(await readFile(join(outside, '学习小结.md'), 'utf8').catch(() => null), null)

    await rm(join(fixture.vault, space.directory, '学习小结.md'))
    await mkdir(join(fixture.vault, space.directory, '学习小结.md'))
    const directoryRead = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(directoryRead.status, 409)
    assert.equal(directoryRead.body.code, 'summary-unavailable')
    const directorySave = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '不能写入目录',
      nextStep: '',
      version: null,
    })
    assert.equal(directorySave.status, 409)
    assert.equal(directorySave.body.code, 'summary-unavailable')
  } finally {
    await fixture.close()
  }
})

test('两个学习空间各自保存阅读位置与笔记选择，重启后各自恢复且不串', async () => {
  const fixture = await classroomFixture()
  try {
    const alpha = await prepare(fixture, '线性代数')
    const beta = await prepare(fixture, '概率论')
    for (const [space, chapter] of [[alpha, '第一章'], [beta, '第二章']]) {
      await mkdir(join(fixture.vault, space.directory, '讲义', chapter), { recursive: true })
      await writeFile(join(fixture.vault, space.directory, '讲义', chapter, '01.md'), `# ${chapter}第一节\n\n正文段落。\n`, 'utf8')
      await writeFile(join(fixture.vault, space.directory, '笔记', '阅读笔记.md'), `# ${chapter}阅读笔记\n`, 'utf8')
    }
    const alphaLecture = `讲义/第一章/01.md`
    const betaLecture = `讲义/第二章/01.md`
    const alphaRead = await fixture.post({ action: 'lecture-read', spaceId: alpha.id, path: alphaLecture })
    assert.equal(alphaRead.status, 200)
    const betaRead = await fixture.post({ action: 'lecture-read', spaceId: beta.id, path: betaLecture })
    assert.equal(betaRead.status, 200)

    assert.equal((await fixture.post({ action: 'position-save', spaceId: alpha.id, path: alphaLecture, scrollTop: 480 })).status, 200)
    assert.equal((await fixture.post({ action: 'position-save', spaceId: beta.id, path: betaLecture, scrollTop: 0 })).status, 200)
    assert.equal((await fixture.post({ action: 'note-select', spaceId: alpha.id, path: '笔记/阅读笔记.md' })).status, 200)
    assert.equal((await fixture.post({ action: 'note-select', spaceId: beta.id, path: '笔记/我的笔记.md' })).status, 200)

    const before = await fixture.get()
    const beforeAlpha = before.body.spaces.find(row => row.id === alpha.id)
    const beforeBeta = before.body.spaces.find(row => row.id === beta.id)
    assert.deepEqual(beforeAlpha.readingPosition, { path: alphaLecture, scrollTop: 480 })
    assert.equal(beforeAlpha.notePath, '笔记/阅读笔记.md')
    assert.deepEqual(beforeBeta.readingPosition, { path: betaLecture, scrollTop: 0 })
    assert.equal(beforeBeta.notePath, '笔记/我的笔记.md')

    await fixture.restart()
    const after = await fixture.get()
    const afterAlpha = after.body.spaces.find(row => row.id === alpha.id)
    const afterBeta = after.body.spaces.find(row => row.id === beta.id)
    assert.equal(after.body.currentSpaceId, beta.id)
    assert.deepEqual(afterAlpha.readingPosition, { path: alphaLecture, scrollTop: 480 })
    assert.equal(afterAlpha.notePath, '笔记/阅读笔记.md')
    assert.equal(afterAlpha.lecturePath, alphaLecture)
    assert.deepEqual(afterBeta.readingPosition, { path: betaLecture, scrollTop: 0 })
    assert.equal(afterBeta.notePath, '笔记/我的笔记.md')
    assert.equal(afterBeta.lecturePath, betaLecture)

    // The state file carries navigation metadata only: no lecture or note body.
    const stateText = await readFile(fixture.stateFile, 'utf8')
    assert.doesNotMatch(stateText, /正文段落/)
    assert.doesNotMatch(stateText, /阅读笔记\\n/)
  } finally {
    await fixture.close()
  }
})

test('旧 state 没有 readingPosition 字段时按默认位置加载，不破坏已有空间与笔记选择', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '概率论')
    await fixture.post({ action: 'note-select', spaceId: space.id, path: '笔记/我的笔记.md' })
    await fixture.app.close()

    const state = JSON.parse(await readFile(fixture.stateFile, 'utf8'))
    delete state.spaces[0].readingPosition
    await writeFile(fixture.stateFile, JSON.stringify(state), 'utf8')

    await fixture.restart()
    const view = await fixture.get()
    assert.equal(view.status, 200)
    const restored = view.body.spaces.find(row => row.id === space.id)
    assert.deepEqual(restored.readingPosition, { path: null, scrollTop: 0 })
    assert.equal(restored.notePath, '笔记/我的笔记.md')
    assert.equal(restored.title, '概率论')
  } finally {
    await fixture.close()
  }
})

test('阅读位置与笔记选择只接受真实可打开的目标，伪造路径被明确拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '概率论')
    await mkdir(join(fixture.vault, space.directory, '讲义'), { recursive: true })
    await writeFile(join(fixture.vault, space.directory, '讲义', '01.md'), '# 第一节\n', 'utf8')

    const noteAsLecture = await fixture.post({ action: 'position-save', spaceId: space.id, path: '笔记/我的笔记.md', scrollTop: 10 })
    assert.equal(noteAsLecture.status, 400)
    assert.equal(noteAsLecture.body.code, 'lecture-invalid')
    const unlinked = await fixture.post({ action: 'position-save', spaceId: space.id, path: '资料/未关联.md', scrollTop: 10 })
    assert.equal(unlinked.status, 400)
    assert.equal(unlinked.body.code, 'lecture-invalid')
    const negative = await fixture.post({ action: 'position-save', spaceId: space.id, path: '讲义/01.md', scrollTop: -1 })
    assert.equal(negative.status, 400)
    assert.equal(negative.body.code, 'invalid-command')

    const goalAsNote = await fixture.post({ action: 'note-select', spaceId: space.id, path: '学习目标.md' })
    assert.equal(goalAsNote.status, 400)
    assert.equal(goalAsNote.body.code, 'note-path-invalid')
    const missing = await fixture.post({ action: 'note-select', spaceId: space.id, path: '笔记/不存在.md' })
    assert.equal(missing.status, 404)
    assert.equal(missing.body.code, 'note-not-found')
  } finally {
    await fixture.close()
  }
})

test('小结正文含任意 Markdown 标题时保存/读回/再保存都不截断或删内容', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const summary = '开头。\n\n## 我自己的小节\n\n这里有 **重点**。\n\n### 更深的标题\n\n- 列表一\n- 列表二\n\n```js\nconst x = 1\n```\n\n结尾。'
    const nextStep = '## 我的计划\n\n1. 做练习\n2. 复盘'
    const first = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary,
      nextStep,
      version: null,
    })
    assert.equal(first.status, 200)

    const reread = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.deepEqual({ summary: reread.body.summary, nextStep: reread.body.nextStep }, { summary, nextStep })

    const disk = await readFile(join(fixture.vault, space.directory, '学习小结.md'), 'utf8')
    assert.ok(disk.includes('## 我自己的小节'))
    assert.ok(disk.includes('### 更深的标题'))
    assert.ok(disk.includes('```js'))
    assert.ok(disk.includes('## 我的计划'))

    // Saving again from the read version keeps every line: the old framing
    // stopped at the learner's own heading and deleted everything after it.
    const second = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: `${summary}\n\n补充一行。`,
      nextStep,
      version: reread.body.version,
    })
    assert.equal(second.status, 200)
    const afterSecond = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(afterSecond.body.summary, `${summary}\n\n补充一行。`)
    assert.equal(afterSecond.body.nextStep, nextStep)
  } finally {
    await fixture.close()
  }
})

test('小结两段各按 64KB 上限保存，编码标记不挤占正文容量', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const summary = 'a'.repeat(maxSummaryBytes)
    const nextStep = 'b'.repeat(maxSummaryBytes)
    const saved = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary,
      nextStep,
      version: null,
    })
    assert.equal(saved.status, 200)
    const reread = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(reread.body.summary.length, maxSummaryBytes)
    assert.equal(reread.body.nextStep.length, maxSummaryBytes)
  } finally {
    await fixture.close()
  }
})

test('标记外追加的文字在保存时原样保留，不被下一次保存删掉', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const summaryFile = join(fixture.vault, space.directory, '学习小结.md')
    const first = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '第一版小结',
      nextStep: '第一版下一步',
      version: null,
    })
    assert.equal(first.status, 200)

    // The learner appends their own section in Obsidian, outside our markers.
    const base = await readFile(summaryFile, 'utf8')
    await writeFile(summaryFile, `${base}\n## 我后来加的\n\n这段不是插件写的，不能丢。\n`, 'utf8')

    const read = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(read.body.summary, '第一版小结')
    assert.equal(read.body.nextStep, '第一版下一步')
    assert.match(read.body.extra, /## 我后来加的/)
    assert.match(read.body.extra, /这段不是插件写的，不能丢。/)

    const saved = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '第二版小结',
      nextStep: '第二版下一步',
      version: read.body.version,
    })
    assert.equal(saved.status, 200)
    const disk = await readFile(summaryFile, 'utf8')
    assert.match(disk, /第二版小结/)
    assert.match(disk, /## 我后来加的/)
    assert.match(disk, /这段不是插件写的，不能丢。/)

    const reread = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(reread.body.summary, '第二版小结')
    assert.match(reread.body.extra, /这段不是插件写的，不能丢。/)
  } finally {
    await fixture.close()
  }
})

test('手写旧文件在下一步后追加的其他标题与后文，读回仍完整保留', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const summaryFile = join(fixture.vault, space.directory, '学习小结.md')
    await writeFile(summaryFile, [
      '# 学习小结',
      '',
      '## 本次小结',
      '旧小结。',
      '',
      '## 下一步',
      '旧下一步。',
      '',
      '## 我的补充',
      '',
      '这段是手写的，不能丢。',
      '',
    ].join('\n'), 'utf8')

    const read = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(read.body.summary, '旧小结。')
    assert.match(read.body.nextStep, /## 我的补充/)
    assert.match(read.body.nextStep, /这段是手写的，不能丢。/)

    const saved = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '新小结',
      nextStep: read.body.nextStep,
      version: read.body.version,
    })
    assert.equal(saved.status, 200)
    const disk = await readFile(summaryFile, 'utf8')
    assert.match(disk, /## 我的补充/)
    assert.match(disk, /这段是手写的，不能丢。/)
  } finally {
    await fixture.close()
  }
})

test('用户前缀的同名标题与用户自己的标记行在保存后字节保留', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const summaryFile = join(fixture.vault, space.directory, '学习小结.md')
    const first = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '正文小结',
      nextStep: '正文下一步',
      version: null,
    })
    assert.equal(first.status, 200)

    const base = await readFile(summaryFile, 'utf8')
    const userPrefix = '## 本次小结\n\n这是用户写在前面的前言。\n\n<!-- learning-classroom:summary:mine -->\n\n'
    const userSuffix = '\n<!-- learning-classroom:next:mine -->\n\n用户自己的注释。\n'
    await writeFile(summaryFile, `${userPrefix}${base}${userSuffix}`, 'utf8')

    const read = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(read.body.summary, '正文小结')
    assert.equal(read.body.nextStep, '正文下一步')
    assert.match(read.body.extra, /^## 本次小结\n\n这是用户写在前面的前言。/)
    assert.match(read.body.extra, /<!-- learning-classroom:summary:mine -->/)
    assert.match(read.body.extra, /<!-- learning-classroom:next:mine -->/)
    assert.match(read.body.extra, /用户自己的注释。/)
    assert.equal((read.body.extra.match(/## 本次小结/g) ?? []).length, 1, '框架标题不混入额外文本')

    const saved = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: '新正文小结',
      nextStep: read.body.nextStep,
      version: read.body.version,
    })
    assert.equal(saved.status, 200)
    const disk = await readFile(summaryFile, 'utf8')
    assert.match(disk, /这是用户写在前面的前言。/)
    assert.match(disk, /<!-- learning-classroom:summary:mine -->/)
    assert.match(disk, /<!-- learning-classroom:next:mine -->/)
    assert.match(disk, /用户自己的注释。/)
    assert.match(disk, /新正文小结/)
  } finally {
    await fixture.close()
  }
})

test('小结保存沿用 HTTP 边界：未知字段、超长内容与不可用空间都被明确拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const extra = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: 'x',
      nextStep: '',
      version: null,
      path: '学习小结.md',
    })
    assert.equal(extra.status, 400)
    assert.equal(extra.body.code, 'invalid-command')

    const huge = await fixture.post({
      action: 'summary-save',
      spaceId: space.id,
      summary: 'x'.repeat(200 * 1024),
      nextStep: '',
      version: null,
    })
    assert.equal(huge.status, 400)
    assert.equal(huge.body.code, 'invalid-command')

    const unknown = await fixture.post({ action: 'summary-read', spaceId: '不存在' })
    assert.equal(unknown.status, 409)
    assert.equal(unknown.body.code, 'space-not-found')

    await rm(join(fixture.vault, space.directory), { recursive: true, force: true })
    const gone = await fixture.post({ action: 'summary-read', spaceId: space.id })
    assert.equal(gone.status, 409)
    assert.equal(gone.body.code, 'space-unavailable')
  } finally {
    await fixture.close()
  }
})
