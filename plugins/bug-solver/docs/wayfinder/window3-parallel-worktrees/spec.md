---
id: window3-parallel-worktrees-spec
title: 同一仓库的并行 run —— 每条 run 一个独立 git worktree
labels: [ready-for-agent]
status: implemented
kind: implementation-spec
decision_map: window3-dispatch
created: 2026-11-10
testing_seams_confirmation: confirmed
testing_seams_confirmed_at: 2026-11-10
---

# 同一仓库的并行 run —— 每条 run 一个独立 git worktree

## Problem Statement

窗口3 支持「缺陷派发」和「自由输入问题」两种入口，用户想同时推进多个问题。但桥在
`start()` 里按本地仓库路径做了独占：同一 `localPath` 已有非终态 run 时直接抛
`409 repo-busy`（`ConflictError`；`TERMINAL_STATES` = approved / stopped / unknown /
fix_failed / review_failed）。

结果是：**只要几条问题落在同一个代码仓库，第二条就必然被拒**，无论它是缺陷派发还是自由输入。
而现实里一个项目的工作几乎都在同一个仓库里，用户看到的就是「只能跑一个」。页面只能提前弹
「这个仓库已有活跃 run」的警告，治标不治本。

桥内部其实已经有 worktree 的概念，但它依赖**会话里的 agent 自己执行**
`git worktree add .bug-solver/worktrees/<runId> -b <branch> <base>`（实现阶段提示词）。
也就是说：并行安全是「提示词约定」，不是系统保证；一旦 agent 不照做，两条 run 就会在同一个
工作区里同时改代码。同时窗口3 也没有任何地方展示 run 用的是哪个工作区，用户无法判断某条 run
到底改在哪里。

## Solution

把「每 run 一个 worktree」从提示词约定变成**桥的确定性行为**：

- `start()` 在创建会话之前，为这条 run 在原始仓库下建出独立工作区
  `<repo>/.bug-solver/worktrees/<runId 前 8 位>` 与独占分支（沿用 `bugfix/<uid|bugId>-<runId>`），
  并把该工作区作为 run 的工作目录（会话 cwd）。
- 删除 `repo-busy` 拒绝逻辑。同一仓库的多条 run 各自在自己的工作区里跑，互不干扰；跨仓库并行照旧。
- run 记录里同时保留「原始仓库」与「工作区」两个路径，产物仍落在原始仓库
  `<repo>/.bug-solver/runs/<runId>/`，删掉工作区不会丢产物。
- 窗口3 去掉「同仓库只能一条」的阻断警告，改为「会另开工作区」的说明，并在会话卡片与 run 摘要里
  显示工作区路径与分支。

对用户的效果：同一仓库的多个问题可以真的同时跑；每条问题都能看到自己改在哪个工作区、哪个分支。

**取舍（必须说清）**：会话 cwd 变成工作区后，分析阶段看到的是基线分支的干净检出，而不是用户当前
工作区里未提交的改动。为补偿，桥把原始仓库路径一并写进分析上下文，允许会话只读地
`git -C <repo> diff` 查看本地改动。当前部署 `dirtyCheck:false`（允许脏仓库派发），这一条要写进文档
避免以后被当成 bug。

## User Stories

1. 作为缺陷处理人，我希望同一仓库的多个 bug 能同时派发并各自推进，这样我不用排队等前一条结束。
2. 作为缺陷处理人，我希望自由输入的问题和缺陷派发享受同样的并行能力，这样临时发现的问题能立刻插队分析。
3. 作为缺陷处理人，我希望每条 run 有自己独立的工作区和分支，这样两条 run 不会互相覆盖代码。
4. 作为缺陷处理人，我希望在窗口3 看到每条 run 用的是哪个工作区、哪个分支，这样我知道代码实际改在哪。
5. 作为缺陷处理人，我希望删掉或清理某个工作区后，该 run 的方案、审核结论、产物仍然在，这样历史可追溯。
6. 作为缺陷处理人，我希望同一缺陷重复派发只得到原来那条 run，不会多建一个工作区，这样重复点击不会污染仓库。
7. 作为缺陷处理人，我希望基线分支不存在、仓库不是 git 仓库这类问题在派发时明确报错且不建会话，这样我不会以为已经跑起来了。
8. 作为缺陷处理人，我希望工作区创建失败时错误信息能定位到原因（分支不存在 / 路径被占用 / 权限），这样我能自己修。
9. 作为缺陷处理人，我希望两条 run 在同一仓库几乎同时派发时不会因为 git 索引锁互相失败，这样并发点击也稳。
10. 作为缺陷处理人，我希望「并行会话」看板里同仓库的多条 run 都能显示为进行中，这样我一眼看到并行度。
11. 作为缺陷处理人，我希望不再看到阻断式的「这个仓库已有活跃 run」，这样确认页不会误导我以为不能派发。
12. 作为缺陷处理人，我希望确认页对同一仓库给出的是「会另开工作区」的说明而不是警告，这样我知道预期行为。
13. 作为缺陷处理人，我希望审核会话审的是本次 run 的工作区内容，这样审核结论对应真实改动。
14. 作为维护者，我希望工作区创建逻辑集中在一处并可通过适配器替身测试，这样不必在测试里跑真 git。
15. 作为维护者，我希望有一条真 git 的集成测试证明 worktree 参数正确，这样 Windows 路径这类问题能被发现。
16. 作为维护者，我希望旧 run 记录（没有工作区字段）仍能读产物、看摘要，这样升级不破坏历史数据。
17. 作为维护者，我希望并发派发的仓库级临界区在本进程内串行化，这样避开「索引锁」这类偶发失败。
18. 作为维护者，我希望明确「工作区不会自动清理」，这样不会有人误以为有 GC。

## Implementation Decisions

**桥：DispatchService.start()**

- 删除同仓库独占判断（`repo-busy` 的 `ConflictError`）；`sameBug` 幂等分支保持不变
  （同一 `bugId` 非终态 → 直接返回原 run，不建第二个工作区）。
- 新增工作区创建步骤，顺序固定为：校验 draft → 幂等检查 → **创建 worktree** → 落库 run →
  创建修复会话 → 改名 → 发第 1 轮方案 prompt。任一步失败都不得留下「以为是跑起来了」的假成功。
- run 记录新增 `repoPath`（原始仓库 realpath）与 `worktree`（`{ path, branch, baseBranch, createdAt }`）；
  `localPath` 语义改为「本 run 的工作目录」，即工作区路径。旧记录缺这两个字段时，读取侧一律回退
  `repoPath ?? localPath`。
- 工作区路径 `<repo>/.bug-solver/worktrees/<runId 前 8 位>`；分支沿用 `bugfix/<uid|bugId>-<runId>`。
- 创建前确保 `.bug-solver/` 已在 `.git/info/exclude` 中（读-判-追加，幂等），避免工作区目录把仓库弄脏。
- 分支已存在（崩溃后重试）时改用 `git worktree add <path> <branch>`；路径已被登记为陈旧工作区时
  先 `git worktree prune` 再重试一次；仍失败则回 `422 worktree-create-failed`，细节为脱敏后的 stderr。
- 同一原始仓库的创建过程在本进程内 per-repo 串行化（`Map<repoPath, Promise>` 链）；
  明确不承诺跨进程互斥。
- 会话 cwd：修复会话与审核会话都用 `run.localPath`（工作区）。Host adapter 的 allowedRoots 校验天然通过
  （工作区在仓库根之内）。
- 产物路径一律改用「原始仓库」：新增内部 `#repoRoot(run) = run.repoPath ?? run.localPath`，
  读/写/列举/校验产物与 result.json manifest 的调用点统一改用它。

**桥：git 适配器（新模块）**

- 新增只做 git 操作的适配器，接口：`exec`、`branchExists`、`exclude`、`prune`、`listWorktrees`、
  `worktreeAdd`（组合：排除项 → 必要时 prune → `worktree add`）。
- 真实实现用 `node:child_process`（桥不 import DSH 的约束保持不变）；适配器作为 `DispatchService`
  的新注入依赖，缺省使用真实实现，测试注入替身。

**桥：提示词**

- 分析上下文区分「原始仓库」（只读参考、可能有未提交改动）与「本次 run 工作区」。
- 实现阶段提示词从「先基于基线建 worktree」改为「你已在工作区 X、分支 Y，直接在里面改」，
  保留「不合入、不推送、不碰受保护分支」。
- 审核提示词直接在工作区上做只读 `git diff`。
- 产物目录说明保持不变（仍在原始仓库下）。

**窗口3 页面**

- 删除确认页的阻断式预警，改为同仓库「会另开独立工作区与分支」的说明（带「先看那条」跳转，不禁用派发）。
- 会话卡片与 run 摘要展示工作区路径与分支。
- 「并行会话」说明文案改为「同一仓库也能并行」。

**公开契约**

- HTTP 路由不变；`GET /runs`、`GET /run` 返回的 run 里出现 `repoPath`、`worktree`
  （`localPath` 仍按现约定不下发）。
- `POST /start` 不再返回 `409 repo-busy`；新增可能错误码 `worktree-create-failed`（422）。
- 其余状态机、幂等 requestId、needs_attention、产物接口均不变。

## Testing Decisions

好的测试只断言**外部可观察行为**：`DispatchService` 的公开方法、run 记录内容、gateway 调用参数、
页面 DOM。不断言私有函数，也不断言 git 命令字符串的拼接顺序（只断言关键参数被传入）。

- **接缝一（主）**：`DispatchService.start()` + 注入的 fake gateway / store / clock / redactor /
  **fake git**。复用 `bridge/test/helpers.mjs` 的既有约定（fake 记录 calls 供断言）。
- **接缝二（真 git 集成）**：临时目录 `git init` + 一次提交，用真实适配器跑一次 `worktreeAdd`，
  断言工作区存在、`git -C <wt> rev-parse --abbrev-ref HEAD` 等于该 run 的分支、`.bug-solver/` 已排除且
  仓库不被弄脏；git 不可用时跳过。覆盖只有真 git 才暴露的路径问题。
- **接缝三**：窗口3 页面 jsdom 冒烟（沿用 `scripts/window3-parallel.test.mjs`），断言不再出现阻断预警、
  出现「另开独立工作区」说明、卡片能看到工作区。
- 既有测试更新：`dispatch-start.test.mjs` 的「同一仓库第二条被拒（repo-busy）」改为
  「同一仓库第二条成功且工作区/分支不同」；`cwd` 断言改为断言工作区而非原始仓库。
- 新增 `bridge/test/dispatch-worktree.test.mjs`：独立工作区、记录字段、创建失败不落 run、
  并发三条不同工作区、同 bug 幂等、产物落原始仓库、真 git 集成。
- 回归基线：`cd bridge && npm test` 由 147 → **154 全绿**；
  `scripts/smoke-window3-page.cjs` 39/39 与三个窗口3 冒烟全绿。
  （注意：`node --test bridge/test/` 收集不到用例，必须用 `npm test`。）

## Out of Scope

- 工作区的自动回收/GC、过期清理策略，以及 run 的删除 API（桥本来就没有删除接口）。
- 自动开 PR、合并、推送到远端分支。
- 跨进程/多实例互斥（只做进程内 per-repo 串行化）。
- 用 worktree 之外的隔离方案（容器、独立 clone）。
- 窗口1、窗口2 的任何改动；窗口4 复盘。
- 分析阶段默认读取用户未提交改动（只在上下文里给出原始仓库路径供只读查看）。
- 并发度上限、排队策略、优先级。

## Further Notes

- **语义变化**：分析会话现在跑在工作区（基线分支的干净检出），而不是用户当前工作区。
- **失败场景的清理**：worktree 已建但会话创建失败时，run 进入 `unknown`，工作区保留（不自动删），
  避免误删用户可能已经在里面做的工作；手工清理用 `git worktree list` / `git worktree remove`。
- **部署成本**：桥侧改动需重新部署到 `~/.dsh/profiles/web/node_modules/bug-solver-dispatch`
  并重启 `dsh web`；窗口3 页面改动只需刷新页签。
- **已知文案残留**：手动 run 的会话标题仍是 `BUG-manual-…`（桥内硬编码前缀），本次不处理。
