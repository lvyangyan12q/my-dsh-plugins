import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canvasReadLimit } from '../src/canvas.ts'
import { classroomFixture } from './support/fixture.mjs'

async function prepare(fixture, title = '概率论') {
  const chosen = await fixture.post({ action: 'vault-choose', path: fixture.vault })
  assert.equal(chosen.status, 200)
  const created = await fixture.post({ action: 'space-create', title })
  assert.equal(created.status, 200)
  return created.body.spaces.find(space => space.title === title)
}

async function writeCanvas(fixture, space, value) {
  const file = join(fixture.vault, space.directory, '脉络.canvas')
  await writeFile(file, typeof value === 'string' ? value : JSON.stringify(value), 'utf8')
  return file
}

const sampleCanvas = {
  nodes: [
    { id: 'text', type: 'text', text: '样本空间', x: 0, y: 0, width: 200, height: 80 },
    { id: 'lecture', type: 'file', file: '概率论/讲义/01-样本空间.md', x: 300, y: 0, width: 200, height: 80 },
    { id: 'note', type: 'file', file: '笔记/我的笔记.md', x: 0, y: 200, width: 200, height: 80 },
    { id: 'link', type: 'link', url: 'https://example.com/reading', x: 300, y: 200, width: 200, height: 80 },
    { id: 'group', type: 'group', label: '基础', x: -50, y: -50, width: 600, height: 400 },
  ],
  edges: [
    { id: 'e1', fromNode: 'text', toNode: 'lecture', label: '先修' },
    { id: 'e2', fromNode: 'note', toNode: 'link', label: '应用', toEnd: 'arrow' },
    { id: 'e3', fromNode: 'text', toNode: 'text', label: '组成' },
  ],
}

test('读取真实脉络.canvas：四种节点、带标签的有向边与可打开目标', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await writeFile(join(fixture.vault, space.directory, '讲义', '01-样本空间.md'), '# 样本空间\n', 'utf8')
    await writeCanvas(fixture, space, sampleCanvas)

    const result = await fixture.post({ action: 'canvas-read', spaceId: space.id })
    assert.equal(result.status, 200)
    assert.equal(result.body.spaceId, space.id)
    assert.equal(result.body.path, '概率论/脉络.canvas')
    assert.equal(result.body.fileName, '脉络.canvas')
    assert.equal(result.body.width, 600)
    assert.equal(result.body.height, 400)

    const byId = new Map(result.body.nodes.map(node => [node.id, node]))
    assert.equal(byId.get('text').text, '样本空间')
    assert.equal(byId.get('group').label, '基础')
    assert.equal(byId.get('link').url, 'https://example.com/reading')

    assert.deepEqual(byId.get('lecture').target, {
      path: '讲义/01-样本空间.md',
      vaultPath: '概率论/讲义/01-样本空间.md',
      kind: 'lecture',
      status: 'ok',
      heading: null,
      blockId: null,
      message: null,
    })
    assert.deepEqual(byId.get('note').target, {
      path: '笔记/我的笔记.md',
      vaultPath: '概率论/笔记/我的笔记.md',
      kind: 'note',
      status: 'ok',
      heading: null,
      blockId: null,
      message: null,
    })
    // Only file nodes carry an open target.
    assert.equal(byId.get('text').target, null)
    assert.equal(byId.get('link').target, null)
    assert.equal(byId.get('group').target, null)

    assert.deepEqual(
      result.body.edges.map(edge => [edge.fromNode, edge.toNode, edge.label, edge.relation, edge.selfLoop]),
      [['text', 'lecture', '先修', 'prerequisite', false], ['note', 'link', '应用', 'application', false], ['text', 'text', '组成', 'composition', true]],
    )
    // Arrow direction is carried from JSON Canvas: an omitted end is "none",
    // never an implied arrow invented by the renderer.
    assert.deepEqual(
      result.body.edges.map(edge => [edge.fromEnd, edge.toEnd, edge.fromSide, edge.toSide]),
      [['none', 'none', null, null], ['none', 'arrow', null, null], ['none', 'none', null, null]],
    )
  } finally {
    await fixture.close()
  }
})

test('文件节点越界、缺失或不支持时逐节点给出明确提示，不拖垮整张图', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await writeFile(join(fixture.vault, '外部秘密.md'), '# 秘密', 'utf8')
    await writeCanvas(fixture, space, {
      nodes: [
        { id: 'outside', type: 'file', file: '../外部秘密.md', x: 0, y: 0, width: 100, height: 50 },
        { id: 'absolute', type: 'file', file: 'D:\\外部\\秘密.md', x: 120, y: 0, width: 100, height: 50 },
        { id: 'missing', type: 'file', file: '讲义/99-没有.md', x: 0, y: 80, width: 100, height: 50 },
        { id: 'unsupported', type: 'file', file: '附件/图表.png', x: 120, y: 80, width: 100, height: 50 },
      ],
      edges: [{ id: 'e1', fromNode: 'outside', toNode: 'missing', label: '先修' }],
    })

    const result = await fixture.post({ action: 'canvas-read', spaceId: space.id })
    assert.equal(result.status, 200)
    const byId = new Map(result.body.nodes.map(node => [node.id, node]))
    assert.equal(byId.get('outside').target.status, 'outside')
    assert.match(byId.get('outside').target.message, /知识文件库/)
    assert.equal(byId.get('absolute').target.status, 'outside')
    assert.match(byId.get('absolute').target.message, /知识文件库/)
    assert.equal(byId.get('missing').target.status, 'missing')
    assert.match(byId.get('missing').target.message, /不存在|删除/)
    assert.equal(byId.get('missing').target.path, '讲义/99-没有.md')
    assert.equal(byId.get('unsupported').target.status, 'unsupported')
    assert.match(byId.get('unsupported').target.message, /讲义|笔记/)
    assert.equal(result.body.edges.length, 1)
  } finally {
    await fixture.close()
  }
})

test('真实第二主题结构：嵌套章节、已关联讲义与真实标题/块都能打开，缺失锚点明确', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture, '第二主题验收')
    await mkdir(join(fixture.vault, space.directory, '讲义', '第一章'), { recursive: true })
    await mkdir(join(fixture.vault, space.directory, '笔记', '复习'), { recursive: true })
    await mkdir(join(fixture.vault, space.directory, '资料'), { recursive: true })
    await writeFile(join(fixture.vault, space.directory, '讲义', '第一章', '01-条件概率.md'),
      '# 条件概率\n\n条件概率正文。 ^cond-def\n\n## 乘法公式\n', 'utf8')
    await writeFile(join(fixture.vault, space.directory, '笔记', '复习', '第一章.md'),
      '# 复习\n\n## 第一章要点\n', 'utf8')
    await writeFile(join(fixture.vault, space.directory, '资料', '改名资料.md'),
      '# 改名资料\n\n## 关联小节\n', 'utf8')
    const linked = await fixture.post({ action: 'lecture-link', spaceId: space.id, path: '资料/改名资料.md' })
    assert.equal(linked.status, 200)

    await writeCanvas(fixture, space, {
      nodes: [
        { id: 'nested-lecture', type: 'file', file: '第二主题验收/讲义/第一章/01-条件概率.md', x: 0, y: 0, width: 200, height: 80 },
        { id: 'linked-lecture', type: 'file', file: '第二主题验收/资料/改名资料.md', x: 220, y: 0, width: 200, height: 80 },
        { id: 'nested-note', type: 'file', file: '第二主题验收/笔记/复习/第一章.md', x: 0, y: 100, width: 200, height: 80 },
        { id: 'heading', type: 'file', file: '第二主题验收/讲义/第一章/01-条件概率.md#条件概率', x: 220, y: 100, width: 200, height: 80 },
        { id: 'block', type: 'file', file: '讲义/第一章/01-条件概率.md#^cond-def', x: 440, y: 100, width: 200, height: 80 },
        { id: 'missing-fragment', type: 'file', file: '第二主题验收/讲义/第一章/01-条件概率.md#不存在的标题', x: 0, y: 200, width: 200, height: 80 },
        { id: 'unlinked', type: 'file', file: '资料/未关联.md', x: 220, y: 200, width: 200, height: 80 },
      ],
      edges: [
        { id: 'e1', fromNode: 'nested-lecture', toNode: 'heading', label: '先修', toEnd: 'arrow', fromSide: 'right', toSide: 'left' },
        { id: 'e2', fromNode: 'linked-lecture', toNode: 'nested-note', label: '组成', fromEnd: 'arrow' },
      ],
    })

    const result = await fixture.post({ action: 'canvas-read', spaceId: space.id })
    assert.equal(result.status, 200)
    const byId = new Map(result.body.nodes.map(node => [node.id, node]))

    assert.deepEqual(byId.get('nested-lecture').target, {
      path: '讲义/第一章/01-条件概率.md',
      vaultPath: '第二主题验收/讲义/第一章/01-条件概率.md',
      kind: 'lecture',
      status: 'ok',
      heading: null,
      blockId: null,
      message: null,
    })
    assert.deepEqual(byId.get('linked-lecture').target, {
      path: '资料/改名资料.md',
      vaultPath: '第二主题验收/资料/改名资料.md',
      kind: 'lecture',
      status: 'ok',
      heading: null,
      blockId: null,
      message: null,
    })
    assert.deepEqual(byId.get('nested-note').target, {
      path: '笔记/复习/第一章.md',
      vaultPath: '第二主题验收/笔记/复习/第一章.md',
      kind: 'note',
      status: 'ok',
      heading: null,
      blockId: null,
      message: null,
    })
    assert.equal(byId.get('heading').target.status, 'ok')
    assert.equal(byId.get('heading').target.heading, '条件概率')
    assert.equal(byId.get('heading').target.blockId, null)
    assert.equal(byId.get('block').target.status, 'ok')
    assert.equal(byId.get('block').target.blockId, 'cond-def')
    assert.equal(byId.get('missing-fragment').target.status, 'missing-fragment')
    assert.match(byId.get('missing-fragment').target.message, /没有标题/)
    assert.equal(byId.get('unlinked').target.status, 'unsupported')
    assert.match(byId.get('unlinked').target.message, /已关联|讲义|笔记/)

    assert.deepEqual(
      result.body.edges.map(edge => [edge.id, edge.fromEnd, edge.toEnd, edge.fromSide, edge.toSide]),
      [['e1', 'none', 'arrow', 'right', 'left'], ['e2', 'arrow', 'none', null, null]],
    )
  } finally {
    await fixture.close()
  }
})

test('画布缺失或格式非法时整体报错，响应里没有半张图', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)

    const missing = await fixture.post({ action: 'canvas-read', spaceId: space.id })
    assert.equal(missing.status, 409)
    assert.equal(missing.body.code, 'canvas-missing')
    assert.match(missing.body.error, /脉络\.canvas/)
    assert.match(missing.body.error, /Obsidian/)

    const cases = [
      ['不是 JSON', '{ 不是 JSON'],
      ['顶层是数组', '[]'],
      ['缺少 nodes', JSON.stringify({ edges: [] })],
      ['未知节点类型', JSON.stringify({ nodes: [{ id: 'n1', type: 'image', x: 0, y: 0, width: 10, height: 10 }] })],
      ['缺少必需字段', JSON.stringify({ nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 10, height: 10 }] })],
      ['边引用不存在节点', JSON.stringify({
        nodes: [{ id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10 }],
        edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2' }],
      })],
      ['尺寸不合法', JSON.stringify({ nodes: [{ id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 0, height: 10 }] })],
    ]
    for (const [label, source] of cases) {
      await writeCanvas(fixture, space, source)
      const result = await fixture.post({ action: 'canvas-read', spaceId: space.id })
      assert.equal(result.status, 400, label)
      assert.equal(result.body.code, 'canvas-invalid', label)
      assert.match(result.body.error, /脉络\.canvas/, label)
      assert.equal(result.body.nodes, undefined, `${label}：不得返回部分节点`)
    }
  } finally {
    await fixture.close()
  }
})

test('画布读取沿用同一 HTTP 边界：未知字段、未知空间与过大文件都被拒绝', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await writeCanvas(fixture, space, sampleCanvas)

    const extra = await fixture.post({ action: 'canvas-read', spaceId: space.id, content: 'x' })
    assert.equal(extra.status, 400)
    assert.equal(extra.body.code, 'invalid-command')

    const unknownSpace = await fixture.post({ action: 'canvas-read', spaceId: '不存在' })
    assert.equal(unknownSpace.status, 409)
    assert.equal(unknownSpace.body.code, 'space-not-found')

    await writeCanvas(fixture, space, `{"nodes":[],"padding":"${'x'.repeat(canvasReadLimit)}"}`)
    const huge = await fixture.post({ action: 'canvas-read', spaceId: space.id })
    assert.equal(huge.status, 413)
    assert.equal(huge.body.code, 'canvas-too-large')
  } finally {
    await fixture.close()
  }
})

test('脉络正文只留在文件里，不写入插件状态', async () => {
  const fixture = await classroomFixture()
  try {
    const space = await prepare(fixture)
    await writeCanvas(fixture, space, sampleCanvas)
    const result = await fixture.post({ action: 'canvas-read', spaceId: space.id })
    assert.equal(result.status, 200)

    const stateText = await readFile(fixture.stateFile, 'utf8')
    assert.equal(stateText.includes('样本空间'), false)
    assert.equal(stateText.includes('先修'), false)
    assert.equal(stateText.includes('脉络'), false)
    assert.match(stateText, /概率论/)
  } finally {
    await fixture.close()
  }
})
