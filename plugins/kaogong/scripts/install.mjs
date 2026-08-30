#!/usr/bin/env node
/**
 * 把 kaogong 插件接入一个 DeepSeek Harness 仓库。
 *
 * 用法（在 kaogong 目录下）：
 *   node scripts/install.mjs --dsh ../deepseek-harness
 *   node scripts/install.mjs --dsh ../deepseek-harness --cordis examples/web-cordis/cordis.yml
 *   node scripts/install.mjs --dsh ../deepseek-harness --dry-run
 *
 * 行为：
 *   1. 把 src/ roles/ data/ tests/ scripts/ package.json tsconfig.json README.md cordis.example.yml
 *      拷贝到 <dsh>/kaogong/。
 *   2. 把 cordis.example.yml（存储栈 + kaogong 插件）作为 overlay 写到 <dsh>/kaogong.cordis.yml；
 *      若给了 --cordis，则幂等地把它追加到该文件末尾（已含 "id: kaogong" 则跳过）。
 *   3. 角色层（班主任 agent + persona）涉及改你现有的 agent-spine 条目，不自动合并，
 *      脚本末尾会打印需要手动合并的片段与说明。
 */

import { cp, mkdir, readFile, writeFile, access, readdir, symlink } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const KAOGONG_ROOT = resolve(here, '..')

/** 拷贝白名单（排除 node_modules 等无关内容）。 */
const COPY_ENTRIES = [
  'src', 'roles', 'data', 'tests', 'scripts',
  'package.json', 'tsconfig.json', 'README.md', 'cordis.example.yml',
]

/** 已合并的幂等标记：cordis.example.yml 里 kaogong 条目的 id。 */
export const KAOGONG_MARKER = 'id: kaogong'

export function parseArgs(argv) {
  const args = { dsh: null, cordis: null, dryRun: false, help: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dsh') args.dsh = argv[++i]
    else if (a === '--cordis') args.cordis = argv[++i]
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--help' || a === '-h') args.help = true
    else throw new Error('未知参数：' + a)
  }
  return args
}

export const HELP = [
  '用法：node scripts/install.mjs --dsh <dsh-repo> [--cordis <file>] [--dry-run]',
  '  --dsh      DeepSeek Harness 仓库路径（相对或绝对）',
  '  --cordis   要合并的 cordis.yml 路径；缺省则只写 <dsh>/kaogong.cordis.yml',
  '  --dry-run  只打印，不写任何文件',
].join('\n')

/** 幂等追加：目标已含标记则原样返回 changed=false。 */
export function appendIfMissing(targetContent, overlay) {
  if (targetContent.includes(KAOGONG_MARKER)) return { content: targetContent, changed: false }
  const sep = targetContent.endsWith('\n') ? '' : '\n'
  return { content: targetContent + sep + overlay, changed: true }
}

/** 拷贝插件到 <dsh>/kaogong/。 */
async function copyPlugin(dshRoot, dryRun) {
  const destRoot = join(dshRoot, 'kaogong')
  const plan = []
  for (const entry of COPY_ENTRIES) {
    plan.push({ from: join(KAOGONG_ROOT, entry), to: join(destRoot, entry) })
  }
  if (dryRun) return { destRoot, plan }
  await mkdir(destRoot, { recursive: true })
  for (const { from, to } of plan) {
    await cp(from, to, { recursive: true, force: true })
  }
  return { destRoot, plan }
}

/** 让插件运行期能解析 zod（pnpm 非提升布局下，standalone 目录无 node_modules）。 */
async function linkZod(dshRoot, dryRun) {
  const destDir = join(dshRoot, 'kaogong', 'node_modules')
  const dest = join(destDir, 'zod')
  let exists = true
  try { await access(dest) } catch { exists = false }
  if (exists) { console.log('zod junction 已存在，跳过'); return }

  const pnpmDir = join(dshRoot, 'node_modules', '.pnpm')
  let zodReal
  try {
    const entries = await readdir(pnpmDir)
    const zodPkg = entries.find(entry => entry.startsWith('zod@'))
    if (zodPkg) zodReal = join(pnpmDir, zodPkg, 'node_modules', 'zod')
  } catch { zodReal = undefined }
  if (!zodReal) { console.log('未在 .pnpm 找到 zod，跳过 junction（需另行让 zod 可解析）'); return }
  if (dryRun) { console.log('[dry-run] 将建立 junction ' + dest + ' -> ' + zodReal); return }

  await mkdir(destDir, { recursive: true })
  await symlink(zodReal, dest, 'junction')
  console.log('已建立 zod junction：' + dest)
}

/** 读取 cordis.example.yml 作为 overlay，并加一行来源说明头。 */
async function buildOverlay() {
  const body = await readFile(join(KAOGONG_ROOT, 'cordis.example.yml'), 'utf8')
  return '# 由 kaogong/scripts/install.mjs 生成：存储栈 + kaogong 插件。\n' + body.trimEnd() + '\n'
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || !args.dsh) {
    console.log(HELP)
    process.exit(args.help ? 0 : 1)
  }
  const dshRoot = resolve(args.dsh)

  try {
    await access(join(dshRoot, 'package.json'))
  } catch {
    throw new Error('找不到 DeepSeek Harness 仓库（缺少 package.json）：' + dshRoot)
  }

  const { destRoot, plan } = await copyPlugin(dshRoot, args.dryRun)
  if (args.dryRun) {
    console.log('[dry-run] 将拷贝到 ' + destRoot)
    for (const p of plan) console.log('  ' + p.from + ' -> ' + p.to)
  } else {
    console.log('已拷贝插件到 ' + destRoot)
  }
  await linkZod(dshRoot, args.dryRun)

  const overlay = await buildOverlay()
  if (args.cordis) {
    const target = resolve(args.cordis)
    const current = await readFile(target, 'utf8').catch(() => '')
    const { content: next, changed } = appendIfMissing(current, overlay)
    if (args.dryRun) {
      console.log(changed ? '[dry-run] 将把 overlay 追加到 ' + target : '[dry-run] ' + target + ' 已含 kaogong，跳过')
    } else if (changed) {
      await writeFile(target, next, 'utf8')
      console.log('已把 overlay 追加到 ' + target)
    } else {
      console.log(target + ' 已含 kaogong 条目，跳过合并')
    }
  } else {
    const overlayPath = join(dshRoot, 'kaogong.cordis.yml')
    if (!args.dryRun) await writeFile(overlayPath, overlay, 'utf8')
    console.log((args.dryRun ? '[dry-run] 将写 overlay 到 ' : '已写 overlay 到 ') + overlayPath)
  }

  console.log('\n角色层（班主任 agent）需手动合并进你现有的 agent-spine 条目：')
  console.log('  把 agents 列表加上：')
  console.log('      - id: head')
  console.log('        provider: deepseek-official')
  console.log('        model: deepseek-v4-flash')
  console.log('        cwd: !!js process.cwd()')
  console.log('  并把 persona 设为 ' + join(destRoot, 'roles', 'personas', '班主任.md') + ' 的内容（或直接内联该文件）。')
  console.log('  完整片段见 ' + join(destRoot, 'roles', 'cordis.yml') + '。')
  console.log('\n完成后按 ' + join(destRoot, 'roles', 'README.md') + ' 里的验证清单 boot 检查。')
}

main().catch((error) => {
  console.error('安装失败：' + (error && error.message ? error.message : error))
  process.exit(1)
})
