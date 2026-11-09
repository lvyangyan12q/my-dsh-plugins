import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultLayout,
  isNarrowWidth,
  layoutBoundaries,
  narrowThreshold,
  normalizeLayout,
  resizeLayout,
  resolveNarrowZone,
  toggleCollapsed,
  visibleZones,
  zoneWidthBounds,
} from '../src/layout.ts'

test('默认布局：讲义两侧三栏都有可用宽度，且全部展开', () => {
  const layout = defaultLayout()
  assert.deepEqual(layout.widths, { directory: 200, notes: 220, conversation: 240 })
  assert.deepEqual(layout.collapsed, { directory: false, notes: false, conversation: false })
  for (const zone of ['directory', 'notes', 'conversation']) {
    assert.equal(layout.widths[zone] >= zoneWidthBounds[zone].min, true, `${zone} 默认宽度不小于下限`)
    assert.equal(layout.widths[zone] <= zoneWidthBounds[zone].max, true, `${zone} 默认宽度不大于上限`)
  }
})

test('归一化：缺少字段或非数值宽度回落到默认值，旧状态不会读崩', () => {
  assert.deepEqual(normalizeLayout(undefined), defaultLayout())
  assert.deepEqual(normalizeLayout({}), defaultLayout())
  assert.deepEqual(normalizeLayout({ widths: {}, collapsed: {} }), defaultLayout())
  assert.deepEqual(
    normalizeLayout({ widths: { notes: '220' }, collapsed: { notes: 'yes' } }),
    {
      widths: { directory: 200, notes: 220, conversation: 240 },
      collapsed: { directory: false, notes: false, conversation: false },
    },
  )
})

test('截断策略：数值宽度四舍五入后夹到边界，未知字段被忽略', () => {
  const layout = normalizeLayout({
    widths: { directory: 9999, notes: -50, conversation: 300.4, lecture: 12345 },
    collapsed: { directory: true, notes: false, conversation: true },
    extra: 'ignored',
  })
  assert.deepEqual(layout.widths, {
    directory: zoneWidthBounds.directory.max,
    notes: zoneWidthBounds.notes.min,
    conversation: 300,
  })
  assert.deepEqual(layout.collapsed, { directory: true, notes: false, conversation: true })
  assert.equal('extra' in layout, false)
})

test('可见区与相邻分隔条：讲义始终存在，收起一栏后相邻两栏直接相邻', () => {
  const all = layoutBoundaries(defaultLayout())
  assert.deepEqual(all.map(row => [row.leading, row.trailing, row.column]), [
    ['directory', 'lecture', 2],
    ['lecture', 'notes', 4],
    ['notes', 'conversation', 6],
  ])

  const noDirectory = defaultLayout()
  noDirectory.collapsed.directory = true
  assert.deepEqual(visibleZones(noDirectory), ['lecture', 'notes', 'conversation'])
  assert.deepEqual(layoutBoundaries(noDirectory).map(row => [row.leading, row.trailing, row.column]), [
    ['lecture', 'notes', 4],
    ['notes', 'conversation', 6],
  ])

  const noNotes = defaultLayout()
  noNotes.collapsed.notes = true
  assert.deepEqual(layoutBoundaries(noNotes).map(row => [row.leading, row.trailing, row.column]), [
    ['directory', 'lecture', 2],
    ['lecture', 'conversation', 4],
  ])

  const onlyLecture = normalizeLayout({ collapsed: { directory: true, notes: true, conversation: true } })
  assert.deepEqual(visibleZones(onlyLecture), ['lecture'])
  assert.deepEqual(layoutBoundaries(onlyLecture), [])
})

test('拖动分隔条：只影响相邻栏，越界被夹住', () => {
  const start = defaultLayout()

  const directoryEdge = layoutBoundaries(start)[0]
  assert.equal(directoryEdge.adjustable, 'directory')
  assert.equal(resizeLayout(start, directoryEdge, 20).widths.directory, 220)
  assert.equal(resizeLayout(start, directoryEdge, 9999).widths.directory, zoneWidthBounds.directory.max)
  assert.equal(resizeLayout(start, directoryEdge, -9999).widths.directory, zoneWidthBounds.directory.min)
  // 讲义是弹性列，拖动目录分隔条不改动其他栏。
  assert.deepEqual(resizeLayout(start, directoryEdge, 20).widths, { directory: 220, notes: 220, conversation: 240 })

  const notesEdge = layoutBoundaries(start)[1]
  assert.equal(notesEdge.adjustable, 'notes')
  // 分隔条右移 = 笔记变窄，且不小于下限。
  assert.equal(resizeLayout(start, notesEdge, 10).widths.notes, 210)
  assert.equal(resizeLayout(start, notesEdge, 9999).widths.notes, zoneWidthBounds.notes.min)
  // 左移 = 笔记变宽，且不超过上限。
  assert.equal(resizeLayout(start, notesEdge, -9999).widths.notes, zoneWidthBounds.notes.max)

  const conversationEdge = layoutBoundaries(start)[2]
  assert.equal(conversationEdge.adjustable, 'conversation')
  // 笔记与对话两栏固定宽度：右移 20 就从对话借 20，总数不变。
  const moved = resizeLayout(start, conversationEdge, 20).widths
  assert.deepEqual(moved, { directory: 200, notes: 240, conversation: 220 })
  assert.equal(moved.notes + moved.conversation, start.widths.notes + start.widths.conversation)
  // 对话到下限后继续右移，两栏都不再变化。
  const atMinimum = resizeLayout(start, conversationEdge, 200)
  assert.deepEqual(atMinimum.widths, { directory: 200, notes: 240, conversation: zoneWidthBounds.conversation.min })
  assert.deepEqual(resizeLayout(atMinimum, conversationEdge, 200).widths, atMinimum.widths)
})

test('收起与恢复往返不改变宽度', () => {
  const start = defaultLayout()
  const collapsed = toggleCollapsed(start, 'notes')
  assert.equal(collapsed.collapsed.notes, true)
  assert.deepEqual(collapsed.widths, start.widths)
  const restored = toggleCollapsed(collapsed, 'notes')
  assert.deepEqual(restored, start)
  // 无效分区被忽略，不制造新字段。
  assert.deepEqual(toggleCollapsed(start, 'lecture'), start)
})

test('窄屏判定使用容器宽度：未知宽度按宽屏处理，阈值以下分区显示', () => {
  assert.equal(isNarrowWidth(null), false)
  assert.equal(isNarrowWidth(undefined), false)
  assert.equal(isNarrowWidth(0), false)
  assert.equal(isNarrowWidth(Number.NaN), false)
  assert.equal(isNarrowWidth(narrowThreshold - 1), true)
  assert.equal(isNarrowWidth(narrowThreshold), false)
  assert.equal(isNarrowWidth(1200), false)

  assert.equal(resolveNarrowZone(undefined), 'lecture')
  assert.equal(resolveNarrowZone('不存在'), 'lecture')
  assert.equal(resolveNarrowZone('notes'), 'notes')
  assert.equal(resolveNarrowZone('conversation'), 'conversation')
})
