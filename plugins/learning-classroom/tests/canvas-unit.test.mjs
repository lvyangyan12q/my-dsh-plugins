import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CanvasFormatError,
  canvasFileName,
  classifyCanvasTarget,
  classifyRelation,
  isSafeCanvasUrl,
  parseCanvasDocument,
  relationName,
} from '../src/canvas.ts'

const validSource = JSON.stringify({
  nodes: [
    { id: 'n1', type: 'text', text: '样本空间', x: 0, y: 0, width: 200, height: 80, color: '1' },
    { id: 'n2', type: 'file', file: '概率论/讲义/01-样本空间.md', x: 300, y: 0, width: 200, height: 80 },
    { id: 'n3', type: 'file', file: '笔记/我的笔记.md', x: 0, y: 200, width: 200, height: 80 },
    { id: 'n4', type: 'link', url: 'https://example.com/reading', x: 300, y: 200, width: 200, height: 80 },
    { id: 'n5', type: 'group', label: '基础', x: -50, y: -50, width: 600, height: 400 },
  ],
  edges: [
    { id: 'e1', fromNode: 'n1', toNode: 'n2', label: '先修' },
    { id: 'e2', fromNode: 'n3', toNode: 'n4', label: '应用', toEnd: 'arrow' },
  ],
})

test('合法画布解析出文本、文件、链接、分组节点与带标签的有向边', () => {
  const canvas = parseCanvasDocument(validSource)
  assert.equal(canvasFileName, '脉络.canvas')
  assert.equal(canvas.nodes.length, 5)
  assert.deepEqual(canvas.nodes.map(node => node.type), ['text', 'file', 'file', 'link', 'group'])

  const byId = new Map(canvas.nodes.map(node => [node.id, node]))
  assert.equal(byId.get('n1').text, '样本空间')
  assert.equal(byId.get('n1').color, '1')
  assert.equal(byId.get('n2').file, '概率论/讲义/01-样本空间.md')
  assert.equal(byId.get('n4').url, 'https://example.com/reading')
  assert.equal(byId.get('n5').label, '基础')
  assert.deepEqual(
    [byId.get('n2').x, byId.get('n2').y, byId.get('n2').width, byId.get('n2').height],
    [300, 0, 200, 80],
  )

  assert.equal(canvas.edges.length, 2)
  assert.deepEqual(
    canvas.edges.map(edge => [edge.fromNode, edge.toNode, edge.label, edge.relation]),
    [['n1', 'n2', '先修', 'prerequisite'], ['n3', 'n4', '应用', 'application']],
  )
  // JSON Canvas defaults: fromEnd none, toEnd arrow. An omitted toEnd keeps the
  // standard arrow; an explicit `none` removes it.
  assert.equal(canvas.edges[0].fromEnd, 'none')
  assert.equal(canvas.edges[0].toEnd, 'arrow')
  assert.equal(canvas.edges[1].fromEnd, 'none')
  assert.equal(canvas.edges[1].toEnd, 'arrow')
  assert.equal(canvas.edges[0].selfLoop, false)
  // Bounds cover every node, including the group that starts at negative coordinates.
  assert.equal(canvas.width, 600)
  assert.equal(canvas.height, 400)
})

test('文件节点读取标准 subpath 字段，非法 subpath 让整张画布不合法', () => {
  const source = JSON.stringify({
    nodes: [
      { id: 'n1', type: 'file', file: '概率论/讲义/01.md', subpath: '#条件概率', x: 0, y: 0, width: 10, height: 10 },
      { id: 'n2', type: 'file', file: '概率论/笔记/我的笔记.md', x: 20, y: 0, width: 10, height: 10 },
    ],
  })
  const canvas = parseCanvasDocument(source)
  assert.equal(canvas.nodes[0].subpath, '#条件概率')
  assert.equal(canvas.nodes[1].subpath, null)

  const malformed = JSON.stringify({
    nodes: [{ id: 'n1', type: 'file', file: '概率论/讲义/01.md', subpath: '条件概率', x: 0, y: 0, width: 10, height: 10 }],
  })
  assert.throws(() => parseCanvasDocument(malformed), CanvasFormatError)
  const empty = JSON.stringify({
    nodes: [{ id: 'n1', type: 'file', file: '概率论/讲义/01.md', subpath: '#', x: 0, y: 0, width: 10, height: 10 }],
  })
  assert.throws(() => parseCanvasDocument(empty), CanvasFormatError)
})

test('关系类型从边标签区分：先修、组成、应用，其余归为相关', () => {
  assert.equal(classifyRelation('先修'), 'prerequisite')
  assert.equal(classifyRelation('先修：样本空间'), 'prerequisite')
  assert.equal(classifyRelation(' 组成 '), 'composition')
  assert.equal(classifyRelation('应用场景'), 'application')
  assert.equal(classifyRelation('参考'), 'related')
  assert.equal(classifyRelation(''), 'related')
  assert.equal(classifyRelation(undefined), 'related')
  assert.equal(relationName('prerequisite'), '先修')
  assert.equal(relationName('composition'), '组成')
  assert.equal(relationName('application'), '应用')
  assert.equal(relationName('related'), '相关')
})

test('边引用不存在的节点、重复 id、未知类型都让整张画布不合法', () => {
  const dangling = JSON.stringify({
    nodes: [{ id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10 }],
    edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2', label: '先修' }],
  })
  assert.throws(() => parseCanvasDocument(dangling), error => {
    assert.ok(error instanceof CanvasFormatError)
    assert.match(error.reason, /n2|不存在/)
    return true
  })

  const duplicate = JSON.stringify({
    nodes: [
      { id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'n1', type: 'text', text: 'b', x: 20, y: 0, width: 10, height: 10 },
    ],
  })
  assert.throws(() => parseCanvasDocument(duplicate), /重复/)

  const unknownType = JSON.stringify({
    nodes: [{ id: 'n1', type: 'image', x: 0, y: 0, width: 10, height: 10 }],
  })
  assert.throws(() => parseCanvasDocument(unknownType), error => {
    assert.ok(error instanceof CanvasFormatError)
    assert.match(error.reason, /image/)
    return true
  })
})

test('必需字段、坐标与尺寸必须合法，非法时不产出任何节点', () => {
  const cases = [
    ['顶层不是对象', '[]'],
    ['缺少 nodes', JSON.stringify({ edges: [] })],
    ['nodes 不是数组', JSON.stringify({ nodes: {} })],
    ['文本节点缺少 text', JSON.stringify({ nodes: [{ id: 'n1', type: 'text', x: 0, y: 0, width: 10, height: 10 }] })],
    ['文件节点缺少 file', JSON.stringify({ nodes: [{ id: 'n1', type: 'file', x: 0, y: 0, width: 10, height: 10 }] })],
    ['链接节点缺少 url', JSON.stringify({ nodes: [{ id: 'n1', type: 'link', x: 0, y: 0, width: 10, height: 10 }] })],
    ['坐标不是数字', JSON.stringify({ nodes: [{ id: 'n1', type: 'text', text: 'a', x: '0', y: 0, width: 10, height: 10 }] })],
    ['坐标不是有限数', JSON.stringify({ nodes: [{ id: 'n1', type: 'text', text: 'a', x: 1e308, y: 0, width: 10, height: 10 }] })],
    ['宽度为负', JSON.stringify({ nodes: [{ id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: -1, height: 10 }] })],
    ['高度为零', JSON.stringify({ nodes: [{ id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 0 }] })],
    ['边 id 重复', JSON.stringify({
      nodes: [{ id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10 }],
      edges: [
        { id: 'e1', fromNode: 'n1', toNode: 'n1' },
        { id: 'e1', fromNode: 'n1', toNode: 'n1' },
      ],
    })],
    ['箭头取值未知', JSON.stringify({
      nodes: [
        { id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'n2', type: 'text', text: 'b', x: 20, y: 0, width: 10, height: 10 },
      ],
      edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2', toEnd: 'triangle' }],
    })],
  ]
  for (const [label, source] of cases) {
    let canvas
    try {
      canvas = parseCanvasDocument(source)
    } catch (error) {
      assert.ok(error instanceof CanvasFormatError, `${label}：应抛出 CanvasFormatError，实际 ${error}`)
      assert.ok(error.reason.length > 0, `${label}：错误应说明原因`)
      continue
    }
    assert.fail(`${label}：应被拒绝，实际解析出 ${canvas.nodes.length} 个节点`)
  }

  let broken
  try {
    broken = parseCanvasDocument('{ 不是 JSON')
  } catch (error) {
    assert.ok(error instanceof CanvasFormatError)
    assert.match(error.reason, /JSON/)
  }
  assert.equal(broken, undefined)
})

test('关系不是有向无环图：允许环，自引用边被显式标记为自环', () => {
  const source = JSON.stringify({
    nodes: [
      { id: 'a', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'b', type: 'text', text: 'b', x: 20, y: 0, width: 10, height: 10 },
      { id: 'c', type: 'text', text: 'c', x: 40, y: 0, width: 10, height: 10 },
    ],
    edges: [
      { id: 'ab', fromNode: 'a', toNode: 'b', label: '先修' },
      { id: 'bc', fromNode: 'b', toNode: 'c', label: '组成' },
      { id: 'ca', fromNode: 'c', toNode: 'a', label: '应用' },
      { id: 'aa', fromNode: 'a', toNode: 'a', label: '先修' },
    ],
  })
  const canvas = parseCanvasDocument(source)
  assert.equal(canvas.edges.length, 4)
  assert.equal(canvas.edges.filter(edge => edge.selfLoop).length, 1)
  assert.equal(canvas.edges.at(-1).selfLoop, true)
  assert.equal(canvas.edges.at(-1).relation, 'prerequisite')
})

test('未知的扩展字段被容忍，未知的枚举字段不被容忍', () => {
  const extended = JSON.stringify({
    nodes: [{
      id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10,
      futureExtension: { whatever: true },
    }],
    edges: [],
    metadata: { generator: 'obsidian' },
  })
  assert.equal(parseCanvasDocument(extended).nodes.length, 1)

  const sideEnum = JSON.stringify({
    nodes: [
      { id: 'n1', type: 'text', text: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'n2', type: 'text', text: 'b', x: 20, y: 0, width: 10, height: 10 },
    ],
    edges: [{ id: 'e1', fromNode: 'n1', toNode: 'n2', fromSide: 'middle' }],
  })
  assert.throws(() => parseCanvasDocument(sideEnum), CanvasFormatError)
})

test('文件节点目标接受嵌套章节、已关联讲义与真实标题/块片段', () => {
  assert.deepEqual(classifyCanvasTarget('第二主题验收/讲义/第一章/01-条件概率.md', '第二主题验收'), {
    kind: 'lecture',
    path: '讲义/第一章/01-条件概率.md',
    heading: null,
    blockId: null,
  })
  // JSON Canvas file nodes carry the anchor in a separate standard `subpath`
  // field; `file#anchor` stays accepted for hand-written/legacy canvases.
  assert.deepEqual(
    classifyCanvasTarget('讲义/第一章/01-条件概率.md', '第二主题验收', { subpath: '#条件概率' }),
    { kind: 'lecture', path: '讲义/第一章/01-条件概率.md', heading: '条件概率', blockId: null },
  )
  assert.deepEqual(
    classifyCanvasTarget('讲义/第二章/02-独立性.md', '第二主题验收', { subpath: '#^独立定义' }),
    { kind: 'lecture', path: '讲义/第二章/02-独立性.md', heading: null, blockId: '独立定义' },
  )
  assert.equal(classifyCanvasTarget('讲义/01.md', '第二主题验收', { subpath: '条件概率' }), null)
  assert.equal(classifyCanvasTarget('讲义/01.md', '第二主题验收', { subpath: '#' }), null)
  // Conflicting inline and standard anchors are refused, never guessed.
  assert.equal(
    classifyCanvasTarget('讲义/01.md#条件概率', '第二主题验收', { subpath: '#其他标题' }),
    null,
  )
  assert.deepEqual(classifyCanvasTarget('第二主题验收/笔记/复习/第一章.md', '第二主题验收'), {
    kind: 'note',
    path: '笔记/复习/第一章.md',
    heading: null,
    blockId: null,
  })
  assert.deepEqual(
    classifyCanvasTarget('资料/概率/改名资料.md', '第二主题验收', { linkedLectures: ['资料/概率/改名资料.md'] }),
    { kind: 'lecture', path: '资料/概率/改名资料.md', heading: null, blockId: null },
  )
  assert.deepEqual(
    classifyCanvasTarget('第二主题验收/讲义/第一章/01-条件概率.md#条件概率', '第二主题验收'),
    { kind: 'lecture', path: '讲义/第一章/01-条件概率.md', heading: '条件概率', blockId: null },
  )
  assert.deepEqual(
    classifyCanvasTarget('讲义/第二章/02-独立性.md#^独立定义', '第二主题验收'),
    { kind: 'lecture', path: '讲义/第二章/02-独立性.md', heading: null, blockId: '独立定义' },
  )
  // A space file is only openable when it is an explicitly linked course file.
  assert.equal(classifyCanvasTarget('资料/未关联.md', '第二主题验收'), null)
  assert.equal(classifyCanvasTarget('别的课/讲义/01.md', '第二主题验收'), null)
})

test('文件节点目标只接受本空间讲义或笔记，其他路径返回 null 交给调用方提示', () => {
  assert.deepEqual(classifyCanvasTarget('概率论/讲义/01-样本空间.md', '概率论'), {
    kind: 'lecture',
    path: '讲义/01-样本空间.md',
    heading: null,
    blockId: null,
  })
  assert.deepEqual(classifyCanvasTarget('讲义/02-实验.html', '概率论'), {
    kind: 'lecture',
    path: '讲义/02-实验.html',
    heading: null,
    blockId: null,
  })
  assert.deepEqual(classifyCanvasTarget('概率论/笔记/我的笔记.md', '概率论'), {
    kind: 'note',
    path: '笔记/我的笔记.md',
    heading: null,
    blockId: null,
  })
  assert.equal(classifyCanvasTarget('附件/图表.png', '概率论'), null)
  assert.equal(classifyCanvasTarget('别的课/讲义/01.md', '概率论'), null)
  assert.deepEqual(classifyCanvasTarget('笔记/子目录/深层.md', '概率论'), {
    kind: 'note',
    path: '笔记/子目录/深层.md',
    heading: null,
    blockId: null,
  })
  assert.equal(classifyCanvasTarget('讲义/说明.txt', '概率论'), null)
  assert.equal(classifyCanvasTarget('../外面.md', '概率论'), null)
  assert.equal(classifyCanvasTarget('D:\\外面.md', '概率论'), null)
  assert.equal(classifyCanvasTarget('讲义/01.md#', '概率论'), null)
  assert.equal(classifyCanvasTarget('讲义/01.md#^', '概率论'), null)
})

test('链接节点只把 http(s)/mailto 当作可点击链接', () => {
  assert.equal(isSafeCanvasUrl('https://example.com/a'), true)
  assert.equal(isSafeCanvasUrl('http://example.com'), true)
  assert.equal(isSafeCanvasUrl('mailto:teacher@example.com'), true)
  assert.equal(isSafeCanvasUrl('javascript:alert(1)'), false)
  assert.equal(isSafeCanvasUrl('data:text/html,<script>'), false)
  assert.equal(isSafeCanvasUrl('//example.com'), false)
  assert.equal(isSafeCanvasUrl(''), false)
})
