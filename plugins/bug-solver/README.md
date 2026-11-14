# bug-solver · TB 缺陷雷达 + 窗口3 调度台

## DSH 宿主版本

调度桥保留原 `0.2.1-rc.3`、`0.2.2-alpha.2`、`0.2.2-rc.1` 声明，并增加 `0.2.2-rc.2`，不自动放行未知版本。rc.2 准入与 Host 构建入口检查见仓库根目录 `scripts/dsh-rc2-compat.test.mjs`；`bridge` 的回归使用测试服务，不代表真实模型会话调度验收。本次适配不迁移数据、不授予版本豁免、不修改或重启正式 profile。

本轮后续开发入口：[可靠性修复、同步优化与窗口4收集复盘规格](docs/specs/bug-solver-next/spec.md)（本地任务 `bug-solver-next-spec`，`ready-for-agent`）。规格内含任务顺序、依赖、测试边界与已完成/待实施/待决策状态；窗口4本期只收集、复盘和知识沉淀，不做评分或流程比较。

三个窗口（`grid` 布局：顶行 2 窗 + 主行 1 窗，对话在右）：

| 窗口 | 内容 |
|---|---|
| 窗口1 | 缺陷列表（占满窗口）：编号 / 标题 / 状态 / 优先级 / 更新时间 / 派发 — `tb-bugs.html` |
| 窗口2 | SSH 连接管理（项目配置已移除）— `ssh-config.html` |
| 窗口3 | **调度台**：确认页 + run 看板 + 轮次时间线 + 只读对话 + 产物 — `window3-dispatch.html`（数据来自 `bridge/` Host 插件）；**支持缺陷派发与自由输入问题两种入口** |

窗口1 行为：**列表占满窗口**；点某条打开**整页详情浮层**（可返回、可关闭、Esc 关闭）；**「派发」把缺陷送到窗口3**（写本机草稿 + 广播 + 队列文件，见下节），点缺陷标题仍打开原详情；详情里保留「派发到窗口3」和「处理信息」复制面板。

窗口3 不再是内置终端。它启动两个 DSH 原生会话（分析修复 + 只读审核），按确定性状态机推进；输入、审批、提问、Stop 都在 DSH 原生会话里完成，窗口3 只做控制面 + 只读镜像。历史 herdr 终端路径仍保留在 `scripts/herdr-run.ps1` / `scripts/tb-diagnose.ps1`，但不是窗口3 的主路径。

## 窗口1 → 窗口3 派发（v1 契约）

点行内「派发」或详情里的「派发到窗口3」时：

1. **本机草稿（真相）**：写 `localStorage['bug-solver.dispatch.draft.v1']`，结构
   `{ version: 1, updatedAt, drafts: { <bugId>: DispatchDraft } }`（按 bugId 幂等；未确认草稿才可被窗口3 接手）。
   同时写旧版兼容单草稿 `bugSolver.dispatchDraft` / `bugSolver.window3Draft`（最近一条 DispatchDraft）。
   **窗口3 读取顺序**：v1 map（按 `updatedAt` 取最新未确认草稿）→ 兼容单键；派发成功/放弃时只删除该 `bugId`
   的 map 条目并清空兼容键，不误删其它缺陷的草稿。窗口3 的「保存草稿」会同时更新 v1 map 与兼容键。
2. **通知**：向 `BroadcastChannel('bug-solver.dispatch.v1')` 发
   `{ version: 1, type: 'dispatch.draft.created' | 'dispatch.draft.updated', at, draft }`；
   并向窗口3 页面的 `BroadcastChannel('bug-solver-dispatch')` 发 `{ type: 'dispatch', at, draft }`（窗口3 开着就即时接手）。
3. **队列文件**：尽力 `POST /api/worktable/write` 写 `data/dispatch/queue.json`
   （`{ version: 1, updatedAt, items: [DispatchDraft...] }`），窗口3 没开时也留一份可追溯记录。
4. **带出 SSH 连接**：读 `data/ssh-config.json`，只把连接候选写进草稿的 `connections` / `connection`；
   **不再带代码项目**（窗口2 项目配置已移除）。代码仓库路径、基线分支、目标 spec 在窗口3 确认页直接填。

- **幂等**：按 `bug.id` 复用未确认草稿——重复点只更新内容与 `updatedAt`，`runId` 不变；已有活跃 run
  时提示「进行中」并跳过派发（先查本机 `bug-solver.runs.v1`，再问 `/api/bug-solver/runs`，桥不可用就当作没有）。
- **反馈**：队列写成功 →「已发送（等待确认）」；写失败 →「已发送（本机草稿）…队列文件未写入」，
  **不会假装成功**；本机存储不可用 →「派发失败」。
- `DispatchDraft` 字段见 [窗口3 规格](docs/wayfinder/window3-dispatch/spec.md)（bug / connection / project / specRef / container / timeWindow / notes / source）。

## 窗口3：调度台（Host 桥插件）

### 两条入口：缺陷派发 / 自由输入

1. **缺陷派发**（原路径）：窗口1 点「派发到窗口3」→ 草稿 → 确认页 → 派发。
2. **自由输入分析**（新增）：窗口3 顶栏「分析问题」或空态「分析一个问题」→ 直接填*问题标题 / 问题描述*
   （现象、影响范围、报错原文、可疑服务）→ 确认并派发。不需要缺陷单。

实现上没有扩展桥契约：自由输入会合成一条 `DispatchDraft`，其中

```
bug = { id: 'manual-<YYYYMMDD-HHMMSS>', uid: null, source: 'manual',
        title: <用户填的标题，留空则取描述首行>, description: <用户填的描述>,
        status: '自由输入', services: [], hosts: [], hints: [], repos: [] }
```

桥侧只校验 `bug.id` 非空，`bug.title` / `bug.description` 会经 `prompts.js` 的 `contextBlock`
进入分析会话，因此「方案 → 批准 → 实现 → 审核」整条状态机与缺陷派发完全一致（`bugUid` 为 `null`，
分支名为 `bugfix/manual-<时间>-<runId>`，会话标题显示 `BUG-manual-…`，属已知显示瑕疵）。

配套细节：

- 连接与仓库候选取自窗口2 的 `data/ssh-config.json`（`key → keyPath`）；仓库路径、基线分支、spec
  仍在确认页填写，受桥的 `allowedRoots` + 干净 git 仓库校验约束。
- 自由输入草稿**边打字边自动落盘**（600 ms 节流，写入 `bug-solver.dispatch.draft.v1` 的按 id 幂等 map），
  刷新或关窗后原样恢复；「放弃草稿」只删自己那条。
- 校验放宽：自由输入只要求问题描述 ≥ 10 字，标题可留空。
- 页面回归：`scripts/window3-manual.test.mjs`（表单 + 派发载荷）与
  `scripts/window3-manual-persist.test.mjs`（自动落盘 + 刷新恢复）。
- 生成式补丁（幂等，可重复执行）：`scripts/add-manual-analysis.cjs`、`scripts/add-manual-autosave.cjs`；
  改动前备份为 `window3-dispatch.html.bak-manual` / `.bak-autosave`。

### 派发是慢操作（十几秒正常）

`POST /start` 会**建 DSH 会话**（工作区已改为按需创建，见上一节），大仓库仍可能要几秒到十几秒。页面为此做了三件事：

- `/start` 单独用 180s 超时（其它请求仍 15s），不会像以前那样 15s 就报「请求超时」；
- 派发期间顶栏显示 `处理中… 已等待 12s`，按钮置灰，重复点会被忽略；
- 若请求超时/断连但服务端其实已建出 run，页面会**自动刷新并接管那条 run**；没建出来就保留草稿并提示稍后刷新，不会重复派发。

回归：`scripts/window3-dispatch-feedback.test.mjs`。

### 并行会话管理

多条问题可以同时跑，每条 run 自带「修复 + 审核」两个原生会话，互不干扰。窗口3 提供：

- **「并行会话」页签**：带「待你处理」数量角标；会话板按 `待你处理 / 进行中 / 已结束` 分组，
  每条 run 一张卡（状态、仓库名、轮次、多久前更新），卡上可直接打开该 run 的修复/审核会话，不必先切过去。
- **右栏运行队列**：排序改为「待处理 → 进行中 → 其余」，并显示仓库名与待处理标记。
- **确认页同仓库说明**：所选仓库已有活跃 run 时提示「这条会另开独立工作区与分支，两条并行互不影响」，
  并给「先看那条」跳转（不阻断派发）。同一缺陷重复派发仍是幂等返回。
- **连续确认**：一次派发成功后，若窗口1 还有未确认草稿，顶部提示「确认下一条」，可直接接手。
- **删除已结束的 run**：终态（approved / stopped / unknown / fix_failed / review_failed）的卡片上有「删除」，
  点一次变「确认删除 / 取消」，再点才真的删记录（`POST /api/bug-solver/remove`）。
  活跃 run 不能删，先 Stop。删除只删记录，**git 工作区默认保留**并在通知里给出路径；
  手工清理用 `git worktree remove <path>`。
- **轮询**：看板视图下只要任意 run 在跑就 1.5s 刷新；停在 `needs_attention` 的 run 上取 10s 空闲间隔。
- 回归：`scripts/window3-parallel.test.mjs`（4 条 run：分组、卡片、切换、排序、同仓库说明、工作区）。
- 生成式补丁：`scripts/add-parallel-sessions.cjs`、`scripts/patch-window3-worktree.cjs`（均幂等）；
  备份 `window3-dispatch.html.bak-parallel` / `.bak-worktree`。

### 连服务器：走 ssh-connect 技能（prompt 硬性约束）

桥**自己不发 ssh**；连服务器的是窗口3 起的原生会话。为避免会话自由发挥，prompt 现在写死：

1. **先调用 skill 工具加载 `ssh-connect`**，再执行命令；不许凭记忆拼参数、不许走别的通道；
2. 固定命令形态（参数直接从确认页带出，可照抄）：
   `ssh -o BatchMode=yes -o ConnectTimeout=10 -p <port> -i "<私钥>" <user>@<host> "<只读命令>"`；
3. **只读白名单**：`docker ps / docker logs --since … --tail N / docker inspect / docker stats --no-stream /
   systemctl status / cat / tail / head / grep / ls / df / free / uptime / ps`；
4. **禁止**：restart/stop/kill/rm/rmi/prune/exec 等写操作、docker cp、改配置/权限、安装卸载、清空日志；
   需要变更服务器时只写进 plan.md 的「建议」，交给用户执行；
5. 私钥只用于认证，**不读取、不打印、不复制**其内容。

> 这是**约定式**约束（prompt + ssh-connect 技能自身规则），桥不做命令级拦截。要硬保证需要桥侧加只读包装（未实现）。

### 工作区按需创建（分析阶段不建）

- **派发只做分析**：不建 worktree，只读分析原始仓库（prompt 明确「只读、不要提交」）；
- **批准方案后**才建该 run 的 git worktree，并把 `localPath` 切到工作区，实现/审核都在里面；
- 建工作区失败 → `422 worktree-create-failed`，**状态仍停在「待确认方案」**，不会推进、不发实现 prompt；
- 因此派发快很多（省掉整树检出）；代价是「批准方案」这一步会多花几秒。

### 同一仓库并行：每条 run 一个 worktree

桥在 `start()` 里为每条 run 建出独立工作区，不再按仓库独占：

- 工作区：`<repo>/.bug-solver/worktrees/<runId 前 8 位>`，分支 `bugfix/<uid|bugId>-<runId>`；
- **会话 cwd = bug-solver 工作区**（插件配置的 `projectDir`），复用已有 DSH workspace，不再为每条 run 新建 workspace；
- 代码仍在本 run 的 worktree 里：prompt 给出绝对路径，会话显式 `cd` 过去改代码；
- 因为会话目录 ≠ 代码目录，修复会话的 sandbox 会放宽到 `danger-full-access`（可用插件配置 `fixSandboxMode` 收紧）；审核会话仍是 `read-only`；
- 审核会话在同一会话目录里只读 `git diff`（代码路径由 prompt 指定）。
- 产物仍在**原始仓库** `<repo>/.bug-solver/runs/<runId>/`，删掉工作区不丢产物；
- `.bug-solver/` 会自动写进 `.git/info/exclude`，工作区不会把仓库弄脏；
- 同一仓库的**工作区创建**在进程内串行，避开 git 索引锁；工作区**不会自动清理**，
  手工清用 `git worktree list` / `git worktree remove <path>`；
- 失败语义：建工作区失败 → `422 worktree-create-failed`，不落 run、不建会话；
  建了工作区但会话创建失败 → run 记 `unknown`，工作区保留。

**语义变化**：分析阶段看到的是工作区（基线分支的干净检出），不是当前工作区里未提交的改动；
分析上下文里会给出原始仓库路径供只读 `git diff` 参考。当前部署 `dirtyCheck:false`（允许脏仓库派发）。

> 一次性改造脚本（已执行完，勿重复跑）归档在 ；可重复执行的补丁留在 。

规格：[docs/wayfinder/window3-parallel-worktrees/spec.md](docs/wayfinder/window3-parallel-worktrees/spec.md)；
回归：`cd bridge && npm test`（154 例，含真 git 集成用例）。

窗口3 是单文件 HTML（`window3-dispatch.html`），数据来自本地 Host 插件 `bridge/`（ESM、无构建）。
它不直接驱动 LLM：桥的状态机预生成 sessionId，用 Host `sessionController/workspaceRegistry/sessionPersistence`
创建两个原生会话，订阅 `session/event`，先校验 `user/message.source.rpcId === requestId`，再等同一 turn 的 `turn/end`。

路由注册：`ctx.webServer.register` 的 exact 路由 + `connection.admit(req)`（Node req/res 适配）。
**不要用 `ctx.connection.fetch`**：普通 iframe fetch 没有客户端 RPC Peer，会得到 400（已实测）。

### 组件

```
bridge/                           Host 桥插件（可安装，独立于 worktable）
  lib/index.js                    apply()：挂 /api/bug-solver/*；缺 Host 服务时 503 并带真实原因
  lib/dispatch-service.js         确定性状态机（start/approve-plan/plan-feedback/request-changes/
                                  stop/approve/resume/messages/artifact）
  lib/host.js                     真实 DSH Host 适配（create/rename/prompt/cancel/setSandboxMode/observe）
  lib/session-log.js              会话日志 → 只读消息；requestId 拼/解析（单一 helper）
  lib/artifacts.js                产物读写、大小上限、路径逃逸校验、result.json manifest 校验
  lib/ssh-config.js               历史 ssh-config 读取（legacy；窗口3 的仓库/分支不再依赖它）
  lib/paths.js                    allowedRoots realpath 前缀校验（win32 大小写不敏感；唯一实现）
  lib/prompts.js                  方案/实现/审核 prompt 契约
  lib/run-store.js                版本化 run 表（原子写、串行化）
  lib/redact.js                   统一脱敏（密码/令牌/Authorization/私钥）
  lib/routes.js                   HTTP 薄适配（JSON/错误码/只读 messages/artifact 下载）
  test/*.test.mjs                 node:test 接缝测试（fake gateway/store/clock/redactor + fake Host）
window3-dispatch.html             窗口3 页面（dshell 皮肤，单文件）
scripts/smoke-window3-page.cjs    窗口3 jsdom 冒烟（假桥，不连服务器）
scripts/jsdom-resolve.cjs         两个 smoke 共用的 jsdom 解析（env JSDOM_PATH / node_modules）
```

### 安装与重启

```powershell
# 在仓库根目录
dsh plugin --profile web add file:bridge
# 最稳：重启 dsh web，让插件 bundle / 路由重新加载
```

- 安装/卸载是**显式操作**：`dsh plugin add` 会改 profile，重启 `dsh web` 后才生效；不要热改已安装目录。
- 插件不可用时窗口3 明确显示「桥未安装」并禁用写操作，不静默降级成假成功。
- 升级后确认 profile 仍加载 `bug-solver-dispatch`；插件不修改 worktable 源码。

### 配置（插件 config）

| 键 | 作用 |
|---|---|
| `dataDir` | run 表目录（`runs.json` + `runs/<id>/`）。缺省用 `profileContext.dir/bug-solver-dispatch`；显式配置优先。 |
| `allowedRoots` | 静态允许派发的本地仓库根（绝对路径）；窗口3 确认页填的 `project.localPath` 必须落在这些根内。realpath 后做分段前缀校验。 |
| `sshConfigPath` | 窗口2 配置文件路径；缺省由 `projectDir` 推出 `<projectDir>/data/ssh-config.json`；两者都没配时，只在 `dsh web` 当前目录确实存在 `data/ssh-config.json` 时采用（不猜）。 |
| `projectDir` | 工作台项目目录（用于定位 `data/ssh-config.json`）。 |
| `promptTimeoutMs` | prompt 准入超时；**无默认值**（缺省/0 = 不设超时）。 |
| `agentPreset` / `defaultSandboxMode` / `dirtyCheck` | 可选：会话 preset、修复会话 sandbox（默认 workspace-write）、脏工作区检查。当前配置 `dirtyCheck:false`：允许在脏仓库上派发做只读分析；实现阶段由会话另开 `.bug-solver/worktrees/<runId>`。 |

窗口2 项目配置已移除；`allowedRoots` 只来自插件配置。窗口3 确认页填的仓库路径必须落在根内、
存在且是干净 git 仓库，否则 `start` 返回 422 并在确认页标出字段。这样同一条允许根下可以派发任意仓库，
不再依赖窗口2 的 `projectId`。

### HTTP 契约（`/api/bug-solver/*`，同源、JSON、无 CORS）

| 方法 | 路由 | 说明 |
|---|---|---|
| POST | `start` | `{ draft, requestId? }`；返回 `{ run, idempotent }`。 |
| GET | `runs` / `run?id=` | run 列表 / 单个 run。 |
| POST | `approve-plan` | `{ runId, note? }`；只在 `awaiting_plan_approval`。 |
| POST | `plan-feedback` | `{ runId, feedback }`；只在 `awaiting_plan_approval`，回同一轮方案。 |
| POST | `request-changes` | `{ runId, note }`；只在 `awaiting_user_approval`，进入下一轮 `fix_planning`（不会 409）。 |
| POST | `resume` | `{ runId, note? }`；从 `needs_attention` 回到暂停前阶段并**重发该阶段 prompt**。 |
| POST | `stop` / `approve` | Stop / 最终通过。 |
| GET | `messages?runId&role=fix|review&before&limit` | 只读镜像；**`before` 是向前翻的水位**（`seq < before`），不传返回最新一页。 |
| GET | `artifact?runId&name[&download=1]` | 只读产物；限制在 run 目录、大小上限、桥侧脱敏；`download=1` 返回附件。 |

`publicRun` 的页面字段契约（唯一口径）：`bug` / `connection` / `project` / `specRef` / `service` /
`needsAttention {from,code,message,reason,round}` / `rounds[].planText` / `rounds[].review {verdict,blocking,summary,tests,path}` /
顶层 `plan`（当前轮正文）与 `review`。页面不再从内部 `draft` 或旧字段（`attention`/`reviewBlocking`）猜。

### 状态机与 needs_attention

```text
draft -> confirmed -> fix_planning -> awaiting_plan_approval
  approve-plan -> fix_implementing -> fix_done -> review_starting -> review_running
  plan-feedback -> fix_planning（同一轮、同一会话）
review_done:
  approve          -> awaiting_user_approval -> approved（用户点通过）
  request_changes  -> fix_planning（下一轮，自动）
  needs_info / blocked / 解析失败 / 无进展 -> needs_attention
needs_attention ->（用户回答后的下一个 turn/end，或 POST resume）-> 暂停前阶段（plan/fix/review），重发 prompt
```

- `needs_attention` 是硬闸门但**不是死路**：暂停时保留 pending 并让 Host 网关 watch 该会话；
  用户到 DSH 回答后，同一会话下一个 `turn/end`（completed/error）会被识别为「已回答」，
  自动重发暂停阶段的 prompt 继续（plan → attempt+1；fix/review 追加 attempt）。
- 页面「继续」按钮调用 `POST /resume`，行为相同；重复的 blocked 事件、错误会话的事件都会被忽略。
- 审核 `request_changes` 自动进入下一轮方案；同一 run 复用同一对会话。Stop/unknown 不自动重发。

### 产物与 manifest

- 修复会话在 `<repo>/.bug-solver/runs/<runId>/round-N/` 写 `plan.md`、`diagnosis.md`、`result.json`、`diff.patch`；
  审核会话只读，`review.md` 由桥从最终 assistant 消息提取后写入。
- 每轮完成后桥刷新 `run.artifacts`（相对路径列表）；方案完成时若 `plan.md` 缺失，桥用本轮最终文本兜底写入。
- `result.json` 校验（记入 `run.warnings` 与 `rounds[].manifestErrors`，不静默信任）：
  `branch`/`commit` 与 run 一致、`diffPath` 不逃出 run 目录、文件存在且不超 256 KiB、可选 `sha256` 与 diff 一致。
- 页面产物卡支持「查看」（桥只读接口，文本脱敏）与「下载」（`download=1`）。

### 窗口3 页面自检

```powershell
node scripts/smoke-window3-page.cjs     # jsdom 假桥：时间线/确认页/对话分页/needs_attention+resume/产物/request-changes
```

jsdom 解析顺序：`JSDOM_PATH` 环境变量 → 仓库 `node_modules/jsdom` → 当前目录 `node_modules/jsdom` →
`F:\ai-project\deepseek-harness\node_modules\jsdom`；都找不到时脚本给出明确安装/设置提示，不再把绝对路径写死。

## 历史路径：herdr 终端（可选）

> 布局只在**新建工作区**时选；已有项目不能原地换布局。换布局后窗口1/2 要重新点一次「自定义」把内容挂回来。窗口3 现在是调度台页面（HTML 窗格），下面是旧的 herdr 终端工作流，保留给需要手工诊断的场景。

1. 工作台「＋ → 新建工作区」→ 布局选 **`grid`**（顶 2 + 主 1）→ 文件夹 `F:\ai-project\my-dsh-plugins\plugins\bug-solver`；
2. 窗口3 的选择器里选 **「终端」**；
3. 在窗口3 输入 `herdr` 进入 TUI；
4. 在 herdr 的某个 pane 里运行：

```powershell
pwsh -NoProfile -File scripts\herdr-run.ps1 -Bug 3083
```

它会：右侧 split 一个 pane 跑 `scripts\tb-diagnose.ps1`（只读 SSH 诊断）→ 下方 split 一个 pane 启动 `claude` agent → 把该缺陷上下文（标题/编号/服务版本/容器/仓库）发给它。

- 只开诊断：加 `-NoAgent`
- 只看将执行什么：加 `-DryRun`
- 不在 herdr 里运行：脚本会打印手工步骤并退出（0），不会乱动你的窗格
- 换 agent 类型：`-Kind claude|codex|...`（以 `herdr agent` 列出的已安装类型为准）

**为什么必须由你在窗口3 启动 herdr**：herdr 只接受来自会话内部的控制（`HERDR_ENV=1`）；本会话不在 herdr 内，不能从外部驱动它。

## 只读诊断（tb-diagnose.ps1）

```powershell
pwsh -NoProfile -File scripts\tb-diagnose.ps1 -Bug 3083
pwsh -NoProfile -File scripts\tb-diagnose.ps1 -Container docker-dcim-web-1 -Lines 300
```

- 从 `data/bugs/*.json` 找缺陷 → 用 `config/herdr-env.json` 把「服务名」映射到容器与本地仓库；
- ssh 只执行 `hostname` / `docker ps` / `docker inspect` / `docker logs`，**不写、不重启、不删除**，不接受任意远端命令；
- 自动对比**缺陷报告版本 vs 容器运行版本**（实测：缺陷报 `datacenter-service-se-dcom:1.0.3-dev.17`、`dcom-web-test830:v1.0.97`，服务器运行 `dev.18` / `v1.0.98` → 版本漂移，问题可能已不可复现）；
- 过滤真正的错误行（排除 `INFO`，避免 `markTimeout` 之类误命中）；
- `-Out data\diag` 会把结论存成 Markdown。

## 环境映射（config/herdr-env.json）

```jsonc
{
  "servers": [{ "name": "test", "host": "10.12.139.111", "port": 22, "user": "root", "keyPath": "~/.ssh/id_ed25519" }],
  "services": [{ "match": ["visitor-management"], "container": "docker-visitor-management-1", "repo": "F:\\ai-project\\visitor-management2" }]
}
```

- 不含任何口令；SSH 用本机 `~/.ssh/id_ed25519`（已实测 `root@10.12.139.111`、`root@10.12.139.117` 可登录）；
- `repo` 为空表示还没映射本地代码库，面板显示“仓库未配置”；
- 目前只有 `visitor-management2` 映射到了本地仓库，其它服务按需补。

### 默认只显示窗口3

窗口1/窗口2 默认**收起**（引擎的 `minimized`），标题栏右侧会出现「收起的窗口」按钮，点一下即可展开；
窗口3 默认展开并占满内容区。改完布局文件后重新打开项目或刷新页面即生效。

```bash
node scripts/worktable-layout-v3.cjs show      # 看当前窗格状态
node scripts/worktable-layout-v3.cjs only p3   # 只展开窗口3（其余收起）
node scripts/worktable-layout-v3.cjs all       # 全部展开
node scripts/worktable-layout-v3.cjs toggle p1 # 收起/展开某个窗格
```

## 布局落盘（B 方案：布局跟着项目文件夹走）

原版 dsh-worktable 把「项目 / 布局 / 窗格」只存在浏览器 localStorage。本次给插件打了补丁，让**布局也能落盘到项目文件夹**：

- 文件：`.dsh-worktable\layout-<项目ID>.json`（本项目为 `layout-layout-30537acd-….json`）；
- 打开项目时**优先读该文件**（文件缺失/损坏 → 回落到 localStorage 存档）；
- 窗格/尺寸变更后防抖 600ms 自动回写该文件；
- 首次打开没有该文件时，会把当前存档写一份过去（自动落地）。

配套工具：

```powershell
node scripts/worktable-layout.cjs show                                  # 看当前布局文件
node scripts/worktable-layout.cjs set --top 2 --main 1 --ratio 0.5      # 顶行 2 + 主行 1
node scripts/worktable-layout.cjs rename-pane p3 "herdr"                # 改窗格标题
node scripts/worktable-layout.cjs backup                                # 备份
```

**已写入的布局**：顶行 2 窗（窗口1 / 窗口2，高度占比 0.5）+ 主行 1 窗（窗口3；标题可设为 `调度台` 或旧的 `herdr`）。

### 补丁在哪、怎么回滚

- 源码：`F:\ai-project\my-dsh-plugins\plugins\worktable\01_content\src\client\index.tsx`
  （新增 `layoutFilePath / readLayoutFile / writeLayoutFile`，并在 `openSplit` 与 `onSpecMutated` 里接入）
- 构建：`cd 01_content && npm run build`（服务端 `lib/index.js` 与安装版**逐字节一致**，只部署了 `lib/client.js`）
- 部署：`~\.dsh\profiles\web\node_modules\dsh-worktable\lib\client.js`
  - 原文件备份：同目录 `client.js.bak-20261026-154341`
  - 回滚：把备份复制回 `client.js`，删掉 `.dsh-worktable\layout-*.json`，重启 `dsh web`
- **生效需要重启 `dsh web`**：DSH 对插件 client bundle 是启动时扫描、之后不重扫（只按包增量），改文件后必须重启再刷新页面。
- 注意：插件是从 release tarball 安装的，将来重新 `dsh plugin add` 会覆盖这份补丁。

## 关于 Edge 反复要授权

Edge/Chromium 对**每一次新的调试端口连接**都会要你点一次「允许」。之前每次拉取都新建连接、失败还会重试多次，所以你会被反复弹窗。

现在的处理：

1. **不再自动重试**：一次拉取只连一次（`scripts/cdp-lib.cjs`）。
2. **不再每次新开标签页**：优先复用你已经打开的 TB 标签页。
3. **常驻转发（关键）**：启动一次 `scripts/tb-relay.cjs`，它保持一条已授权的连接；之后每次「立即拉取」都复用这条连接 —— **只会再让你授权一次**，实测 0.55 秒拉完。

窗口右上角徽标显示连接状态：`常驻连接`（复用中，不弹窗）/ `待连接`（首次拉取请点一次「允许」）/ `无常驻连接`（没启动转发，每次拉取都会重新授权）。

### 启动 / 停止常驻转发

```powershell
node scripts/tb-relay.cjs        # 启动（后台运行；工作台「任务」窗可见）
```

- 停止：结束该 node 进程（工作台「任务」窗停止，或 Ctrl+C）。
- DSH 重启后转发进程会退出，需要重新启动；重启后第一次拉取会再要一次授权。
- 只监听 `127.0.0.1:47821`，只响应本机请求。

## 使用

### 不依赖缺陷单：直接问一个问题

窗口3 顶栏 **「分析问题」**（或空态里的「分析一个问题」）→ 确认页填三件事 → 派发：

1. **问题描述**（必填，≥10 字）：现象、影响范围、复现步骤、报错原文、可疑服务/接口；
2. **SSH 连接**：从窗口2 的 `data/ssh-config.json` 自动带出，可换；
3. **代码仓库本地路径**（绝对路径，必须在 `allowedRoots` 内、是 git 仓库）。会话需要 cwd，所以这一项必填；
   **基线分支可选**：留空 = 用仓库当前分支（HEAD），不再默认 `master`；填了但分支不存在会自动回退到当前分支，
   并在 run 的 warnings 里记一条 `base-branch-missing`（不阻断派发）。
   容器名、spec 也可留空。

**日志时间窗**：默认「最近 3 天」是**滚动窗口**——派发那一刻才计算起止，草稿放多久都不会带出过期时间；
也能选最近 1 天 / 最近 12 小时，或选「自定义」手填起止（手填后按填写值派发）。

点 **确认并派发** 之后，桥会：

1. 在仓库下建独立工作区 `<repo>/.bug-solver/worktrees/<runId 前 8 位>` + 分支；
2. 起「分析修复」原生会话 → **第 1 轮先只出方案**（`round-1/plan.md`：诊断 / 改什么 / 怎么改 / 怎么测 / 风险）；
3. 方案出现在窗口3 时间线，你 **批准方案** 才开始改代码；也可以「退回意见」让它重做方案；
4. 改完自动进审核会话（只读 `git diff`），结论是 approve / request_changes / needs_info；
5. 你「通过」后 run 结束（`approved`）；之后可在面板删除记录。

想看细节：「任务」页签是时间线与产物，「对话（只读）」是两条原生会话的镜像。
审批、追问、Stop 都在 DSH 原生会话里做，窗口3 只是控制面。

### 缺陷派发（窗口1 → 窗口3）

1. 项目下拉选项目（默认 S1867_中联泰国DCOM）→ 负责人下拉选人（默认周泽宇）；
2. 点 **立即拉取**：读 TB（只读）→ 刷新列表；
3. 点列表行 → 整页详情；「← 返回列表」「✕」或 Esc 关闭；
4. 行内 **派发**（或详情里的「派发到窗口3」）→ 写草稿 + 广播 + 队列文件，反馈见上一节；重复点只更新草稿，不会产生第二条；
5. 详情里的 **处理信息** → 复制面板：
   - **问题内容**：标题、编号、状态、优先级、描述；
   - **环境服务信息**：服务/版本、环境/主机（IP、URL）、环境标识（测试/生产…）；
   - **代码库信息**：仓库地址/线索；
   - **复制处理信息**：三段拼成 Markdown。
6. **刷新**：只重读本地数据，不访问 TB。

## 数据与信息提取

- 只拉「选中项目 + 选中负责人」：`taskType = bug AND executorId = '<用户ID>'`；
- `env` / `repo` 由脚本从缺陷描述、富文本字段、自定义字段自动提取（IP、URL、端口/服务器行、含「程序名称/服务/版本」的字段、测试/生产等标识、`git@…`/gitlab/github 等仓库线索）；
- **能提就提，提不到显示「未获取」**。当前 TB 数据里没有代码仓库字段，所以代码库信息通常为空；要补需要一张「服务 → 仓库」映射表。

## 文件

```
tb-bugs.html                      窗口1 看板（单文件）
window3-dispatch.html             窗口3 调度台（单文件）
bridge/                           窗口3 Host 桥插件（lib 14 + test 19，见「窗口3：调度台」）
scripts/tb-relay.cjs              常驻转发（推荐），复用已授权连接
scripts/collect-tb.cjs            采集核心 + CLI（一次性进程用）
scripts/cdp-lib.cjs               Edge DevTools 连接（单次尝试，不自动重试）
scripts/verify-data.cjs           产物校验
scripts/smoke-window1-2.cjs       窗口1/2 jsdom 冒烟（派发、v1→v2、localPath、serviceMap）
scripts/smoke-window3-page.cjs    窗口3 jsdom 冒烟（假桥：时间线、对话分页、resume、产物）
scripts/jsdom-resolve.cjs         两个 smoke 共用 jsdom 解析（JSDOM_PATH / node_modules）
scripts/dev-preview.cjs           本地预览/截图（复刻 site/write/终端通道）
data/control.json                 项目/负责人/开关（窗口写入）
data/ssh-config.json              窗口2 连接 / 项目 / 关联 / serviceMap（桥只读 + 校验后写回）
data/state.json                   最近一次采集状态
data/projects.json                项目列表（24h 缓存）
data/members/<projectId>.json     项目成员（6h 缓存）
data/bugs/<pid>__<personId>.json  缺陷明细（含 env/repo 提取）
data/dispatch/queue.json          窗口1 派发队列（窗口3 没开时的追溯记录）
data/collector.log                日志
prototype-tb-bugs-ui.html         早前的 A/B/C 布局原型（不再使用）
```

## 自检

```powershell
# 窗口3 桥：接缝测试（fake gateway/store/clock/redactor + fake Host，不装插件、不连服务器）
cd bridge
npm test                                # = node --test --test-isolation=none "test/*.test.mjs"

# 页面冒烟（jsdom，无需 Edge / 工作台 / 已安装插件）
cd ..
node scripts/smoke-window3-page.cjs
node scripts/smoke-window1-2.cjs

# 采集/产物（会连一次 Edge）
node scripts/collect-tb.cjs
node scripts/verify-data.cjs
```

- `npm test` 必须带 `--test-isolation=none`（测试共享临时目录与 fake Host 状态，进程隔离反而会让断言失配）。
- smoke 的 jsdom 解析见 [窗口3 页面自检](#窗口3-页面自检)；找不到时设置 `JSDOM_PATH`。

## 排查

- **`无常驻连接`**：没启动 `scripts/tb-relay.cjs`，或进程已退出；启动后点一次拉取即可。
- **首次拉取很久没反应**：Edge 弹了授权确认，点「允许」。
- **采集异常：连接超时**：Edge 未开远程调试（`edge://inspect/#remote-debugging`）或调试端口已失效。
- **采集异常：TB 会话/HTTP**：在 Edge 里重新登录 TB。
- 日志 `data/collector.log`；状态 `data/state.json`。

---

# 窗口2 · SSH 连接（项目配置已移除）

「工作台 → bug-solver → 窗口2」现在**只保留 SSH 连接**；代码项目、localPath、服务映射、关联视图已移除，
**代码仓库路径 / 基线分支 / 目标 spec 统一在窗口3 派发确认页填写**。

- **主从布局**：左列连接列表，右侧编辑表单；
- **私钥用本机路径**（`ssh -i`），不保存密钥内容；
- **测试连接**：经工作台终端通道只读执行 `printf`，四段检查与常见失败原因落提示；
- **持久化**：`data/ssh-config.json` 的 `connections`；旧 `projects` / `serviceMap` / `links` 仅作历史数据保留，
  页面不再读写，桥也不再据此校验派发。

> 旧的「代码项目 / 服务映射 / 关联视图」说明已废弃；代码仓库和分支以窗口3 的确认页为准。

## 数据文件（version 2）

```json
{
  "version": 2,
  "connections": [{ "id": "conn-prod", "name": "生产服务器", "host": "10.20.31.87", "port": "22",
                    "user": "deploy", "key": "~/.ssh/id_ed25519", "isDefault": true,
                    "lastTestOk": null, "lastTestAt": null, "lastTestMsg": "" }],
  "projects":    [{ "id": "proj-web", "name": "cet-electric-web", "repo": "git@…",
                    "remotePath": "/srv/www/cet-electric-web",
                    "localPath": "F:\\ai-project\\cet-electric-web",
                    "defaultBranch": "develop", "branches": ["develop", "master"], "note": "前端 · Vue3" }],
  "links":       [{ "connectionId": "conn-prod", "projectId": "proj-web" }],
  "serviceMap":  [{ "match": ["cet-electric-web", "dcom-web"], "projectId": "proj-web", "container": "docker-dcom-web-1" }]
}
```

- `links` 是多对多关系表，删除连接或项目时对应行一并清掉。
- `serviceMap[].match` 命中缺陷里的服务名 / 镜像名 / 容器名；`container` 可选，用于窗口3 只读日志定位。
- **v1 → v2 自动迁移**：读到 `version: 1`（或无 version）时补 `project.localPath: ""` 与顶层 `serviceMap: []`，页面顶部提示；
  保存后写回 `version: 2`，连接 / 项目 / 关联不丢。迁移是幂等的（v2 不会被再迁移）。

## 文件

```
ssh-config.html                    窗口2 配置管理（单文件，原生 dshell 皮肤）
data/ssh-config.json               连接 / 项目 / 关联 / serviceMap（v1 自动迁移，首次带示例数据，可全删）
prototype-ssh-config-ui.html       交互原型（A/B/C 三方案，确认 A 后留档）
scripts/dev-preview-ssh-config.cjs 本地预览：伪造 write + 终端通道，截图到 preview/cfg-*.png
scripts/smoke-window1-2.cjs        窗口1/2 冒烟（jsdom）：派发、v1→v2、localPath、serviceMap
preview/cfg-*.png                  宽屏 / 窄屏 / 测试连接 / 分支 / 矩阵截图
```

## 自检

```powershell
node scripts/smoke-window1-2.cjs          # 窗口1/2 冒烟（jsdom，无需 Edge / 工作台）
node scripts/dev-preview-ssh-config.cjs   # 本地渲染 + 假终端跑测试连接/读分支 + 截图（会连一次 Edge 调试端口）
```

- 想看真实效果：直接在工作台里打开窗口2（不跑上面的脚本，也不需要 Edge 调试端口）。
- 测试连接 / 读分支都需要窗口开在工作台内（走同源终端通道）；在普通浏览器里打开会提示「终端通道连接失败」。
