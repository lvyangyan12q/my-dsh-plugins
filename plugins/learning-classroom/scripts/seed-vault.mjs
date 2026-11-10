// 生成隔离测试知识库：一节含公式/代码/表格的讲义、一份个人笔记和一张合法 JSON Canvas 脉络。
//
// 安全契约：
// - 只在**全新主题**上工作：目标主题（`概率论`）已存在一律拒绝，绝不进入、绝不覆盖既有主题。
// - 先在知识库根下的**私有 staging 目录**里组装整个主题，最后一次性 `rename` 发布。
//   Windows 上 `rename` 到已存在的目录（即使为空）会以 EPERM 拒绝，因此发布本身不会覆盖竞争目标。
// - 失败时只删除自己创建的私有 staging 目录，绝不对任何公开路径做 `rm`。
//
// 用法：node scripts/seed-vault.mjs <vault-root>

import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const themeName = '概率论'

/** 拒绝写入：目标主题已存在，或发布时目标被抢占。调用方必须把它当作"什么都没写"。 */
export class SeedRefusedError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SeedRefusedError'
  }
}

const lecture = `---
title: 样本空间与事件
order: 1
---

# 样本空间与事件

概率论研究随机试验所有可能结果构成的集合。样本空间通常记作 $\\Omega$，
其中一个结果 $\\omega \\in \\Omega$ 称为样本点。

## 事件与运算

事件是样本空间的子集。两个事件 $A$、$B$ 的并、交与差分别记作
$A \\cup B$、$A \\cap B$、$A \\setminus B$。

若 $A \\cap B = \\varnothing$，则称 $A$ 与 $B$ 互斥。对任意两个事件有

$$P(A \\cup B) = P(A) + P(B) - P(A \\cap B)$$

## 古典概型

当样本空间有限且每个样本点等可能时，

$$P(A) = \\frac{|A|}{|\\Omega|}$$

下表把常见操作和计数含义对应起来：

| 操作 | 记号 | 计数含义 |
| --- | --- | --- |
| 并 | $A \\cup B$ | 至少属于一个 |
| 交 | $A \\cap B$ | 同时属于两个 |
| 差 | $A \\setminus B$ | 属于 A 但不属于 B |

## 用代码验证

下面的片段枚举骰子两次投掷，核对互斥事件概率可加：

\`\`\`python
from itertools import product

omega = list(product(range(1, 7), repeat=2))
a = [w for w in omega if sum(w) == 7]
b = [w for w in omega if sum(w) == 11]
assert not (set(a) & set(b))
print(len(a) / len(omega) + len(b) / len(omega))
\`\`\`

> 说明：本讲义为隔离验收用的样例内容，不构成教学结论。

## 参考来源

- 概率论教材中「样本空间与事件」一章的定义。
`

const note = `# 我的笔记

## 2026-11-10 首次阅读

- 老师的解释和教材定义要分开记：这里是我自己的理解。
- 公式 $P(A \\cup B) = P(A) + P(B) - P(A \\cap B)$ 里，减掉交集是为了不重复计数。
- 待确认：互斥和独立不是一回事，下次请老师用例子说明。

## 下一步

- 用代码片段跑一遍，看 $\\frac{6}{36} + \\frac{2}{36}$ 是否等于 $\\frac{8}{36}$。
`

const canvas = {
  nodes: [
    {
      id: 'lecture-space',
      type: 'file',
      file: '概率论/讲义/01-样本空间.md',
      x: 0,
      y: 0,
      width: 420,
      height: 160,
      color: '1',
    },
    {
      id: 'note-first',
      type: 'file',
      file: '概率论/笔记/我的笔记.md',
      x: 0,
      y: 240,
      width: 420,
      height: 160,
      color: '4',
    },
    {
      id: 'concept-mutex',
      type: 'text',
      text: '互斥事件：交集为空',
      x: 520,
      y: 0,
      width: 260,
      height: 120,
    },
    {
      id: 'group-sample',
      type: 'group',
      label: '样本空间',
      x: -40,
      y: -60,
      width: 900,
      height: 520,
    },
  ],
  edges: [
    {
      id: 'edge-note-lecture',
      fromNode: 'note-first',
      toNode: 'lecture-space',
      label: '先修：先读讲义',
      fromSide: 'top',
      toSide: 'bottom',
      toEnd: 'arrow',
    },
    {
      id: 'edge-lecture-mutex',
      fromNode: 'lecture-space',
      toNode: 'concept-mutex',
      label: '包含',
      fromSide: 'right',
      toSide: 'left',
      toEnd: 'arrow',
    },
  ],
}

/**
 * Seed one brand-new theme into a knowledge vault.
 *
 * The whole theme is assembled inside a private staging directory under the
 * vault root, then published with a single `rename`. Nothing outside staging is
 * ever written before publication, and only staging is ever deleted — a failed
 * or refused run leaves the vault exactly as it was.
 *
 * @param rootInput Vault root; created when missing.
 * @param options.beforePublish Test seam: runs after assembly, before publish.
 * @returns Absolute path of the published theme.
 * @throws {SeedRefusedError} when the theme exists up front or loses the publish race.
 */
export async function seedVault(rootInput, options = {}) {
  if (typeof rootInput !== 'string' || rootInput.trim() === '') {
    throw new Error('用法：node scripts/seed-vault.mjs <vault-root>')
  }
  const root = resolve(rootInput)
  if (/[\\/]\.dsh([\\/]|$)/i.test(root)) {
    throw new SeedRefusedError(`拒绝在正式 DSH profile 内生成样例：${root}`)
  }

  const theme = join(root, themeName)
  // Refuse before creating anything, including the vault root's theme folder:
  // an existing theme belongs to the learner, empty or not.
  if (existsSync(theme)) {
    throw new SeedRefusedError(
      `拒绝写入：${theme} 已存在（空目录也算）。本次未写入任何文件；请改用空知识库，或自行确认后删除该主题再运行。`,
    )
  }

  await mkdir(root, { recursive: true })
  const staging = await mkdtemp(join(root, '.seed-'))
  try {
    const space = join(staging, themeName)
    const lectureDir = join(space, '讲义')
    const noteDir = join(space, '笔记')
    await mkdir(lectureDir, { recursive: true })
    await mkdir(noteDir, { recursive: true })
    await mkdir(join(space, '附件'), { recursive: true })

    // Plain creates inside our own staging: a partially written file here is
    // never observable and disappears with the staging directory.
    await writeFile(join(lectureDir, '01-样本空间.md'), lecture, 'utf8')
    await writeFile(join(noteDir, '我的笔记.md'), note, 'utf8')
    await writeFile(join(space, '脉络.canvas'), `${JSON.stringify(canvas, null, 2)}\n`, 'utf8')

    if (typeof options.beforePublish === 'function') await options.beforePublish(space)

    // `rename` is the only publication step. On Windows it refuses an existing
    // target directory (even an empty one), so a racing creator is not overwritten.
    try {
      await rename(space, theme)
    } catch (error) {
      const code = error !== null && typeof error === 'object' ? error.code : undefined
      if (code === 'EEXIST' || code === 'ENOTEMPTY' || code === 'EPERM' || code === 'EACCES') {
        throw new SeedRefusedError(
          `拒绝发布：${theme} 在生成期间已被创建或无法替换（${code}）。未覆盖目标，本次生成已放弃。`,
        )
      }
      throw error
    }
    return theme
  } finally {
    // Only the private staging directory is removed; no public path is ever deleted.
    await rm(staging, { recursive: true, force: true }).catch(() => {})
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (invokedDirectly) {
  try {
    const theme = await seedVault(process.argv[2])
    console.log(`隔离知识库已生成：${theme}`)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(reason)
    process.exitCode = 1
  }
}
