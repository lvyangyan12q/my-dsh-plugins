import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildLinkIndex, markdownBlockIds, markdownHeadings, resolveVaultLink } from '../src/link-index.ts'

test('围栏按字符与长度配对：4 个反引号里的 3 个反引号不关闭代码块', () => {
  const source = ['````ts', '```', '# 不是标题', '结论 ^fake-block', '````', '# 真标题', '', '正文 ^real-block'].join('\n')
  assert.deepEqual(markdownHeadings(source), ['真标题'])
  assert.deepEqual(markdownBlockIds(source), ['real-block'])
})

test('更长的围栏可以关闭更短的围栏，波浪线不与反引号混用', () => {
  const source = ['~~~', '```', '# 仍在代码里', '~~~~', '# 真标题'].join('\n')
  assert.deepEqual(markdownHeadings(source), ['真标题'])
})

test('独立一行的 ^块id 是合法已有块引用', () => {
  assert.deepEqual(markdownBlockIds('段落内容\n\n^standalone-block\n'), ['standalone-block'])
})

async function vaultWith(files) {
  const root = await mkdtemp(join(tmpdir(), 'learning-classroom-links-'))
  for (const [path, content] of Object.entries(files)) {
    const target = join(root, path)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content, 'utf8')
  }
  return { root, close: () => rm(root, { recursive: true, force: true }) }
}

function resolveOptions(root, index, target, extra = {}) {
  return {
    root,
    index,
    space: { directory: 'Course' },
    spaceId: 'space-1',
    target,
    probe: { realpath, readdir },
    ...extra,
  }
}

test('没有标题/块的文件链接也要最终校验真实文件存在，不能只信索引命中', async () => {
  const vault = await vaultWith({ 'Course/笔记/真.md': '# 真\n' })
  try {
    const view = await resolveVaultLink(resolveOptions(vault.root, { files: ['Course/讲义/intro.md'] }, 'Course/讲义/intro.md'))
    assert.equal(view.status, 'missing')
    assert.equal(view.link, null)
    assert.match(view.message, /不存在|无法访问|找不到/)
  } finally {
    await vault.close()
  }
})

test('真实路径无法解析时即使索引命中也不返回 ok（reviewer 复现）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'learning-classroom-ghost-'))
  try {
    const view = await resolveVaultLink({
      root,
      index: { files: ['Course/讲义/intro.md'] },
      space: { directory: 'Course' },
      spaceId: 'space-1',
      target: 'Course/讲义/intro.md',
      probe: {
        realpath: async () => { throw new Error('outside') },
        readdir,
      },
    })
    assert.notEqual(view.status, 'ok')
    assert.equal(view.link, null)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('别名解析遇到不可读/消失的索引文件时 fail closed，不静默当作缺失', async () => {
  const vault = await vaultWith({ 'Course/笔记/真.md': '# 真\n' })
  try {
    await assert.rejects(
      resolveVaultLink(resolveOptions(vault.root, { files: ['Course/笔记/真.md', 'Course/笔记/不见了.md'] }, '某个别名')),
      error => error?.code === 'link-index-incomplete' && /别名|完整|读取/.test(error.message),
    )
  } finally {
    await vault.close()
  }
})

test('非根目录不可读时索引 fail closed，不跳过目录隐藏重名歧义', async () => {
  const root = await mkdtemp(join(tmpdir(), 'learning-classroom-index-'))
  try {
    await mkdir(join(root, 'Course', '坏目录'), { recursive: true })
    await writeFile(join(root, 'Course', '坏目录', '同名.md'), '# 一个\n', 'utf8')
    const probe = {
      realpath,
      async readdir(path, options) {
        if (path.endsWith('坏目录')) throw Object.assign(new Error('拒绝访问'), { code: 'EACCES' })
        return readdir(path, options)
      },
    }
    await assert.rejects(
      buildLinkIndex(root, probe),
      error => error?.code === 'link-index-incomplete' && /完整|读取|坏目录/.test(error.message),
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
