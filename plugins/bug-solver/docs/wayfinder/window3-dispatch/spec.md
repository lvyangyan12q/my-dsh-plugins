---
id: window3-dispatch-spec
title: 窗口3 调度台（bug-solver）规格
labels: [ready-for-agent]
status: open
kind: implementation-spec
decision_map: window3-dispatch
created: 2026-10-27
---

# 窗口3 调度台（bug-solver）规格

## 变更记录

- 2026-10-27：审核 ↔ 修复自动循环；每轮方案批准；只读对话镜像；UI 方向定为 B 时间线；复盘窗口独立（window4）。
- 2026-10-28：窗口2 收敛为 SSH-only，代码仓库/基线分支/spec 移到窗口3；spec 支持仓库外绝对路径或「无」；日志时间窗默认最近 3 天；容器可留空按项目名查 `docker ps`；允许脏仓库做只读分析，实现阶段另开 `.bug-solver/worktrees/<runId>`；桥路由改为 `webServer` exact + `connection.admit`（`connection.fetch` 在普通 iframe 下 400）。

## Problem Statement

用户在工作台 `bug-solver` 项目里处理 Teambition 缺陷：窗口1 看缺陷列表，窗口2 配 SSH 连接。真正处理一条缺陷时，仍要手动复制缺陷信息、开终端 `ssh` 查日志、在本地仓库里找代码、改完再找人审；窗口1 的「处理」只展开一段可复制的文本，窗口3 目前是空的。

用户希望窗口3 成为一个调度台：从窗口1 点「处理」开始，结合窗口2 的 SSH 连接确认信息，并在窗口3 直接指定代码仓库路径和基线分支，然后启动**两个 DSH 原生会话**——一个负责连服务器只读分析、读本地代码并修复，另一个负责审核代码改动——窗口3 展示运行状态和产物，最后由用户决定合入。

## Solution

窗口3 提供确认页 + 运行看板。窗口1 点「处理」把缺陷草稿送到窗口3；窗口3 自动带出缺陷信息、匹配窗口2 的 SSH 连接，并让用户直接填代码仓库本地路径、基线分支和目标 spec（不再依赖窗口2 的项目配置）。确认后，Host 桥插件在目标本地仓库的 workspace 启动「分析修复」DSH 会话；桥插件用 Host 的 `turn/end` 判定完成。修复完成后，桥自动启动只读的「审核」DSH 会话；审核给出 `approve` / `request_changes` / `needs_info`，`request_changes` 会自动让同一个修复会话续跑，再自动送审，形成**审核 ↔ 修复循环**，直到审核通过、需要你确认、你 Stop，或检测到无进展。你最终点「通过」；合入前进入复盘窗口。

两个会话都是 DSH 原生会话，审批、提问、Stop 用原生能力；**不设调度 agent**，顺序由窗口3 + 桥的状态机保证；**不设固定运行默认值**（超时、模型、重试、轮次上限按需配置或留空）。循环自动推进，但**每一轮修复前都先出方案，你在窗口3 确认/退回后再改**；涉及信息缺口、越界改动时还会额外停。同一 run 复用同一对会话，新 bug 才新开会话。

窗口3 同时提供**只读对话镜像**：你可以不离开任务看板就看修复/审核会话的对话、工具调用和审核结论；但输入、审批、提问、Stop 仍然回 DSH 原生会话，镜像不写、不代发。

## User Stories

1. 作为缺陷处理人，我希望在窗口1 点「处理」就把该缺陷送到窗口3，以便不用手动复制编号、标题和描述。
2. 作为缺陷处理人，我希望点缺陷标题仍能看原来的整页详情，以便派发前核对上下文。
3. 作为缺陷处理人，我希望窗口1 显示「已发送/等待确认」的反馈，以便知道派发是否成功。
4. 作为缺陷处理人，我希望窗口3 没打开时请求也不丢，以便下次打开继续确认。
5. 作为缺陷处理人，我希望重复点同一条缺陷不会产生两个运行，以便避免重复派发。
6. 作为缺陷处理人，我希望确认页自动带出缺陷编号、标题、状态、优先级、描述、服务/版本、环境主机，并允许目标 spec 填仓库内相对路径、仓库外绝对路径或「无」，以便少填。
7. 作为缺陷处理人，我希望确认页自动匹配窗口2 中可访问该服务的 SSH 连接，以便直接确认。
8. 作为缺陷处理人，我希望在窗口3 直接填代码仓库本地路径，以便不受窗口2 项目配置缺失影响。
9. 作为缺陷处理人，我希望在窗口3 直接填基线分支，以便修复分支从正确基线切出。
10. 作为缺陷处理人，我希望能在确认页改 SSH 连接、代码仓库、基线分支、容器名、日志时间窗和补充说明，并且日志时间窗默认最近 3 天、容器名可留空由会话按项目名查找，以便少填。
11. 作为缺陷处理人，我希望确认页校验路径存在、是 git 仓库、SSH 配置完整、映射完整，以便派发前发现问题。
12. 作为缺陷处理人，我希望确认页显示将启动的会话的工作目录、分支和标题，以便知道会发生什么。
13. 作为缺陷处理人，我希望点「确认并派发」后看到 run 进入「修复中」，以便知道会话已启动。
14. 作为缺陷处理人，我希望分析修复会话只对服务器执行只读命令，以便不改变生产状态。
15. 作为缺陷处理人，我希望分析修复会话读本地代码定位原因，并在新分支提交修复，以便不污染基线。
16. 作为缺陷处理人，我希望修复会话把诊断、结论、diff 和结果清单写成产物，以便审核和追溯。
17. 作为缺陷处理人，我希望修复失败、被 Stop 或结果未知时看板显示真实原因，以便决定是否重来。
18. 作为缺陷处理人，我希望修复完成后看板提示「待审核」，以便启动审核。
19. 作为缺陷处理人，我希望修复完成后自动进入审核，但需要方案确认或补充信息时停下来等我，以便既省点击又不失控。
20. 作为缺陷处理人，我希望审核会话是只读沙箱，不能改代码，以便审核不污染修复分支。
21. 作为缺陷处理人，我希望审核会话输出结论、风险分级、必改项和测试建议，以便我判断能不能合入。
22. 作为缺陷处理人，我希望在 DSH 里打开两个会话追问、审批和 Stop，以便用原生能力控制 agent。
23. 作为缺陷处理人，我希望窗口3 看板列出 run、阶段、状态和时间，以便一眼看到进度。
24. 作为缺陷处理人，我希望在窗口3 查看和下载诊断、diff、审核产物，以便复核。
25. 作为缺陷处理人，我希望能在窗口3 Stop 修复或审核会话，以便及时止损。
26. 作为缺陷处理人，我希望 Stop 后能重开新 run，而不是复用旧会话，以便避免旧队列重放。
27. 作为缺陷处理人，我希望刷新页面或重启 DSH 后看板能从持久化记录恢复，以便不丢状态。
28. 作为缺陷处理人，我希望看到「结果未知」时明确提示不要自动重发，以便避免重复执行。
29. 作为配置维护人，我希望窗口2 只保留 SSH 连接，不再维护代码项目，以便配置入口单一。
30. 作为缺陷处理人，我希望代码仓库和基线分支都在窗口3 派发时指定，以便每条缺陷可以用不同仓库/分支。
31. 作为配置维护人，我希望旧的 SSH 配置能平滑升级，以便不丢已有连接。
32. 作为安全负责人，我希望服务器密码、私钥内容不进提示词、日志和产物，以便不泄露凭据。
33. 作为安全负责人，我希望修复只落本地分支，不自动合入、不自动重启服务、不写服务器，以便保留人工控制。
34. 作为缺陷处理人，我希望合入由我手工完成，窗口3 只记录「已审核/已合入」，以便职责清晰。
35. 作为缺陷处理人，我希望窗口3 作为 HTML 窗格挂载，刷新后保留，以便像窗口1/2 一样使用。
36. 作为缺陷处理人，我希望没有固定的超时、模型或并发限制，按需配置，以便适配不同缺陷。
37. 作为缺陷处理人，我希望同一本地仓库同一时间只跑一个修复，避免 git 工作区互相污染，其他缺陷排队。
38. 作为缺陷处理人，我希望看板有空态、错误态和运行中态，以便知道该做什么。
39. 作为缺陷处理人，我希望桥插件不可用时页面明确报错、不假装已派发，以便我知道系统状态。
40. 作为缺陷处理人，我希望审核不通过时自动回到修复、同一 run 继续，以便闭环而不用手动重开。
41. 作为缺陷处理人，我希望审核 ↔ 修复循环自动推进到下一轮方案，直到通过、需要我确认或我 Stop，以便不用逐轮点按钮。
48. 作为缺陷处理人，我希望每一轮修复前先看到方案（改什么、怎么改、怎么测），确认或退回后再让它动代码，以便不会先改再解释。
49. 作为缺陷处理人，我希望在窗口3 直接看修复/审核会话的对话，以便不用来回切 tab 就知道 agent 为什么这么改。
50. 作为缺陷处理人，我希望对话是只读的、分页/自动刷新，并且明确标“在 DSH 回复”，以便不会误以为能在窗口3 里输入。
51. 作为缺陷处理人，我希望对话里能分辨 agent 文本、工具调用、审核结论和你的回答，以便快速扫读。
52. 作为缺陷处理人，我希望一键在 DSH 打开对应会话去回复或审批，以便窗口3 只读、原生会话负责交互。
53. 作为安全负责人，我希望对话镜像里的密码/令牌被脱敏，且窗口3 不能通过镜像写回会话，以便不扩大泄露面。
42. 作为缺陷处理人，我希望会话需要方案选择或补充信息时暂停，窗口3 显示「需要你回复」并给我会话入口，以便我确认后再继续。
43. 作为缺陷处理人，我希望看板显示第几轮、每轮的 diff 和审核结论，以便知道改了什么、为什么还没过。
44. 作为缺陷处理人，我希望同一 run 复用同一对会话、新 bug 才新开会话，以便保留上下文又不把旧上下文带进新缺陷。
45. 作为缺陷处理人，我希望确认页能选/填目标仓库的 spec，run 记录 spec、分支和 commit，以便复原“为什么这么改”。
46. 作为缺陷处理人，我希望循环结束、合入前能一键进入复盘窗口，看到 spec、分支、commit、每轮产物和审核结论，以便复盘代码质量和流程。
47. 作为缺陷处理人，我希望审核反复提同一个问题或没有新提交时自动暂停，而不是无限循环，以便我决定换方案或停。

## Implementation Decisions

### 总体架构

- **选 DSH 原生会话**：分析修复、审核各一个；不引入 Claude CLI、herdr 或调度 agent。
- **自动循环 + 每轮方案确认**：每轮修复先由修复会话产出方案，窗口3 等你「批准方案 / 退回修改」，批准后才让同一会话动代码；修完自动送审；审核 `request_changes` 自动进入下一轮方案；`needs_info`、越界改动、无进展时额外暂停。最终由你「通过」。
- **选 Host 桥插件**（不走工作台深应用）：桥插件暴露本项目专属的 HTTP 路由，内部用 Host 的会话/工作区服务创建并驱动两个原生会话；窗口3 仍是 HTML 窗格，用 `fetch` 调桥。理由：目标仓库每次不同，需要按 run 动态建 workspace；深应用的角色 cwd 是固定的，换仓库要重配，且要额外做 React 视图。
- **窗口3 是控制面**：确认、状态、产物、操作；真正的对话、审批、提问、Stop 在 DSH 原生会话里。
- **确定性状态机**：桥按固定状态机推进，审核结论驱动循环；不依赖 LLM 决定流程，LLM 只负责诊断/修复/审核内容。
- **无固定运行默认值**：不内置超时、模型、重试次数、轮次上限或并发上限；配置项可选。唯一的调度约束是同一本地仓库的修复会话串行（避免 git 工作区冲突），可用 worktree 方案另行放开。无进展检测只暂停，不判失败。
- **spec 来自目标仓库**：确认页选/填目标仓库里的 spec（speckit 的 `specs/<feature>/spec.md` 或等价文档），run 记录 spec、分支、commit；复盘窗口据此复原上下文。

### UI 方向（已定）

- 采用 **B 轮次时间线**：以“第 N 轮方案 → 第 N 轮实现 → 第 N 轮审核”为纵轴，方案/审核卡内嵌在时间线上；顶部保留 run 摘要和 `任务 / 对话（只读）` 页签。
- 对话页签分 `分析修复 / 审核`，只读、分页、运行中刷新；输入、审批、Stop 回 DSH。
- A（三栏控制台）和 C（分步向导）只作为原型留档，不进入正式实现。

### 组件与接口

1. **桥插件（Host）**
   - `DispatchService`：纯编排状态机，持有 run 表，调用注入的 `SessionGateway`、`RunStore`、`Clock`、`Redactor`。
   - `SessionGateway`：封装 `create`（cwd/workspace、预生成 sessionId）、`rename`（标题）、`prompt`（确定性 requestId）、`cancel`、`setSandboxMode`、`observe`（Host `session/event` + 权威日志重放）。
   - `RunStore`：版本化 run 表，原子写；run 与 artifact 目录一一对应；启动时重放日志对账。
   - HTTP 路由：`/api/bug-solver/*` 的 `start`、`list runs`、`get run`、`approve-plan`、`plan-feedback`、`stop`、`approve`、`request-changes`、`messages`；`messages` 只读（GET，按 role/cursor/limit 分页），只返回脱敏后的消息，不提供发送/编辑/审批；审核由桥自动启动，没有单独的「开始审核」路由；通过 `ctx.webServer.register` 挂 exact 路由（Node req/res），用 `connection.admit(req)` 鉴权；**不要用 `connection.fetch`**——普通 iframe fetch 没有客户端 RPC Peer，会得到 400（已实测）。仅同源、JSON、无 CORS。
   - 产物读取：窗口3 通过桥的 run 详情拿产物清单；产物内容走工作台的静态文件通道或桥的读接口，二者选一，不在页面里拼绝对路径。

2. **窗口3 页面（HTML，dshell 皮肤）**
   - 顶部：标题、状态徽标、刷新。
   - 确认区：缺陷摘要、SSH 连接、代码仓库本地路径、基线分支、目标 spec（仓库内相对路径 / 仓库外绝对路径 / 无）、容器（可留空，分析会话按项目名/服务名查 `docker ps`）、日志时间窗（默认最近 3 天）、补充说明、校验提示、「确认并派发」。
   - 方案区：每轮修复的 `plan.md`（改什么/怎么改/怎么测/风险），「批准方案 / 退回修改 + 意见」。
   - 运行区：run 列表（待确认方案/修复中/待你确认/循环中/待通过/已结束）、轮次时间线（第 N 轮方案 → 第 N 轮修复 → 第 N 轮审核）、状态、会话入口（标题 + 复制 ID）、每轮产物列表、操作（Stop、通过、要求再改、去复盘）。
   - 对话区：`任务 / 对话（只读）` 页签；对话再分 `分析修复 / 审核`；只读消息流（agent 文本、工具调用、审核结论、你的回答），分页加载、运行中自动刷新、底部“在 DSH 打开并回复”。没有输入框，不提供发送/审批按钮。
   - 轮询：活跃 run 1.5s，空闲 10s；无 WebSocket、无 DOM 轮询判断完成。
   - 空态/错误态/桥不可用态明确。

3. **窗口1 改造**
   - 「处理」按钮改为「派发到窗口3」；缺陷标题仍打开原详情。
   - 派发时写 `localStorage` 草稿 + `BroadcastChannel` 通知 + 队列文件（窗口3 关闭也不丢）。
   - 幂等：按缺陷 id 复用未确认草稿；已有活跃 run 则提示并切到该 run。
   - 反馈：已发送/等待确认/失败。

4. **窗口2 改造（已收敛为 SSH-only）**
   - 窗口2 只保留 SSH 连接（主机/端口/用户/私钥路径/测试连接）；不再展示或维护代码项目、localPath、serviceMap、links。
   - 旧 `ssh-config.json` 的 projects/serviceMap/links 作为历史数据保留，但页面不再读写；`connections` 继续平滑加载。
   - 代码仓库路径、基线分支、目标 spec 由窗口3 确认页直接指定；桥不再校验 `projectId`。
   - 旧的 `config/herdr-env.json` 只作为历史诊断脚本的兜底。

### 数据契约

`DispatchDraft`（窗口1 → 窗口3 → 桥）：

```json
{
  "runId": "uuid",
  "bug": { "id": "...", "uid": 3083, "title": "...", "description": "...", "status": "...", "priority": 0, "fields": [] },
  "connection": { "id": "conn-test", "name": "111", "host": "10.12.139.111", "port": "22", "user": "root", "keyPath": "..." },
  "project": { "name": "窗口3 指定仓库", "localPath": "E:\\work\\projects\\dcom", "baseBranch": "develop-v3.0" },
  "specRef": { "kind": "file|url|none", "path": "specs/<feature>/spec.md 或 F:\\docs\\spec.md（仓库外绝对路径）", "feature": "<feature>" },
  "container": "docker-...",
  "timeWindow": { "from": "2026-10-27T00:00:00+08:00", "to": "..." },
  "notes": "用户补充",
  "source": { "window": "窗口1", "pane": "p1" }
}
```

`Run`（桥持久化）：

```json
{
  "version": 1,
  "id": "uuid",
  "bugId": "...",
  "bugUid": 3083,
  "state": "draft|confirmed|fix_planning|awaiting_plan_approval|fix_implementing|fix_done|fix_failed|review_starting|review_running|review_done|needs_attention|review_failed|stopped|awaiting_user_approval|approved|unknown",
  "specRef": { "kind": "file|url|none", "path": "specs/<feature>/spec.md 或 F:\\docs\\spec.md（仓库外绝对路径）", "feature": "<feature>" },
  "fixSessionId": "uuid",
  "reviewSessionId": "uuid|null",
  "currentRound": 1,
  "rounds": [{ "round": 1, "planRequestId": "...", "fixRequestId": "...", "reviewRequestId": "...", "planPath": "round-1/plan.md", "planApprovedAt": 0, "planFeedback": "", "commit": "...", "diffPath": "round-1/diff.patch", "verdict": "approve|request_changes|needs_info", "reviewPath": "round-1/review.md", "completedAt": 0 }],
  "commits": ["..."],
  "branch": "bugfix/3083-<runId>",
  "baseBranch": "master",
  "artifacts": ["round-1/plan.md", "round-1/diagnosis.md", "round-1/result.json", "round-1/diff.patch", "round-1/review.md"],
  "retro": { "state": "pending|running|done", "sessionId": null, "reportPath": null },
  "error": null,
  "createdAt": 0,
  "updatedAt": 0,
  "approvedAt": null
}
```

`ChatMessage`（只读对话镜像，按 role/cursor 分页）：

```json
{ "seq": 42, "at": 0, "role": "user|assistant|tool|system", "kind": "text|tool|plan|review|notice", "text": "脱敏后的文本", "toolName": "ssh|bash|read|edit|null" }
```

状态机（来自本次设计，不是原型）：

```text
draft -> confirmed -> fix_planning -> awaiting_plan_approval
  awaiting_plan_approval:
    approve-plan     -> fix_implementing (同一修复会话，开始动代码)
    plan-feedback    -> fix_planning (同一修复会话，改方案)
  fix_implementing -> fix_done | fix_failed | needs_attention | stopped | unknown
  fix_done -> review_starting -> review_running
  review_running -> review_done | review_failed | needs_attention | stopped | unknown
  review_done:
    verdict=approve          -> awaiting_user_approval -> approved (用户点通过)
    verdict=request_changes  -> fix_planning (next round, 同一修复会话；自动)
    verdict=needs_info       -> needs_attention
    verdict 解析失败          -> needs_attention (保留原文)
  needs_attention -> (用户回答/确认) -> 当前阶段
  approved -> retro pending (窗口4，合入前)
  fix_failed | review_failed | stopped | unknown -> 新 run（不复用旧会话）
  无进展（审核重复同一 blocking 且无新 commit/plan）-> needs_attention
```

### 会话与产物

- **容器与时间窗**：确认页的日志时间窗默认最近 3 天；容器名可留空，方案/诊断阶段先用只读 `docker ps` 按项目名/服务名匹配容器，再查日志，不猜容器。
- **修复会话**：workspace = 目标本地仓库（workspace-write）；标题 `BUG-<uid> 分析修复`。同一 run 复用该会话，每轮两个阶段：
  - **方案阶段**：只读 `specRef` / 缺陷 / 上一轮审核结论，写 `round-<N>/plan.md`（诊断、改什么、怎么改、怎么测、风险），**不动代码**；完成后进入 `awaiting_plan_approval`。
  - **实现阶段**：用户批准后执行该方案；加载 `ssh-connect` 做只读服务器核对；**不在原工作区直接改**（原工作区可能脏），而是基于 `baseBranch` 新建 worktree `.bug-solver/worktrees/<runId>` 和分支 `bugfix/<uid>-<runId>`，在 worktree 内实现/测试/提交；写 `round-<N>/diagnosis.md`、`result.json`（含 `worktreePath`）、`diff.patch`；桥把 `.bug-solver/` 加入本仓库 `.git/info/exclude`，不改 tracked `.gitignore`。原工作区只读，未提交改动不被清理/提交。
  - 方案被退回时，带用户意见回到方案阶段，不进入实现。
- **审核会话**：workspace 与修复会话相同；创建后用 `sandboxPolicy.setSandboxMode(session, 'read-only')` 切到只读（若当前组合没有该能力，则配置一个 read-only permission preset）。`additionalWritableRoots` 在 read-only 下不生效，所以审核产物由桥从最终消息提取。标题 `BUG-<uid> 审核`。prompt 给 `specRef`、runId、当前轮、分支、base、上一轮 diff/产物；要求读 spec + `result.json`/`diff.patch`/`diagnosis.md` 并跑只读 `git diff`；最终消息先给一个固定 JSON 结论块（`verdict` / `summary` / `blocking` / `tests`），再给人类可读说明。**审核会话没有写权限，`review.md` 由桥从最终 assistant 消息提取后写入本轮目录**。同一 run 复用该会话再审。
- **审核 ↔ 修复循环**：桥解析审核 JSON；`approve` → `awaiting_user_approval`；`request_changes` → 自动向同一修复会话发送下一轮**方案** prompt（附 blocking findings），进入下一轮方案，等你批准后才实现；实现完成后再自动送审。`needs_info`、解析失败、`blocked` → `needs_attention`，不自动推进。用户回答/确认后从当前阶段继续。审核反复同一 blocking 且没有新 commit/plan → `needs_attention`（无进展暂停，不判失败）。
- **人工闸门**：每轮方案由窗口3 的「批准方案 / 退回修改」控制，桥不自动批准；退回意见进入下一版方案。修复/审核会话用 DSH 原生提问或审批时，桥把状态置 `needs_attention`，窗口3 显示「需要你回复」+ 会话入口；**不**替用户回答，也不自动跳下一轮。
- **spec**：`specRef` 进两个 prompt；没有 spec 时记 `none`，审核只按 diff + 缺陷描述。确认页可从目标仓库的 speckit `specs/<feature>/spec.md` 或等价文档自动建议。
- **完成信号**：桥订阅 Host `session/event`；先确认 `user/message.source.rpcId === requestId`，再等该 turn 的 `turn/end`；`completed` 成功、`aborted` 为 Stop、`error` 失败、`interrupted` 为未知；事件后 flush + 权威日志重放核对。
- **幂等**：预生成 sessionId 并 `stat`；`create` 返回 id 不一致视为异常；每轮 prompt 用确定性 requestId（`<runId>:plan:<round>:<attempt>` / `<runId>:fix:<round>` / `<runId>:review:<round>`）；`unknown` 不自动重发。DSH 无删除会话 API：create 成功但 prompt 失败只能记 `delivered-unknown` + cancel/archive，空会话可能留在列表，不假装删除。
- **Stop/重试**：Stop 后不复用旧会话；重试开新 run / 新会话，旧 run 保留记录。新 bug 一定新 run / 新会话，不继承旧上下文。
- **只读对话镜像**：桥按 role（fix/review）+ cursor 读会话历史（Host `sessionQuery`/权威日志），返回 `{role, kind, text, toolName?, at, seq}`；文本走同一个脱敏器；窗口3 只展示，不提供写入路径。原生会话仍是唯一真相，镜像延迟可接受，状态机不依赖镜像。

### 安全边界

- 服务器只读：`ssh-connect` + 一个只读 SSH 包装脚本（白名单：`hostname`、`docker ps`、`docker inspect`、`docker logs`、只读文件查看），prompt 要求经包装脚本执行；禁止重启/删除/写服务器。
- 凭据：私钥只用路径；bug 描述中的 `密码/password/passwd` 等字段在进 prompt 前脱敏；产物与日志同样脱敏。
- 本地：**允许脏工作区派发**（主要用于只读查询分析；`dirtyCheck:false`）；实现阶段必须在 `.bug-solver/worktrees/<runId>` 新建 worktree，从 `baseBranch` 切 `bugfix/...`，原工作区只读；不自动合入、不自动改基线、不自动提交到受保护分支。
- 桥的 `start` 只接受 `allowedRoots`（插件配置的仓库根）内的绝对路径；`realpath` 后做前缀校验，拒绝任意目录；确认页填写的路径必须显式确认。窗口2 不再提供 localPath。
- 审核会话 `read-only`；桥不提供写服务器或合入的能力。
- 窗口3 不显示密码/私钥内容；错误信息不回显敏感字段。
- 对话镜像：只读 API；消息文本在桥侧脱敏（密码/令牌/Authorization）；窗口3 不提供输入、发送、审批；镜像不能改变会话状态。

### 挂载与安装

- 窗口3 产物为单文件 HTML，按工作台 v2 清单挂到 pane-p3（`kind: html`）；窗口1/2 沿用各自现有挂载。
- 桥插件是单文件 Host 插件（ESM，无构建），用 `dsh plugin --profile web add file:<目录|tgz>` 安装，`dsh.profile.bundles` 自动追加；重启 `dsh web` 最稳；`engines.dsh` 对齐 `0.2.1-rc.3`。插件不修改 dsh-worktable 源码。
- 自动打开：Host 不能切换 GUI；窗口3 可尝试同源 `window.top.__dshOpenSession(id)`（未验证），失败则只显示会话标题/ID。
- 无删除会话 API：失败/Stop 只 cancel/archive，空会话可能留在列表；不假装删除。
- 升级/卸载：插件独立于 worktable；卸载后窗口3 显示「桥不可用」，不静默降级。

施工任务图：[implementation/README.md](implementation/README.md)（IM01–IM05）。

## Testing Decisions

好的测试只验证外部可观察行为，不绑定内部实现细节；优先在最高的接缝上测，接缝越少越好。

### 接缝 A：`DispatchService`（主接缝）

- 注入 fake `SessionGateway`（记录 create/prompt/cancel/setSandboxMode 调用，可脚本化 Host 事件）、fake `RunStore`（内存/临时目录）、可控 `Clock`、fake `Redactor`。
- 覆盖：
  - 草稿校验（缺 localPath、路径不存在、非 git、SSH 不完整；脏工作区允许，实现前另开 worktree）。
  - `start` 的幂等与并发（同 bug 重复派发、同仓库串行、其他仓库并行）。
  - 状态机全部分支：完成、Stop、error、interrupted、unknown。
  - `turn/end` 定位：requestId 不匹配、turn 不匹配、重复事件、迟到事件。
  - 审核会话创建：同 workspace、read-only、rename、产物提取。
  - **循环**：`approve` / `request_changes` / `needs_info` / 解析失败 / 无进展；`request_changes` 自动进入下一轮方案；同一对会话复用；轮次与 requestId 递增。
  - **方案闸门**：方案阶段不得改代码；`approve-plan` 才进入实现；`plan-feedback` 回到方案；未批准不得产生 commit/diff。
  - **人工闸门**：`blocked` → `needs_attention`；用户回答后从当前阶段继续，不跳轮。
  - **只读对话**：按 role/cursor 分页、消息脱敏、工具调用分类、无写入接口；镜像落后/缺失不影响状态机。
  - **新 bug**：新 run、新会话，不继承旧 run 的 session。
  - Stop/重试：不复用旧会话、新 run。
  - 产物 manifest 校验：路径逃逸、大小上限、sha256、分支/commit 一致性；每轮目录隔离。
- 先例：工作台的 `04_test/tasks.test.mjs`、`task-host.test.mjs`、`role-native.test.mjs`（注入 native 适配、用 fake 服务测状态机）。

### 接缝 B：窗口页面（HTML）

- 用现有 `scripts/dev-preview-*.cjs` 的本地预览/截图方式（jsdom 或 CDP），用 fake `fetch` 返回 run 数据。
- 覆盖：
  - 确认页：自动带出、缺项校验、按钮禁用/启用、确认后状态；日志时间窗默认最近 3 天；容器留空提示「按项目名查」。
  - 看板：各阶段徽标/轮次时间线、每轮产物、空态/错误态/桥不可用、`needs_attention`、Stop/通过/要求再改/去复盘的可用性。
  - 对话页签：只读提示、修复/审核切换、消息类型/脱敏、分页、运行中刷新、"在 DSH 打开"；断言没有输入框和发送按钮。
  - 窗口1：派发按钮、详情入口、已发送反馈、重复派发提示。
  - 窗口2：只验证 SSH 连接编辑/测试/保存仍工作；项目相关旧断言不再适用。
- 断言语义状态（文本、`disabled`、`data-state`），不锁 DOM 层级；截图只用于验收留档。
- 先例：`scripts/dev-preview-ssh-config.cjs`、`scripts/dev-preview.cjs` 的假通道 + 截图模式。

### 接缝 C：数据与 HTTP（轻量）

- `ssh-config.json` v1→v2 迁移与校验：纯函数，临时目录测试。
- 桥 HTTP 路由：进程内 web server，测鉴权（无 cookie/401）、JSON（415）、校验（422）、重复（409）、未知 run（404）。
- 先例：工作台 `project-layout-http.test.mjs`、`application-http.test.mjs`。

### 验收（不是单元测试）

- 窗口3 真实挂载渲染；确认页能带出真实 bug 数据；dry-run 不连服务器也能走完状态机；一次真实 run（低风险 bug）至少走完「方案 → 你批准 → 实现 → request_changes → 下一轮方案 → approve」；审核会话确认只读；服务器没有任何写操作；凭据不出现在 prompt/产物；`approved` 后能带 run 进入复盘窗口。

## Out of Scope

- Claude Code CLI、herdr、主会话 + 子代理调度器。
- 工作台深应用 React 视图（本规格选桥插件）。
- 自动合入、自动重启服务、任何生产写操作。
- 复盘窗口本身（[独立规格](../window4-retro/spec.md)；窗口3 只负责 `approved` 后带 run 进入）。
- 窗口3 内嵌完整原生聊天/输入框；从窗口3 发送消息或审批（只做只读镜像，交互回 DSH）。
- 外部知识库写入（复盘规格，遵循 speckit `/speckit.retro` 的显式写库约定）。
- 固定超时/模型/并发/重试/轮次默认值。
- 多用户、权限系统、计费、移动端。
- 多缺陷并行修复同一仓库（v1 串行；单 run 的实现已用独立 worktree 隔离）。

## Further Notes

### 当前实施状态（2026-10-28）

- 集成分支 `integration/window3-dispatch`，最新 commit `bc173b0`；页面、桥、窗口1/2、IM06 审查修复均已合入。
- 桥已安装到 web profile（`bug-solver-dispatch`）；p3 清单已写（`window3-dispatch.html`），窗口3 页面已加载。**安装版插件仍是重启前进程，`dirtyCheck:false`、worktree/容器 prompt 需要重启 `dsh web` 后才生效。**
- 测试：bridge 147/147、窗口3 页 38/38、窗口1/2 页 81/81（旧项目断言 SKIP）。
- 真实 run 尚未完成验收；IM05 仍是 open。窗口4 复盘规格已写，未实现。
- 已知 422：确认页必须填**仓库根**（如 `E:\work\projects\visitor-management`），不能填嵌套模块 `...\visitor-management\visitor-management`；脏仓库在 `dirtyCheck:false` 下允许，实现会在 `.bug-solver/worktrees/<runId>` 新建 worktree。

- 本规格来自 [窗口3 调度台决策地图](map.md)、[01 启动桥接调研](research/01-session-start-bridge.md) 与 [05 双会话交接调研](research/05-two-session-handoff.md)；01 的安装/路由/回滚约束已并入，07 的只读 sandbox 实际约束并入 IM05 验收。若桥插件不可安装，回退到「页面生成任务包 + 用户点窗格自带发送」的降级路径（不属于本规格承诺）。
- 复盘窗口另立规格：[窗口4 复盘与知识回流](../window4-retro/spec.md)，方法复用 speckit `spec-retro` / `/speckit.retro` 的经验分类、证据规则与知识归属（`reports/retro.md`、`docs/domain/`、显式外部知识库）；窗口3 不写这些文件。
- 审核 ↔ 修复循环是自动的，但每轮**方案批准**和 `needs_attention` 都是硬闸门：桥不替用户回答、不自动批准方案、不跳过确认；用户回答后从当前轮继续，不重头开始。
- 对话镜像只解决“在任务上下文里看”，不解决“在窗口3 里聊”：回复、审批、Stop 永远回 DSH 原生会话；不要把镜像当成第二真相。
- UI 方向定为 B 时间线；原型与截图见项目根目录 `prototype-window3-ui.html`、`preview/proto-window3-*.png`（throwaway，只用于方向选择）。
- 方案阶段与实现阶段共用同一个修复会话；方案是 `round-N/plan.md`，实现是同一轮的 diagnosis/result/diff；复盘窗口可以对比“计划 vs 实际”。
- 桥插件是独立本地插件，不改 worktable；但 worktable 升级不会覆盖它，profile 升级时要重新确认加载项。
- 会话管理用 DSH 原生能力；不要另造会话状态文件当唯一真相，run 表只做索引，完成判定以 Host 日志为准。
- 窗口3 的 UI 用 dshell 原生皮肤；不重复造终端/浏览器/资源管理器窗。
