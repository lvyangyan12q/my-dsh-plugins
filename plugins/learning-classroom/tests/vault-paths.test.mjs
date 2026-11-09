import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { resolveVaultPath, vaultRelativePath } from '../src/vault.ts'
import { spaceDirectoryName } from '../src/spaces.ts'

test('知识库相对路径只接受根内相对形式', () => {
  assert.equal(vaultRelativePath('讲义/01-缩小样本空间.md'), '讲义/01-缩小样本空间.md')
  assert.equal(vaultRelativePath('笔记\\我的笔记.md'), '笔记/我的笔记.md')
  assert.equal(vaultRelativePath('./附件/图.png'), '附件/图.png')

  for (const input of ['', '   ', '..', '../越界.md', 'a/../../b.md', 'a/..', '/etc/passwd', '\\\\server\\share\\x', 'C:\\Windows\\x', 'c:/x', 'a\0b']) {
    assert.throws(() => vaultRelativePath(input), error => error.code === 'vault-path-invalid', `${JSON.stringify(input)} 应被拒绝`)
  }
})

test('空间目录名从标题生成，但拒绝路径分隔符、空名与系统保留名', () => {
  assert.equal(spaceDirectoryName('线性代数 第 1 章'), '线性代数-第-1-章')
  assert.equal(spaceDirectoryName('a<b>c'), 'a-b-c')
  assert.equal(spaceDirectoryName('  概率论  '), '概率论')
  assert.equal(spaceDirectoryName('长'.repeat(100)).length, 60)

  for (const title of ['', '   ', '.', '..', 'a/b', 'a\\b', '../越界', 'CON', 'com1']) {
    assert.throws(() => spaceDirectoryName(title), error => error.code === 'invalid-space-name', `${JSON.stringify(title)} 应被拒绝`)
  }
})

test('真实路径校验拒绝符号链接越界', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'learning-classroom-path-'))
  const vault = join(folder, 'vault')
  const outside = join(folder, 'outside')
  await mkdir(vault)
  await mkdir(outside)
  try {
    assert.equal(await resolveVaultPath(vault, '讲义/01.md'), resolve(vault, '讲义', '01.md'))
    await assert.rejects(resolveVaultPath(vault, '../outside/x.md'), error => error.code === 'vault-path-invalid')

    const link = join(vault, 'escape')
    try {
      await symlink(outside, link, 'junction')
    } catch (error) {
      if (error.code === 'EPERM' || error.code === 'EACCES') { t.skip('当前环境不允许创建目录链接'); return }
      throw error
    }
    await assert.rejects(
      resolveVaultPath(vault, 'escape/笔记.md'),
      error => error.code === 'vault-path-invalid' && /符号链接/.test(error.message),
    )
  } finally {
    await rm(folder, { recursive: true, force: true })
  }
})
