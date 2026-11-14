import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertVaultWriteAllowed, noteConflict, noteRelativePath, noteVersion } from '../src/notes.ts'

test('笔记版本是内容哈希：同样内容同版本，改一个字版本就变', () => {
  // Known-good SHA-256 digests, independent of the implementation.
  assert.equal(noteVersion(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  assert.equal(noteVersion('hello'), '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  assert.notEqual(noteVersion('hello'), noteVersion('hello!'))
  assert.equal(noteVersion('# 笔记\n'), noteVersion('# 笔记\n'))
})

test('冲突判定只比较读取时版本与当前内容哈希', () => {
  assert.equal(noteConflict(noteVersion('hello'), 'hello'), false)
  assert.equal(noteConflict(noteVersion('hello'), 'hello!'), true)
  assert.equal(noteConflict('', 'hello'), true)
})

test('笔记路径必须是空间内 笔记/ 目录下的 Markdown 文件', () => {
  assert.equal(noteRelativePath('笔记/我的笔记.md'), '笔记/我的笔记.md')
  assert.equal(noteRelativePath('笔记\\我的笔记.md'), '笔记/我的笔记.md')
  assert.equal(noteRelativePath('笔记/子目录/想法.MD'), '笔记/子目录/想法.MD')
  for (const bad of ['我的笔记.md', '讲义/01.md', '笔记/../讲义/01.md', '笔记/想法.txt', '笔记/', '', '../笔记/我的笔记.md', '/笔记/我的笔记.md', 'D:/笔记/我的笔记.md']) {
    assert.throws(() => noteRelativePath(bad), error => error.code === 'note-path-invalid', `${bad} 应被拒绝`)
  }
})

test('笔记目录只允许 note-save 写入，老师工具被拒绝', () => {
  assert.doesNotThrow(() => assertVaultWriteAllowed('note-save', '空间/笔记/我的笔记.md'))
  assert.doesNotThrow(() => assertVaultWriteAllowed('teacher', '空间/讲义/01.md'))
  assert.doesNotThrow(() => assertVaultWriteAllowed('teacher', '空间/脉络.canvas'))
  for (const path of ['空间/笔记/我的笔记.md', '笔记/我的笔记.md', '空间/笔记/子目录/想法.md']) {
    assert.throws(() => assertVaultWriteAllowed('teacher', path), error => error.code === 'note-write-forbidden', `${path} 应拒绝老师写入`)
  }
})
