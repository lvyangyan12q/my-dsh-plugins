/**
 * 每 run 一个 worktree 的行为测试。
 *
 * 接缝一：DispatchService.start() + fake gateway/store/clock + fake git（不跑真 git）。
 * 接缝二：本文件末尾的集成用例跑真 git（临时仓库），覆盖 Windows 路径与参数正确性；
 *         环境里没有 git 时自动跳过。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { DispatchService } from '../lib/dispatch-service.js'
import { createGitAdapter, worktreePathFor } from '../lib/git-worktree.js'
import { createRedactor } from '../lib/redact.js'
import {
  finishImplementation,
  finishPlan,
  driveToReview,
  createFakeClock,
  createFakeGateway,
  createFakeGit,
  createMemoryStore,
  makeDraft,
} from './helpers.mjs'

async function waitForReview(h) {
  for (let i = 0; i < 50; i++) {
    if (h.gateway.calls.create.length >= 2) return
    await new Promise((r) => setTimeout(r, 10))
  }
}

function harness(t) {
  const root = mkdtempSync(join(tmpdir(), 'bs-wt-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const gateway = createFakeGateway()
  const store = createMemoryStore()
  const clock = createFakeClock()
  const redactor = createRedactor()
  const git = createFakeGit()
  const service = new DispatchService({ gateway, store, clock, redactor, git, allowedRoots: [root] })
  const draft = (overrides = {}) => {
    const base = makeDraft()
    return {
      ...base,
      ...overrides,
      bug: { ...base.bug, ...(overrides.bug ?? {}) },
      connection: { ...base.connection, ...(overrides.connection ?? {}) },
      project: { ...base.project, localPath: root, ...(overrides.project ?? {}) },
      specRef: overrides.specRef === undefined ? base.specRef : overrides.specRef,
    }
  }
  return { root, gateway, store, clock, redactor, git, service, draft }
}

test('start 为每条 run 建独立工作区，会话跑在工作区里', async (t) => {
  const h = harness(t)
  const { run } = await h.service.start(h.draft())

  assert.equal(h.git.calls.worktreeAdd.length, 1)
  const call = h.git.calls.worktreeAdd[0]
  assert.equal(call.repoPath, h.root)
  assert.equal(call.worktreePath, worktreePathFor(h.root, run.id))
  assert.equal(call.baseBranch, 'master')
  assert.ok(call.branch.startsWith('bugfix/3083-'), '分支名：' + call.branch)

  // 会话的 cwd 必须是工作区，不是原始仓库
  assert.equal(h.gateway.calls.create[0].cwd, call.worktreePath)
})

test('run 记录同时带 repoPath 与 worktree，localPath 指向工作区', async (t) => {
  const h = harness(t)
  const { run } = await h.service.start(h.draft())
  const stored = await h.store.get(run.id)

  assert.equal(stored.repoPath, h.root)
  assert.equal(stored.worktree.path, worktreePathFor(h.root, run.id))
  assert.equal(stored.worktree.branch, stored.branch)
  assert.equal(stored.worktree.baseBranch, 'master')
  assert.equal(stored.localPath, stored.worktree.path)

  // 公开视图不下发 localPath，但工作区信息是可用的
  assert.equal(run.localPath, undefined)
  assert.equal(run.repoPath, h.root)
  assert.equal(run.worktree.path, stored.worktree.path)
})

test('工作区创建失败 → 422 worktree-create-failed，且不落 run、不建会话', async (t) => {
  const h = harness(t)
  h.git.behavior.worktreeAddThrows = new Error('fatal: invalid reference: master')

  await assert.rejects(h.service.start(h.draft()), (error) => {
    assert.equal(error.code, 'worktree-create-failed')
    assert.equal(error.status, 422)
    assert.equal(error.details.repoPath, h.root)
    assert.match(String(error.details.cause), /invalid reference/)
    return true
  })
  assert.equal(h.gateway.calls.create.length, 0, '不能在失败后建会话')
  assert.equal((await h.store.list()).length, 0, '不能在失败后留下 run')
})

test('同一仓库并发派发：工作区互不相同，且工作区创建被串行化', async (t) => {
  const h = harness(t)
  const drafts = [
    h.draft(),
    h.draft({ bug: { id: 'BUG-2', uid: 2 } }),
    h.draft({ bug: { id: 'BUG-3', uid: 3 } }),
  ]
  const results = await Promise.all(drafts.map((d) => h.service.start(d)))

  const ids = results.map((r) => r.run.id)
  assert.equal(new Set(ids).size, 3, '三条 run 必须是不同的 run')
  const paths = h.git.calls.worktreeAdd.map((c) => c.worktreePath)
  assert.equal(new Set(paths).size, 3, '三条 run 的工作区必须不同，实际 ' + JSON.stringify(paths))
  assert.equal(h.git.calls.worktreeAdd.length, 3)
})

test('同一条 bug 重复派发不会建第二个工作区', async (t) => {
  const h = harness(t)
  const first = await h.service.start(h.draft())
  const second = await h.service.start(h.draft())

  assert.equal(second.idempotent, true)
  assert.equal(second.run.id, first.run.id)
  assert.equal(h.git.calls.worktreeAdd.length, 1, '幂等返回不应再建工作区')
})

test('产物落在原始仓库而不是工作区（删掉工作区不丢产物）', async (t) => {
  const h = harness(t)
  const { run } = await h.service.start(h.draft())
  const stored = await h.store.get(run.id)
  const round = stored.rounds[0]

  // 桥在 plan 阶段会把方案正文写成产物（round-1/plan.md）
  await h.service.onTurnEnd(run.fixSessionId, {
    requestId: round.planRequestId,
    reason: { kind: 'completed' },
    finalText: '# 第 1 轮方案\n诊断：连接池耗尽',
  })

  const inRepo = join(h.root, '.bug-solver', 'runs', run.id)
  const inWorktree = join(stored.worktree.path, '.bug-solver', 'runs', run.id)
  assert.ok(existsSync(inRepo), '产物应写在原始仓库：' + inRepo)
  assert.equal(existsSync(inWorktree), false, '产物不应写进工作区：' + inWorktree)
})

/* ---------------------------------------------------------------- 真 git 集成 */

function gitAvailable() {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test('真 git：worktree add 建出独立分支，参数正确（Windows 路径也过）', { skip: !gitAvailable() && 'git 不可用' }, async (t) => {
  const root = mkdtempSync(join(tmpdir(), 'bs-real-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const repo = join(root, 'repo')
  mkdirSync(repo, { recursive: true })
  const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' }).toString()
  git('init', '-q')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'test')
  git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(repo, 'README.md'), '# demo\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  const base = git('rev-parse', '--abbrev-ref', 'HEAD').trim()

  const adapter = createGitAdapter()
  const runId = '0123456789abcdef'
  const worktreePath = worktreePathFor(repo, runId)
  const branch = 'bugfix/test-' + runId
  const created = await adapter.worktreeAdd({ repoPath: repo, worktreePath, branch, baseBranch: base })

  assert.equal(created.path, worktreePath)
  assert.ok(existsSync(join(worktreePath, 'README.md')), '工作区应有基线检出：' + worktreePath)
  assert.equal(git('-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), branch)

  // `.bug-solver/` 必须被排除，工作区目录不算仓库脏文件
  const exclude = readFileSync(join(repo, '.git', 'info', 'exclude'), 'utf8')
  assert.match(exclude, /\.bug-solver/)
  assert.equal(git('status', '--porcelain').trim(), '', 'worktree 目录不应把仓库弄脏')
})

/* ---------------------------------------------------------------- 删除 run */

test('已结束的 run 可以删除记录；活跃 run 必须先 Stop', async (t) => {
  const h = harness(t)
  const { run } = await h.service.start(h.draft())

  // 活跃状态拒绝删除
  await assert.rejects(h.service.remove(run.id), (error) => {
    assert.equal(error.code, 'run-active')
    assert.equal(error.status, 409)
    return true
  })

  // Stop 之后（stopped 是终态）可以删
  await h.service.stop(run.id)
  const result = await h.service.remove(run.id)
  assert.equal(result.ok, true)
  assert.equal(result.state, 'stopped')
  assert.equal(await h.store.get(run.id), null, '记录应被删除')
  assert.equal((await h.store.list()).length, 0)

  // 再删一次 → 404
  await assert.rejects(h.service.remove(run.id), (error) => {
    assert.equal(error.code, 'run-not-found')
    return true
  })
})

test('删除 run 默认保留工作区；显式 deleteWorktree 才清理', async (t) => {
  const h = harness(t)
  const first = await h.service.start(h.draft())
  await h.service.stop(first.run.id)
  const kept = await h.service.remove(first.run.id)
  assert.equal(kept.worktree.removed, false)
  assert.equal(h.git.calls.worktreeRemove, undefined, '默认不应删工作区')

  const second = await h.service.start(h.draft({ bug: { id: 'BUG-9', uid: 9 } }))
  await h.service.stop(second.run.id)
  const purged = await h.service.remove(second.run.id, { deleteWorktree: true })
  assert.equal(purged.worktree.removed, true)
  assert.equal(h.git.calls.worktreeRemove.length, 1)
  assert.equal(h.git.calls.worktreeRemove[0].worktreePath, second.run.worktree.path)
})

/* ---------------------------------------------------------------- 基线分支可选 */

test('不填基线分支：用仓库当前分支，不是 master', async (t) => {
  const h = harness(t)
  const { run } = await h.service.start(h.draft({ project: { localPath: h.root, baseBranch: '' } }))

  const call = h.git.calls.worktreeAdd[0]
  assert.equal(call.baseBranch, null, '不填时不应给适配器塞 master')
  assert.equal(run.baseBranch, 'current-branch', '应记录实际用到的分支')
  assert.deepEqual(h.store ? [] : [], [])
})

test('填了不存在的基线分支：回退当前分支 + warning，不阻断', async (t) => {
  const h = harness(t)
  h.git.behavior.branchExists = false
  const { run } = await h.service.start(h.draft({ project: { localPath: h.root, baseBranch: 'release/nope' } }))

  assert.equal(run.baseBranch, 'current-branch', '回退到当前分支')
  const stored = await h.store.get(run.id)
  const warn = (stored.warnings || []).find((w) => w.code === 'base-branch-missing')
  assert.ok(warn, '应记录 base-branch-missing，实际 ' + JSON.stringify(stored.warnings))
  assert.match(warn.message, /release\/nope/)
  assert.equal(h.gateway.calls.create.length, 1, '仍然要建会话（不阻断）')
})

test('填了存在的基线分支：就用它', async (t) => {
  const h = harness(t)
  h.git.behavior.branchExists = true
  const { run } = await h.service.start(h.draft({ project: { localPath: h.root, baseBranch: 'develop' } }))
  assert.equal(h.git.calls.worktreeAdd[0].baseBranch, 'develop')
  assert.equal(run.baseBranch, 'develop')
})

/* ---------------------------------------------------------------- 会话目录（bug-solver 工作区） */

function harnessWithSessionCwd(t) {
  const root = mkdtempSync(join(tmpdir(), 'bs-sess-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const sessionCwd = join(root, 'bug-solver')
  mkdirSync(sessionCwd, { recursive: true })
  const repo = join(root, 'repo')
  mkdirSync(repo, { recursive: true })
  const gateway = createFakeGateway()
  const store = createMemoryStore()
  const clock = createFakeClock()
  const redactor = createRedactor()
  const git = createFakeGit()
  const service = new DispatchService({ gateway, store, clock, redactor, git, sessionCwd, allowedRoots: [root] })
  const draft = (overrides = {}) => {
    const base = makeDraft()
    return {
      ...base,
      ...overrides,
      bug: { ...base.bug, ...(overrides.bug ?? {}) },
      connection: { ...base.connection, ...(overrides.connection ?? {}) },
      project: { ...base.project, localPath: repo, ...(overrides.project ?? {}) },
      specRef: overrides.specRef === undefined ? base.specRef : overrides.specRef,
    }
  }
  return { root, repo, sessionCwd, gateway, store, clock, redactor, git, service, draft }
}

test('配了 sessionCwd：会话复用 bug-solver 工作区，派发阶段不建 worktree', async (t) => {
  const h = harnessWithSessionCwd(t)
  const { run } = await h.service.start(h.draft())

  const created = h.gateway.calls.create[0]
  assert.equal(created.cwd, h.sessionCwd, '会话 cwd 应为 bug-solver 工作区')
  const stored = await h.store.get(run.id)
  assert.equal(stored.sessionCwd, h.sessionCwd)
  assert.equal(stored.repoPath, h.repo)
  assert.equal(stored.localPath, h.repo, '分析阶段代码目录就是原始仓库')
  assert.equal(stored.worktree, null, '分析阶段不建工作区')
  assert.equal(h.git.calls.worktreeAdd.length, 0, '派发时不应建 worktree')
  assert.equal(h.gateway.calls.create[0].sandboxMode, 'danger-full-access')
})

test('批准方案时才建 worktree，并把代码目录切过去', async (t) => {
  const h = harnessWithSessionCwd(t)
  const { run } = await h.service.start(h.draft())
  assert.equal(h.git.calls.worktreeAdd.length, 0, '派发阶段不建')

  await finishPlan(h, run)
  const approved = await h.service.approvePlan(run.id)

  assert.equal(h.git.calls.worktreeAdd.length, 1, '批准方案时才建一次')
  const call = h.git.calls.worktreeAdd[0]
  assert.equal(call.repoPath, h.repo)
  const stored = await h.store.get(run.id)
  assert.equal(stored.localPath, call.worktreePath, '实现阶段代码目录 = worktree')
  assert.ok(stored.worktree && stored.worktree.path === call.worktreePath)
  assert.equal(stored.sessionCwd, h.sessionCwd, '会话仍在 bug-solver 工作区')
  assert.equal(approved.run.state, 'fix_implementing')
})

test('建工作区失败：批准方案报 422 并停在待批准', async (t) => {
  const h = harnessWithSessionCwd(t)
  const { run } = await h.service.start(h.draft())
  await finishPlan(h, run)
  h.git.behavior.worktreeAddThrows = new Error('fatal: cannot create worktree')

  await assert.rejects(h.service.approvePlan(run.id), (error) => {
    assert.equal(error.code, 'worktree-create-failed')
    assert.equal(error.status, 422)
    return true
  })
  const after = await h.store.get(run.id)
  assert.equal(after.state, 'awaiting_plan_approval', '失败不应推进状态')
  assert.equal(after.worktree, null)
})

test('会话目录 ≠ 代码目录：修复会话放宽到 danger-full-access，审核仍 read-only', async (t) => {
  const h = harnessWithSessionCwd(t)
  const { run } = await h.service.start(h.draft())

  assert.equal(h.gateway.calls.create[0].sandboxMode, 'danger-full-access', '否则写不了代码目录')

  await driveToReview(h, run, { commit: 'abc1234' })

  const review = h.gateway.calls.create[1]
  assert.ok(review, '应创建审核会话')
  assert.equal(review.cwd, h.sessionCwd, '审核会话也用 bug-solver 工作区')
  assert.equal(review.sandboxMode, 'read-only')
})

test('没配 sessionCwd（旧行为）：会话就在代码工作区里，sandbox 保持 workspace-write', async (t) => {
  const h = harness(t)
  const { run } = await h.service.start(h.draft())
  const created = h.gateway.calls.create[0]
  assert.equal(created.cwd, run.worktree.path)
  assert.equal(created.sandboxMode, 'workspace-write')
})

test('sessionCwd 指向不存在的目录：回退到代码工作区，不报错', async (t) => {
  const h = harnessWithSessionCwd(t)
  const missing = join(h.root, 'not-there')
  h.service.sessionCwd = missing
  const { run } = await h.service.start(h.draft())
  assert.equal(h.gateway.calls.create[0].cwd, run.worktree.path)
})

test('分析阶段 prompt 说明「只读、批准后才建工作区」；实现阶段指向 worktree', async (t) => {
  const h = harnessWithSessionCwd(t)
  const { run } = await h.service.start(h.draft())

  const planText = h.gateway.calls.prompt[0].content.map((b) => b.text).join('\n')
  assert.match(planText, /代码仓库（只读/, '分析阶段应说明仓库是只读的')
  assert.match(planText, /批准方案后创建/, '应说明批准后才建工作区')
  assert.doesNotMatch(planText, /代码工作区（就在这里改/, '分析阶段不该说有工作区')

  await finishPlan(h, run)
  await h.service.approvePlan(run.id)
  const fixPrompt = h.gateway.calls.prompt.at(-1).content.map((b) => b.text).join('\n')
  const stored = await h.store.get(run.id)
  assert.match(fixPrompt, /代码工作区（就在这里改/, '实现阶段应给出工作区')
  assert.ok(fixPrompt.includes(stored.worktree.path), '实现 prompt 应包含 worktree 绝对路径')
})

test('prompt 里给出可直接照抄的 ssh 命令形态，并要求先加载 ssh-connect', async (t) => {
  const h = harnessWithSessionCwd(t)
  const { run } = await h.service.start(h.draft())

  const text = h.gateway.calls.prompt[0].content.map((b) => b.text).join('\n')
  assert.match(text, /先调用 skill 工具加载 `ssh-connect`/, '应要求先加载技能')
  const cmd = text.split('\n').find((line) => line.includes('ssh -o BatchMode=yes'))
  assert.ok(cmd, '应给出固定命令形态，实际 prompt 无 ssh 命令行')
  assert.match(cmd, /-p \d+/, '应带端口')
  assert.match(cmd, /-i "[^"]+id_(rsa|ed25519|ecdsa)"/, '应带私钥路径')
  assert.match(cmd, /root@10\.12\.139\.111/, '应带 user@host')
  assert.match(text, /私钥只用于认证，不要读取、打印或复制/, '应说明私钥使用边界')
  assert.match(text, /禁止：restart\/stop\/kill/, '应列出禁止的写操作')

  // 实现阶段同样带这条命令
  await finishPlan(h, run)
  await h.service.approvePlan(run.id)
  const fix = h.gateway.calls.prompt.at(-1).content.map((b) => b.text).join('\n')
  assert.ok(fix.split('\n').some((l) => l.includes('ssh -o BatchMode=yes')), '实现阶段也要给命令形态')
})
