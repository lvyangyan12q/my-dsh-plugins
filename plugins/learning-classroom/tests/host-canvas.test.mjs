import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile, writeFile } from 'node:fs/promises'
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
      message: null,
    })
    assert.deepEqual(byId.get('note').target, {
      path: '笔记/我的笔记.md',
      vaultPath: '概率论/笔记/我的笔记.md',
      kind: 'note',
      status: 'ok',
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
