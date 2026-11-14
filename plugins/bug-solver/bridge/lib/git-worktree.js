/**
 * 每 run 一个 git worktree：把「并行安全」从提示词约定变成桥的确定性行为。
 *
 * 同一仓库可以同时跑多条 run —— 每条 run 在自己的工作区
 * `<repo>/.bug-solver/worktrees/<runId 前 8 位>` + 独占分支里改代码，
 * 因此不再需要「同一仓库只允许一条活跃 run」的独占检查。
 *
 * 设计约束：
 * - 本模块不 import DSH（与 dispatch-service 一致），只用 Node 内置能力。
 * - 对外是一个**可注入的适配器**：单测注入替身，集成测试用真实实现跑真 git。
 * - 只做创建/查询，不做删除：桥本来就没有删除接口，工作区清理交给用户手工命令。
 */
import { execFile } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/** 工作区固定放在仓库内的这个目录下（`.bug-solver/` 会写进 .git/info/exclude）。 */
export const WORKTREE_DIR = join('.bug-solver', 'worktrees')
export const EXCLUDE_ENTRY = '.bug-solver/'

/** `<repo>/.bug-solver/worktrees/<runId 前 8 位>` */
export function worktreePathFor(repoPath, runId) {
  if (typeof repoPath !== 'string' || repoPath.trim() === '') {
    throw new Error('worktreePathFor 需要仓库绝对路径')
  }
  if (typeof runId !== 'string' || runId.trim() === '') throw new Error('worktreePathFor 需要 runId')
  return join(repoPath, WORKTREE_DIR, runId.trim().slice(0, 8))
}

/**
 * 真实适配器。
 * @param {{ timeoutMs?: number, gitBin?: string }} [options]
 */
export function createGitAdapter({ timeoutMs = 60_000, gitBin = 'git' } = {}) {
  /** 执行 git；非零退出抛错（带 stderr，便于上层脱敏后回给用户）。 */
  async function exec(args, { cwd }) {
    try {
      const { stdout, stderr } = await execFileAsync(gitBin, args, {
        cwd,
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      })
      return { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }
    } catch (cause) {
      const stderr = String(cause?.stderr ?? '').trim()
      const error = new Error(stderr || String(cause?.message ?? cause))
      error.code = 'git-failed'
      error.command = [gitBin, ...args].join(' ')
      error.stderr = stderr
      throw error
    }
  }

  /** 当前分支（detached 时返回 null）。 */
  async function currentBranch({ repoPath }) {
    try {
      const { stdout } = await exec(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoPath })
      const name = String(stdout).trim()
      return name && name !== 'HEAD' ? name : null
    } catch {
      return null
    }
  }

  async function branchExists({ repoPath, branch }) {
    try {
      await exec(['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: repoPath })
      return true
    } catch {
      return false
    }
  }

  /** `.git/info/exclude` 里补一条（幂等；worktree 的 exclude 也覆盖，取 commondir）。 */
  async function exclude({ repoPath, entry = EXCLUDE_ENTRY }) {
    let gitDir = ''
    try {
      const { stdout } = await exec(['rev-parse', '--git-common-dir'], { cwd: repoPath })
      gitDir = String(stdout).trim()
    } catch {
      gitDir = ''
    }
    if (!gitDir) return { updated: false, path: null }
    const excludePath = join(repoPath, gitDir, 'info', 'exclude')
    mkdirSync(dirname(excludePath), { recursive: true })
    let current = ''
    try {
      current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : ''
    } catch {
      current = ''
    }
    const lines = current.split(/\r?\n/).map((line) => line.trim())
    if (lines.includes(entry) || lines.includes(entry.replace(/\/$/, ''))) return { updated: false, path: excludePath }
    const prefix = current && !current.endsWith('\n') ? '\n' : ''
    appendFileSync(excludePath, `${prefix}${entry}\n`, 'utf8')
    return { updated: true, path: excludePath }
  }

  async function prune({ repoPath }) {
    try {
      await exec(['worktree', 'prune'], { cwd: repoPath })
      return true
    } catch {
      return false
    }
  }

  async function listWorktrees({ repoPath }) {
    try {
      const { stdout } = await exec(['worktree', 'list', '--porcelain'], { cwd: repoPath })
      return String(stdout)
        .split(/\r?\n/)
        .filter((line) => line.startsWith('worktree '))
        .map((line) => line.slice('worktree '.length).trim())
    } catch {
      return []
    }
  }

  /**
   * 建工作区：排除项 → 必要时 prune 陈旧登记 → `worktree add`。
   * 分支已存在（崩溃后重试）时复用该分支，不再 `-b`。
   */
  async function worktreeAdd({ repoPath, worktreePath, branch, baseBranch }) {
    if (!repoPath || !worktreePath || !branch) throw new Error('worktreeAdd 缺少 repoPath/worktreePath/branch')
    await exclude({ repoPath })
    // 没指定基线分支就用仓库当前分支（HEAD），不再默认 master。
    const base = (baseBranch && String(baseBranch).trim()) || (await currentBranch({ repoPath })) || 'HEAD'
    const exists = await branchExists({ repoPath, branch })
    const add = () => (exists
      ? exec(['worktree', 'add', worktreePath, branch], { cwd: repoPath })
      : exec(['worktree', 'add', '-b', branch, worktreePath, base], { cwd: repoPath }))
    try {
      await add()
    } catch (cause) {
      const stale = /already exists|is a missing but already registered|is already registered/i.test(
        String(cause?.message ?? '')
      )
      if (!stale) throw cause
      await prune({ repoPath })
      await add()
    }
    return { path: worktreePath, branch, baseBranch: base, reusedBranch: exists }
  }

  /** 删除工作区（只给「删除 run 时一并清理」用；失败不抛，返回结果）。 */
  async function worktreeRemove({ repoPath, worktreePath }) {
    if (!repoPath || !worktreePath) return { removed: false, reason: 'missing-path' }
    try {
      await exec(['worktree', 'remove', '--force', worktreePath], { cwd: repoPath })
      return { removed: true }
    } catch (cause) {
      await prune({ repoPath })
      return { removed: false, reason: String(cause?.message ?? cause) }
    }
  }

  return { exec, currentBranch, branchExists, exclude, prune, listWorktrees, worktreeAdd, worktreeRemove }
}
