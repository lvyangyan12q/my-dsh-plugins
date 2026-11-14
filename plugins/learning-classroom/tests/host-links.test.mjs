import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { classroomFixture } from './support/fixture.mjs'

async function setupVault(fixture) {
  await fixture.post({ action: 'vault-choose', path: fixture.vault })
  const created = await fixture.post({ action: 'space-create', title: '概率论' })
  assert.equal(created.status, 200)
  const space = created.body.spaces[0]
  const root = join(fixture.vault, space.directory)
  await mkdir(join(root, '讲义', '第一章'), { recursive: true })
  await mkdir(join(root, '讲义', '第二章'), { recursive: true })
  await mkdir(join(root, '资料'), { recursive: true })
  await mkdir(join(root, '笔记'), { recursive: true })
  await writeFile(join(root, '讲义', '第一章', '01.md'), [
    '---',
    'title: 第一节 缩小样本空间',
    'aliases: 第一章讲义, 概率基础',
    '---',
    '# 第一节',
    '',
    '样本空间可以缩小。',
    '',
    '结论写在最后。 ^block-1',
    '',
  ].join('\n'), 'utf8')
  await writeFile(join(root, '讲义', '第二章', '02.md'), '# 第二节\n\n条件概率。\n', 'utf8')
  await writeFile(join(root, '资料', '01.md'), '# 同名资料\n\n这是不同目录的同名文件。\n', 'utf8')
  await writeFile(join(root, '笔记', '我的笔记.md'), '# 我的笔记\n\n## 小结\n\n自己写的。\n', 'utf8')
  return space
}

test('双链按 Vault 相对路径解析文件、标题和已有块，并生成无歧义链接', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await setupVault(fixture)
    const base = `${space.directory}/讲义/第一章/01.md`

    const file = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `[[${base}]]` })
    assert.equal(file.status, 200)
    assert.equal(file.body.status, 'ok')
    assert.equal(file.body.file, base)
    assert.equal(file.body.spacePath, '讲义/第一章/01.md')
    assert.equal(file.body.kind, 'lecture')
    assert.equal(file.body.link, `[[${base}]]`)
    assert.equal(file.body.heading, null)
    assert.equal(file.body.blockId, null)

    const heading = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `[[${base}#第一节]]` })
    assert.equal(heading.body.status, 'ok')
    assert.equal(heading.body.heading, '第一节')
    assert.equal(heading.body.link, `[[${base}#第一节]]`)

    const block = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `[[${base}#^block-1]]` })
    assert.equal(block.body.status, 'ok')
    assert.equal(block.body.blockId, 'block-1')
    assert.equal(block.body.link, `[[${base}#^block-1]]`)

    const aliased = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `[[${base}#第一节|显示名]]` })
    assert.equal(aliased.body.status, 'ok')
    assert.equal(aliased.body.link, `[[${base}#第一节|显示名]]`)
  } finally {
    await fixture.close()
  }
})

test('仅写文件名或 frontmatter 别名时可解析；别名冲突不猜测', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await setupVault(fixture)

    const byAlias = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '概率基础' })
    assert.equal(byAlias.body.status, 'ok')
    assert.equal(byAlias.body.file, `${space.directory}/讲义/第一章/01.md`)

    const byBareName = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '02#第二节' })
    assert.equal(byBareName.body.status, 'ok')
    assert.equal(byBareName.body.file, `${space.directory}/讲义/第二章/02.md`)

    await writeFile(join(fixture.vault, space.directory, '资料', '别名撞车.md'), '---\naliases: 概率基础\n---\n# 另一个\n', 'utf8')
    const aliasClash = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '概率基础' })
    assert.equal(aliasClash.body.status, 'ambiguous')
    assert.deepEqual(
      [...aliasClash.body.candidates].sort(),
      [`${space.directory}/资料/别名撞车.md`, `${space.directory}/讲义/第一章/01.md`].sort(),
    )
    assert.match(aliasClash.body.message, /多个|同名|别名/)
  } finally {
    await fixture.close()
  }
})

test('不同目录同名文件提示歧义并列出候选，不用短名猜目标', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await setupVault(fixture)

    const ambiguous = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '01' })
    assert.equal(ambiguous.status, 200)
    assert.equal(ambiguous.body.status, 'ambiguous')
    assert.equal(ambiguous.body.link, null)
    assert.deepEqual(
      [...ambiguous.body.candidates].sort(),
      [`${space.directory}/讲义/第一章/01.md`, `${space.directory}/资料/01.md`].sort(),
    )
    assert.match(ambiguous.body.message, /同名|多个/)

    // 明确路径就不歧义；生成链接使用真实大小写。
    const explicit = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `${space.directory}/资料/01.md` })
    assert.equal(explicit.body.status, 'ok')
    assert.equal(explicit.body.spacePath, '资料/01.md')
    assert.equal(explicit.body.kind, 'file')

    const folded = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `${space.directory}/资料/01.MD` })
    assert.equal(folded.body.status, 'ok')
    assert.equal(folded.body.file, `${space.directory}/资料/01.md`)
  } finally {
    await fixture.close()
  }
})

test('缺失、标题或块不存在、越界都给出可读错误，且不生成链接', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await setupVault(fixture)
    const base = `${space.directory}/讲义/第一章/01.md`

    const missingFile = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '不存在' })
    assert.equal(missingFile.body.status, 'missing')
    assert.equal(missingFile.body.link, null)
    assert.match(missingFile.body.message, /找不到|不存在/)

    const missingHeading = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `[[${base}#没有这一节]]` })
    assert.equal(missingHeading.body.status, 'missing')
    assert.match(missingHeading.body.message, /标题/)

    const missingBlock = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `[[${base}#^fake-block]]` })
    assert.equal(missingBlock.body.status, 'missing')
    assert.match(missingBlock.body.message, /块/)

    for (const target of ['../越界.md', 'C:/绝对.md', '/etc/passwd', '..\\越界.md']) {
      const outside = await fixture.post({ action: 'link-resolve', spaceId: space.id, target })
      assert.equal(outside.body.status, 'outside', target)
      assert.equal(outside.body.link, null)
      assert.match(outside.body.message, /越|绝对|知识文件库/)
    }

    const malformed = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '[[未闭合' })
    assert.equal(malformed.body.status, 'unsupported')
    assert.match(malformed.body.message, /方括号|双链/)
  } finally {
    await fixture.close()
  }
})

test('同文件标题/块引用按 fromPath 解析；没有来源笔记时明确拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await setupVault(fixture)
    const note = '笔记/我的笔记.md'

    const heading = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '[[#小结]]', fromPath: note })
    assert.equal(heading.body.status, 'ok')
    assert.equal(heading.body.file, `${space.directory}/${note}`)
    assert.equal(heading.body.kind, 'note')
    assert.equal(heading.body.link, `[[${space.directory}/${note}#小结]]`)

    const noSource = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '[[#小结]]' })
    assert.equal(noSource.body.status, 'unsupported')
    assert.match(noSource.body.message, /当前笔记|来源/)

    const outsideSource = await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '[[#小结]]', fromPath: '../别处.md' })
    assert.equal(outsideSource.body.status, 'outside')
  } finally {
    await fixture.close()
  }
})

test('双链解析不改写笔记或讲义文件', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await setupVault(fixture)
    const note = join(fixture.vault, space.directory, '笔记', '我的笔记.md')
    const lecture = join(fixture.vault, space.directory, '讲义', '第一章', '01.md')
    const { readFile } = await import('node:fs/promises')
    const noteBefore = await readFile(note, 'utf8')
    const lectureBefore = await readFile(lecture, 'utf8')

    await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '[[#小结]]', fromPath: '笔记/我的笔记.md' })
    await fixture.post({ action: 'link-resolve', spaceId: space.id, target: '01' })
    await fixture.post({ action: 'link-resolve', spaceId: space.id, target: `${space.directory}/讲义/第一章/01.md#第一节` })

    assert.equal(await readFile(note, 'utf8'), noteBefore)
    assert.equal(await readFile(lecture, 'utf8'), lectureBefore)
  } finally {
    await fixture.close()
  }
})
