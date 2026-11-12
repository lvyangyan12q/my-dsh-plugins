import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatWikilink, headingKey, parseWikilink } from '../src/links.ts'

test('双链解析支持文件、别名、标题与已有块引用', () => {
  assert.deepEqual(parseWikilink('[[概率论/讲义/01]]'), {
    ok: true,
    parts: { raw: '概率论/讲义/01', file: '概率论/讲义/01', heading: null, blockId: null, alias: null },
  })

  assert.deepEqual(parseWikilink('[[01#第一节]]'), {
    ok: true,
    parts: { raw: '01#第一节', file: '01', heading: '第一节', blockId: null, alias: null },
  })

  assert.deepEqual(parseWikilink('[[01#^abc123]]'), {
    ok: true,
    parts: { raw: '01#^abc123', file: '01', heading: null, blockId: 'abc123', alias: null },
  })

  assert.deepEqual(parseWikilink('[[01#第一节|显示文字]]'), {
    ok: true,
    parts: { raw: '01#第一节|显示文字', file: '01', heading: '第一节', blockId: null, alias: '显示文字' },
  })

  // Obsidian 的同文件引用：文件部分可以为空，但必须有标题或块。
  assert.deepEqual(parseWikilink('[[#本节小结]]'), {
    ok: true,
    parts: { raw: '#本节小结', file: '', heading: '本节小结', blockId: null, alias: null },
  })

  // 输入框也接受不带方括号的目标，方便直接粘贴。
  assert.deepEqual(parseWikilink('笔记/我的笔记.md#^note-1'), {
    ok: true,
    parts: { raw: '笔记/我的笔记.md#^note-1', file: '笔记/我的笔记.md', heading: null, blockId: 'note-1', alias: null },
  })
})

test('双链解析拒绝空目标、换行与残缺方括号', () => {
  for (const input of ['', '   ', '[[]]', '[[#]]', '[[#|显示]]', '[[a\nb]]', '[[a]] 多余', '[[未闭合']) {
    const parsed = parseWikilink(input)
    assert.equal(parsed.ok, false, `应拒绝：${JSON.stringify(input)}`)
    assert.equal(typeof parsed.message, 'string')
  }
})

test('生成的双链总是 Vault 相对、带真实标题或块且不带伪造块 id', () => {
  assert.equal(formatWikilink('概率论/讲义/第一章/01.md'), '[[概率论/讲义/第一章/01.md]]')
  assert.equal(formatWikilink('概率论/讲义/第一章/01.md', { heading: '第一节' }), '[[概率论/讲义/第一章/01.md#第一节]]')
  assert.equal(formatWikilink('概率论/讲义/第一章/01.md', { heading: '第一节', alias: '缩小样本空间' }), '[[概率论/讲义/第一章/01.md#第一节|缩小样本空间]]')
  assert.equal(formatWikilink('概率论/笔记/我的笔记.md', { blockId: 'note-1' }), '[[概率论/笔记/我的笔记.md#^note-1]]')
  // 标题优先于块；调用方不会同时给出两者以外的伪造目标。
  assert.equal(formatWikilink('a.md', { heading: '小节', blockId: 'ignored' }), '[[a.md#小节]]')
})

test('标题比较用 NFC、去首尾空白且不区分大小写；内部空白不折叠', () => {
  assert.equal(headingKey('  第一节 '), headingKey('第一节'))
  assert.equal(headingKey('First Section'), headingKey('first section'))
  assert.equal(headingKey('A  B'), 'a  b')
  assert.notEqual(headingKey('A  B'), headingKey('A B'))
})
