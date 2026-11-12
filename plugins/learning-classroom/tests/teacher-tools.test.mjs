import assert from 'node:assert/strict'
import { readFile, readdir, rename, stat, symlink, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { classroomFixture } from './support/fixture.mjs'

const { createTeacherTools } = await import('../src/teacher-tools.ts')

async function prepare(fixture, title = '概率论', sessionId = 'session-a') {
  const chosen = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(chosen.status, 200, JSON.stringify(chosen.body))
  const created = await fixture.post({ action: 'space-create', title })
  assert.equal(created.status, 200, JSON.stringify(created.body))
  const space = created.body.spaces.find(row => row.title === title)
  const bound = await fixture.post({ action: 'session-open', spaceId: space.id, sessionId })
  assert.equal(bound.status, 200, JSON.stringify(bound.body))
  return space
}

function toolsFor(fixture) {
  return createTeacherTools({
    hasBoundSession: id => fixture.app.hasBoundSession(id),
    writeGenerated: (sessionId, kind, draft) => fixture.app.writeGenerated(sessionId, kind, draft),
  })
}

function toolOf(tools, name) {
  const found = tools.find(tool => tool.definition.name === name)
  assert.ok(found, `missing tool ${name}`)
  return found
}

function execution(sessionId, signal = new AbortController().signal) {
  return { agent: { id: sessionId }, signal }
}

const lectureArgs = {
  fileName: '第一章/02-条件概率.md',
  title: '条件概率',
  order: 2,
  body: '条件概率把样本空间缩小到条件事件 B：\n\n```\nP(A|B) = P(A∩B) / P(B)\n```\n\n来源与解释分开保存。',
  sources: ['《概率论》第 2 章', '课堂笔记：条件概率'],
}

const experimentArgs = {
  fileName: '第一章/03-贝叶斯实验.html',
  title: '贝叶斯更新实验',
  order: 3,
  sources: ['《概率论》第 2 章', '课堂推导'],
  parameters: [
    { name: 'prior', label: '先验概率', min: 0, max: 1, step: 0.01, default: 0.5, unit: '' },
    { name: 'likelihood', label: '似然', min: 0, max: 1, step: 0.01, default: 0.8, unit: '' },
  ],
  html: '<!doctype html><html><head><style>body{font-family:sans-serif}</style></head><body><label>先验 <input id="prior" type="range" min="0" max="1" step="0.01" value="0.5"></label><canvas id="chart"></canvas><p id="posterior">后验：0.80</p><script>const prior = 0.5; const likelihood = 0.8; document.getElementById("posterior").textContent = "后验：" + ((prior * likelihood) / (prior * likelihood + (1 - prior) * 0.2)).toFixed(2)</script></body></html>',
}

test('工具 schema 只接收内容与路径，不接受自报主题或会话身份', () => {
  const fixture = { app: { hasBoundSession: () => true, writeGenerated: async () => { throw new Error('not used') } } }
  const tools = toolsFor(fixture)
  assert.deepEqual(tools.map(tool => tool.definition.name).sort(), ['classroom_experiment_write', 'classroom_lecture_write'])
  for (const tool of tools) {
    const properties = tool.definition.parameters.properties
    assert.equal(Object.hasOwn(properties, 'spaceId'), false)
    assert.equal(Object.hasOwn(properties, 'sessionId'), false)
    assert.equal(tool.definition.parameters.additionalProperties, false)
  }
  const card = tools.find(tool => tool.definition.name === 'classroom_lecture_write').definition.presentCall(lectureArgs)
  assert.equal(card.title, '生成讲义：条件概率')
  assert.deepEqual(card.rawInput, { fileName: lectureArgs.fileName, title: lectureArgs.title })
  assert.doesNotMatch(JSON.stringify(card), /P\(A\|B\)/, '待执行工具卡片不应把整篇正文倒进界面')
})

test('绑定会话生成讲义：成功落盘后目录可发现并可打开，来源与解释一起保存', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const notePath = join(fixture.vault, space.directory, '笔记', '我的笔记.md')
    const noteBefore = await readFile(notePath, 'utf8')
    const tools = toolsFor(fixture)

    const result = await toolOf(tools, 'classroom_lecture_write').definition.execute(lectureArgs, execution('session-a'))
    assert.equal(result.path, '讲义/第一章/02-条件概率.md')
    assert.equal(result.kind, 'lecture')
    assert.equal(result.spaceId, space.id)

    const absolute = join(fixture.vault, space.directory, '讲义', '第一章', '02-条件概率.md')
    const saved = await readFile(absolute, 'utf8')
    assert.match(saved, /generated: teacher/)
    assert.match(saved, /# 条件概率/)
    assert.match(saved, /## 来源/)
    assert.match(saved, /《概率论》第 2 章/)
    assert.match(saved, /P\(A\|B\) = P\(A∩B\) \/ P\(B\)/)

    const listed = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    assert.equal(listed.status, 200)
    const row = listed.body.lectures.find(lecture => lecture.path === '讲义/第一章/02-条件概率.md')
    assert.ok(row)
    assert.equal(row.title, '条件概率')
    assert.equal(row.chapter, '第一章')
    assert.equal(row.order, 2)

    const read = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: row.path })
    assert.equal(read.status, 200)
    assert.match(read.body.content, /## 来源/)
    assert.equal(read.body.html, null)

    assert.equal(await readFile(notePath, 'utf8'), noteBefore, '生成讲义不能改个人笔记')
    const leftovers = (await readdir(join(fixture.vault, space.directory, '讲义', '第一章'))).filter(name => name.endsWith('.tmp'))
    assert.deepEqual(leftovers, [])
  } finally {
    await fixture.close()
  }
})

test('未绑定会话、试图自报主题或越界路径都被拒绝，不落盘', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const tools = toolsFor(fixture)

    await assert.rejects(
      () => toolOf(tools, 'classroom_lecture_write').definition.execute(lectureArgs, execution('不存在的会话')),
      /未绑定|绑定|学习空间/,
    )
    await assert.rejects(
      () => toolOf(tools, 'classroom_lecture_write').definition.execute({ ...lectureArgs, spaceId: '另一个主题' }, execution('session-a')),
      /spaceId|不合法|未声明|additional|字段/i,
    )
    for (const fileName of ['../另一个主题/讲义/01.md', '/绝对/01.md', 'C:\\讲义\\01.md', '01.html']) {
      await assert.rejects(
        () => toolOf(tools, 'classroom_lecture_write').definition.execute({ ...lectureArgs, fileName }, execution('session-a')),
        /讲义|路径|扩展|文件名|支持|HTML|md/i,
      )
    }
    const folder = join(fixture.vault, space.directory, '讲义')
    assert.deepEqual(await readdir(folder), [])
  } finally {
    await fixture.close()
  }
})

test('重名不静默覆盖，旧讲义和笔记逐字保留，失败不留暂存文件', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const tools = toolsFor(fixture)
    const lecture = toolOf(tools, 'classroom_lecture_write')
    await lecture.definition.execute(lectureArgs, execution('session-a'))

    const absolute = join(fixture.vault, space.directory, '讲义', '第一章', '02-条件概率.md')
    const original = await readFile(absolute, 'utf8')
    await assert.rejects(
      () => lecture.definition.execute({ ...lectureArgs, body: '这一版不能覆盖旧讲义。' }, execution('session-a')),
      /已存在|重名|覆盖/,
    )
    assert.equal(await readFile(absolute, 'utf8'), original)

    await assert.rejects(
      () => lecture.definition.execute({ ...lectureArgs, fileName: '第一章/04-坏来源.md', sources: [] }, execution('session-a')),
      /来源|至少|不能为空/i,
    )
    assert.equal(await stat(join(fixture.vault, space.directory, '讲义', '第一章', '04-坏来源.md')).catch(() => null), null)
    const leftovers = (await readdir(join(fixture.vault, space.directory, '讲义', '第一章'))).filter(name => name.endsWith('.tmp'))
    assert.deepEqual(leftovers, [])
  } finally {
    await fixture.close()
  }
})

test('取消发生在写入前时拒绝且不产生半成品', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const tools = toolsFor(fixture)
    const controller = new AbortController()
    controller.abort(new Error('用户取消'))
    await assert.rejects(
      () => toolOf(tools, 'classroom_lecture_write').definition.execute(lectureArgs, execution('session-a', controller.signal)),
      /取消|中止|abort/i,
    )
    assert.deepEqual(await readdir(join(fixture.vault, space.directory, '讲义')), [])
  } finally {
    await fixture.close()
  }
})

test('生成实验写入自包含页面；读回沙箱 HTML、来源与参数，实验不冒充 Markdown 正文', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    const tools = toolsFor(fixture)
    const experiment = toolOf(tools, 'classroom_experiment_write')
    const result = await experiment.definition.execute(experimentArgs, execution('session-a'))
    assert.equal(result.path, '讲义/第一章/03-贝叶斯实验.html')
    assert.equal(result.kind, 'experiment')

    const absolute = join(fixture.vault, space.directory, '讲义', '第一章', '03-贝叶斯实验.html')
    const saved = await readFile(absolute, 'utf8')
    assert.match(saved, /Content-Security-Policy/)
    assert.match(saved, /connect-src 'none'/)
    assert.match(saved, /<title>贝叶斯更新实验<\/title>/)
    assert.doesNotMatch(saved, /https?:\/\//, '生成实验不得引用网络资源')

    const listed = await fixture.post({ action: 'lecture-list', spaceId: space.id })
    const row = listed.body.lectures.find(lecture => lecture.path === result.path)
    assert.ok(row)
    assert.equal(row.kind, 'experiment')
    assert.equal(row.title, '贝叶斯更新实验')
    assert.equal(row.order, 3)

    const read = await fixture.post({ action: 'lecture-read', spaceId: space.id, path: result.path })
    assert.equal(read.status, 200)
    assert.equal(read.body.kind, 'experiment')
    assert.equal(read.body.content, null)
    assert.equal(read.body.version, null)
    assert.match(read.body.html, /<canvas id="chart">/)
    assert.match(read.body.html, /Content-Security-Policy/)
    assert.deepEqual(read.body.sources, experimentArgs.sources)
    assert.deepEqual(read.body.parameters, experimentArgs.parameters)

    await assert.rejects(
      () => experiment.definition.execute({
        ...experimentArgs,
        fileName: '第一章/04-外链实验.html',
        html: '<html><body><script src="https://example.org/x.js"></script></body></html>',
      }, execution('session-a')),
      /外部|网络|自包含|沙箱/,
    )
    assert.equal(await stat(join(fixture.vault, space.directory, '讲义', '第一章', '04-外链实验.html')).catch(() => null), null)
    assert.deepEqual((await readdir(join(fixture.vault, space.directory, '讲义', '第一章'))).filter(name => name.endsWith('.tmp')), [])
  } finally {
    await fixture.close()
  }
})

test('文件系统不能无覆盖原子发布时失败关闭，不退化为复制、不删除外部新文件', async () => {
  let linkCalls = 0
  const fixture = await classroomFixture({
    linkFile: async (staging, target) => {
      linkCalls += 1
      // Simulate a filesystem without hard links while another process creates
      // the target in the same window. The Host must not copy or delete it.
      assert.match(staging, /\.learning-classroom\.tmp$/)
      await writeFile(target, '外部新文件', { encoding: 'utf8', flag: 'wx' })
      throw Object.assign(new Error('hard link unsupported'), { code: 'EPERM' })
    },
  })
  try {
    const space = await prepare(fixture)
    const tools = toolsFor(fixture)
    await assert.rejects(
      () => toolOf(tools, 'classroom_lecture_write').definition.execute(lectureArgs, execution('session-a')),
      /原子|发布|复制|不支持/,
    )
    assert.equal(linkCalls, 1)
    const target = join(fixture.vault, space.directory, '讲义', '第一章', '02-条件概率.md')
    assert.equal(await readFile(target, 'utf8'), '外部新文件', '不能删除或覆盖竞争出现的外部文件')
    assert.deepEqual((await readdir(join(fixture.vault, space.directory, '讲义', '第一章'))).filter(name => name.endsWith('.tmp')), [])
  } finally {
    await fixture.close()
  }
})

test('学习空间根目录本身是目录联接时也拒绝写入，不能把 A 主题写进 Vault 内 B', async () => {
  const fixture = await classroomFixture()
  const a = await prepare(fixture, '概率论', 'session-a')
  const b = await prepare(fixture, '线性代数', 'session-b')
  const aPath = join(fixture.vault, a.directory)
  const backup = `${aPath}-原目录`
  await rename(aPath, backup)
  await symlink(join(fixture.vault, b.directory), aPath, 'junction')
  try {
    const tools = toolsFor(fixture)
    await assert.rejects(
      () => toolOf(tools, 'classroom_lecture_write').definition.execute(lectureArgs, execution('session-a')),
      /符号链接|目录联接|学习空间|拒绝/,
    )
    const listed = await fixture.post({ action: 'lecture-list', spaceId: a.id })
    assert.equal(listed.status, 409)
    assert.equal(listed.body.code, 'space-unavailable')
    assert.match(listed.body.error, /符号链接|目录联接/)
    const notes = await fixture.post({ action: 'note-list', spaceId: a.id })
    assert.equal(notes.status, 409)
    assert.equal(JSON.stringify(listed.body).includes('我的笔记'), false)
    assert.deepEqual(await readdir(join(fixture.vault, b.directory, '讲义')), [])
    assert.deepEqual(await readdir(join(fixture.vault, b.directory, '笔记')), ['我的笔记.md'])
  } finally {
    await unlink(aPath).catch(() => undefined)
    await fixture.close()
  }
})

test('符号链接/目录联接不能把生成写到另一个主题，连空目录都不创建', async () => {
  const fixture = await classroomFixture()
  try {
    const a = await prepare(fixture, '概率论', 'session-a')
    const b = await prepare(fixture, '线性代数', 'session-b')
    const link = join(fixture.vault, a.directory, '讲义', '旁路')
    await symlink(join(fixture.vault, b.directory, '讲义'), link, 'junction')
    const tools = toolsFor(fixture)
    await assert.rejects(
      () => toolOf(tools, 'classroom_lecture_write').definition.execute(
        { ...lectureArgs, fileName: '旁路/01-跨主题.md' },
        execution('session-a'),
      ),
      /符号链接|越出|拒绝/,
    )
    assert.deepEqual(await readdir(join(fixture.vault, b.directory, '讲义')), [])
    assert.deepEqual(await readdir(join(fixture.vault, a.directory, '讲义')), ['旁路'])
  } finally {
    await fixture.close()
  }
})

test('工具可用性只对绑定了学习空间的会话开放，别的主题会话看不到写入能力', async () => {
  const fixture = await classroomFixture()
  try {
    await prepare(fixture, '概率论', 'session-a')
    await prepare(fixture, '线性代数', 'session-b')
    const tools = toolsFor(fixture)
    const lecture = toolOf(tools, 'classroom_lecture_write')
    assert.equal(lecture.visibleFor('session-a'), true)
    assert.equal(lecture.visibleFor('session-b'), true)
    assert.equal(lecture.visibleFor('session-c'), false)
    assert.equal(lecture.visibleFor(''), false)
  } finally {
    await fixture.close()
  }
})
