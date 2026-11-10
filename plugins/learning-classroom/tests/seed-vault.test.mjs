import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { seedVault, SeedRefusedError, themeName } from '../scripts/seed-vault.mjs'

const script = fileURLToPath(new URL('../scripts/seed-vault.mjs', import.meta.url))

/** Run the real CLI entry, exactly as an operator would. */
function runSeed(vault) {
  return new Promise(resolve => {
    execFile(process.execPath, [script, vault], { encoding: 'utf8' }, (error, stdout, stderr) => {
      resolve({ code: error === null ? 0 : (typeof error.code === 'number' ? error.code : 1), stdout, stderr })
    })
  })
}

const lectureRel = join(themeName, '讲义', '01-样本空间.md')
const noteRel = join(themeName, '笔记', '我的笔记.md')
const canvasRel = join(themeName, '脉络.canvas')

/** Leftover private staging would show up as a `.seed-*` entry. */
async function stagingLeftovers(root) {
  return (await readdir(root)).filter(name => name.startsWith('.seed-'))
}

async function withVault(run) {
  const root = await mkdtemp(join(tmpdir(), 'seed-vault-'))
  try {
    await run(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('首次运行在空知识库里生成讲义、笔记与合法画布', async () => {
  await withVault(async root => {
    const result = await runSeed(root)
    assert.equal(result.code, 0, result.stderr)
    const lecture = await readFile(join(root, lectureRel), 'utf8')
    const note = await readFile(join(root, noteRel), 'utf8')
    assert.match(lecture, /样本空间与事件/)
    assert.match(lecture, /P\(A \\cup B\)/)
    assert.match(note, /我的笔记/)
    const canvas = JSON.parse(await readFile(join(root, canvasRel), 'utf8'))
    assert.equal(canvas.nodes.length, 4)
    assert.equal(canvas.edges.length, 2)
    assert.deepEqual(await stagingLeftovers(root), [])
  })
})

test('已有主题（即使为空目录）一律拒绝，不进入也不留 staging', async () => {
  await withVault(async root => {
    const theme = join(root, themeName)
    await mkdir(theme)
    const result = await runSeed(root)
    assert.notEqual(result.code, 0, '目标主题已存在时必须拒绝')
    assert.match(result.stderr, /已存在|拒绝|refus/i)
    assert.deepEqual(await readdir(theme), [], '既有主题必须保持为空，且没有被写入')
    assert.deepEqual(await readdir(root), [themeName], '拒绝后知识库不得多出任何东西')
  })
})

test('中途失败只清理自己的私有 staging，知识库保持原样', async () => {
  await withVault(async root => {
    await assert.rejects(
      seedVault(root, { beforePublish: () => { throw new Error('assembly boom') } }),
      /assembly boom/,
    )
    assert.equal(existsSync(join(root, themeName)), false, '失败时不得发布任何主题')
    assert.deepEqual(await readdir(root), [], '失败时不得留下任何残留')
  })
})

test('发布时目标被抢占则拒绝，绝不覆盖竞争创建的主题', async () => {
  await withVault(async root => {
    await assert.rejects(
      seedVault(root, {
        beforePublish: () => mkdir(join(root, themeName)),
      }),
      error => error instanceof SeedRefusedError,
    )
    assert.deepEqual(await readdir(join(root, themeName)), [], '竞争创建的空主题不得被写入')
    assert.deepEqual(await readdir(root), [themeName], '失败后不得留下 staging 或半成品')
  })
})

test('既有主题里有学习者内容时同样拒绝，内容逐字保留', async () => {
  await withVault(async root => {
    const theme = join(root, themeName)
    await mkdir(join(theme, '笔记'), { recursive: true })
    const existing = '# 我的笔记\n\n学习者自己的内容。\n'
    await writeFile(join(theme, '笔记', '我的笔记.md'), existing, 'utf8')

    const result = await runSeed(root)
    assert.notEqual(result.code, 0)
    assert.equal(await readFile(join(theme, '笔记', '我的笔记.md'), 'utf8'), existing)
    assert.deepEqual(await stagingLeftovers(root), [])
  })
})
