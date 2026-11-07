# 05 调研：双会话交接（修复完成 → 启动审核）

**范围**：只读调研。依据为 DSH checkout `F:\ai-project\deepseek-harness`（源码）与已安装
`C:\Users\Administrator\.dsh\profiles\web\node_modules\dsh-worktable\lib\index.js`（工作台原生适配，下文简称 WT）。
未在 window3 iframe / bug-solver 桥插件内实跑，凡此类结论均标「未验证」。

## 结论

1. **不需要轮询 DOM，也不需要 agent 自己回报。** 完成信号取「`turn/end` 事件 + `reason.kind === 'completed'`」，
   数据源是 Host 侧的会话日志（`ctx.on('session/event')` 实时 + `sessionQuery.observeSession` / `sessionPersistence.open('read')` 兜底对账）。
   WT 就是这么做的：`nativeResult()` 从日志里按 `user/message.source.rpcId` 定位请求，再找同名 turn 的 `turn/end`，要求 `reason.kind === 'completed'`（WT 3266–3284）。
2. **Do not invent a status file.** agent 自写 status 文件只能作为「人可读产物」，不能作为状态机依据（可能漏写、可能写了但 turn 失败）。
   桥接口回报同理：多一条鉴权面，且 agent 可能在调用前上下文用尽。
3. **审核会话 = 同 workspace/cwd、新 `sessionId`、新 prompt、`rename()` 设标题。** DSH 没有 workspace 级互斥锁，锁只在 session 粒度（`SessionAlreadyOwnedError`，session-persistence-jsonl `src/lease.ts:68–115`）。
4. **幂等靠三件套**：run 表（runId↔sessionId）、预生成 `sessionId` + 先 `stat` 判存在、prompt 的 `requestId` 去重（`commands.ts:307`、`568–580`）。
   注意 `create` 的暗坑：若目标 session 已经开始过 turn，Host 会**另建一个新 id 返回**（`agent.ts:372–375`），必须核对返回 id（WT 3783）。
5. **有现成 HTTP 远程 API**：泛化的 `POST /api/<namespace>/<method>`（如 `/api/session/list`、`/api/session/projections`），
   但**没有**专门的「会话状态」聚合端点；流式（follow/control）只能走 `/api/remote.mux` WebSocket。

## 状态与完成信号

### Host 侧读法

| 事实 | 服务/方法 | 事件/键 | 依据 |
|---|---|---|---|
| 是否在跑 | `ctx.agents.get(id)?.status` → `'idle' \| 'running'` | `agent/status` `{agent,status}` | core/agent `src/runtime-types.ts:129–136, 200–201, 309`；`src/index.ts:591` |
| 是否有活跃 Agent | `agentAvailable`（无 Agent 也能读日志） | `api-session/added/removed` | session-controller `src/index.ts:212–224` |
| 单轮结束原因 | 日志末条 `turn/end` | `reason.kind`: `completed` / `aborted`(内含 `{kind:'user'}`) / `error` / `max-tokens` / `interrupted` / `blocked` / `forked` | core/session `src/types.ts:200–238` |
| 出错 | `agent/error` → `api-session/error`；或 `turn/end.reason.kind==='error'` | `{agent,turn,step,error}` | runtime-types.ts:429；session-controller index.ts:228–230 |
| 被 Stop | `turn/end` `reason:{kind:'aborted',reason:{kind:'user'}}` | — | core/session types.ts:208–209；`commands.ts:502` |
| 等待用户回答 | `userQuestions` 投影里未 settle 的 timed question | 投影 `userQuestions` | interaction/user-questions `src/projection.ts:311–331` |
| 等待审批 | 日志中 `approval/asked` 后无 `approval/decided` | — | interaction/user-approval `src/types.ts:44,55`（注意 `approvalState` 只含 `policy`+`turnOpen`，**不表示 pending**，index.ts:89–109） |
| 排队中 | `inbox` 投影 `next-turn`/`next-step` 非空 | `inbox` | core/agent-loop `src/inbox.ts:26–64` |
| turn 边界水位 | `turnBoundary`（`openTurnStartSeq`/`lastTurn`） | `turnBoundary` | core/agent `src/projection.ts:21–59`；`ctx.agents.turnBoundaryOf(session)` index.ts:306 |
| 整份快照/日志 | `ctx.sessionQuery.observeSession(id,{projectionMode})` → `{source,header,events,cursor,projections}` | — | session-query `src/observation.ts:17–41`；`src/index.ts:140–145` |
| 冷读（不激活 Agent） | `sessionPersistence.stat(id)` / `open(id,'read').read()` | — | WT 3722–3737、3421–3428 |
| 投影基线与增量 | `ctx.sessionProjections.snapshot(session)` / `.onChanged(cb)` | 任意 key | session-controller `src/control.ts:22–30, 62–75` |

`sessionController` 自身把上述合成 Client 可收事件（`api-session/added|removed|status|error|activity`），
见 `session-controller/src/index.ts:212–234`。根 Context 的监听器能收到会话域事件（`session/event` 声明为 `Scoped<Session>` 但根监听照收，
core/session `tests/scoped.spec.ts:36`；`sessionController` 自己就在根上监听，index.ts:225）。

### Client 侧读法

- `ctx.sessions.list`（`ObservableSnapshot<SessionListState>`）：`{ids, byId, phase, projectionsBySession}`，
  行含 `running / agentAvailable / blank / updatedAt / formatStatus`（client `sessions/service.ts:61–70`；`src/types.ts:148–162`）。
- `ctx.sessions.retain(id)` → `binding.session.getSnapshot()`：`running`、`lastAgentError`、`openState`、`blank`、`awaitingFirstTurn`
  （client `contract/snapshot.ts:68–91`）。
- 投影：`session.projections.get(key)` / `faceOf(key)`，push 模型、Host 唯一计算点（client `sessions/projection-store.ts:106–118`）。
- 事件：`ctx.remote.$on('api-session/status' | 'api-session/error' | 'api-session/activity' | …, cb)`（client `src/index.ts:112–131`），
  另加 control 流的 `projection` 帧（`control.ts:22–30`，客户端 `handleControlFrame`）。

**结论**：Client 侧没有独立的「跑完了」语义，只有 `running` 布尔 + 投影值；**完成判定必须在 Host 侧做**（读 `turn/end`）。

## 推荐完成信号（桥插件）

按可靠性排序：**durable 日志读取 > Host 事件订阅 > `agent.whenIdle()` > agent 写状态文件 > agent 回调桥接口**。

推荐实现（事件驱动 + 一次权威核对，全程无轮询）：

1. 发 prompt 前生成 `requestId`，存 run 表。
2. 订阅 `ctx.on('session/event', (session, event) => …)`，只处理目标 `session.id`；
   先等 `user/message` 且 `event.data.source.rpcId === requestId`（确认被准入），再等该 turn 的 `turn/end`。
3. `turn/end` 到达后**不直接信任事件**，做一次权威读取：`await ctx.sessionPersistence.flush()` →
   `ctx.sessionQuery.observeSession(id)`（或 WT 的 `open(id,'read').read()`），重放同样的定位逻辑。
   `turn/end` 文档明确「读存储的消费方应在 `whenIdle()` 之后自行 flush」（core/session `src/types.ts:294–303`）。
4. 结果：`reason.kind === 'completed'` → 成功；`aborted` → 用户 Stop；`error` → 失败并取 `reason.error`；
   `interrupted` → 宿主崩溃后补写的 closer（types.ts:221–227），按「未知/需人工」处理。

`agent.whenIdle()`（`runtime-types.ts:214–220`）适合做「等到彻底静默」的辅助条件，但它**不告诉你哪一轮、什么原因**，
不能单独当完成信号。

## 读取最后一条 assistant 消息 / 产物路径

- 纯文本：`events.findLast(e => e.type === 'assistant/message')`，内容在 `data.message.content` 的 `text` 块
  （core/session types.ts:340–357）；已有现成提取器 `extractSessionEventText(event)`（session-query `src/extraction.ts:15–44`，会跳过 reasoning/tool-call）。
- 结构化产物：**推荐让修复会话写 manifest 文件**（如 `<repo>/.bug-solver/runs/<runId>/result.json`：branch、commit、diffPath、自测结论、risk），
  桥侧按 WT `output()/boundedFile()` 的方式校验：`realpath` 限定在批准根内、大小上限、前后 stat 一致、sha256（WT 3286–3317）。
  这样审核会话的输入是**可校验的文件**，assistant 文本只作人读摘要。
- 传输给审核会话：把「runId、分支名、`git diff <base>...<branch>`、诊断结论、manifest 路径、artifact 目录」写进 prompt 文本；
  不要粘贴整份 diff（大仓库会炸上下文），给路径让审核会话自己读。

## 启动审核会话

```text
sessionController.create({ workspaceId | cwd, sessionId?(预生成), agentPreset? }) → { sessionId, agentPreset? }
sessionController.rename({ sessionId, title })                    // create 不接受 title
sessionController.prompt({ sessionId, requestId, mode:'queue', content:[{type:'text',text}] })
```
依据：`session-controller/src/types.ts:259–276`（create 无 title 字段）、`commands.ts:104–143`、`186–199`（rename 需 `sessionTitle` 服务）、
`451–476` + `314–323`（prompt 形状）。

- **同一 workspace**：`create({workspaceId})` 或 `{cwd}`（二者互斥，`commands.ts:105–107`）。workspace 允许多会话并存
  （workspace `tests/workspace.spec.ts:665–680` 连续 attach s1/s2/s3）。
- **不会被会话锁挡住**：写锁是 session 级文件租约；`claim()` 只在**同名 session 且 cwd 不同**时抛 `session/conflict`
  （`agent.ts:349–352`、`commands.ts:520–525`）。两个不同 id 的会话同 cwd 不冲突。
- **并发语义**：`prompt` 从不因「忙」拒绝——`mode:'queue'` 走 `agent.followup()`，`'steer'` 走 `agent.steer()`
  （`commands.ts:339–340`）。所以「修复还没结束就发审核 prompt」不会报错，只会排队 —— **顺序正确性必须由桥的状态机保证**，
  不能指望 Host 拒绝。
- 真正的并发风险在 **git 工作区共享**：两个会话同 cwd 时，审核会话若被允许写文件会与修复分支互相污染（对应工单 06/07）。
  建议审核会话用只读权限/preset，或等修复会话 `idle` 且工作区干净后再启。

## 失败与幂等

- **Stop**：`sessionController.cancel({sessionId})` → `agent.cancel({kind:'user'}, {keepInbox:true})`（`commands.ts:490–504`）。
  `keepInbox` 意味着**队列里的旧 prompt 会被保留**，重试前必须先清空（`updateQueue` 的 `remove`，`commands.ts:408–484`），
  否则重试 prompt 会排在旧 prompt 之后又跑一遍。清空队列要列出 `itemId`——完整列举方式**未验证**；
  可靠做法是「Stop 后不复用该会话，直接开新 run/新会话」。
- **重试**：新 `requestId`（否则被去重成 no-op，`commands.ts:568–580`）、同 sessionId（已 idle）或新 sessionId。
- **幂等（runId ↔ sessionId）**：
  1. 桥自己的 run 表持久化 `{runId, fixSessionId, reviewSessionId, requestIds[]}`，启动状态机先读表再动作。
  2. `create` 前 `sessionPersistence.stat(sessionId)` 判存在（WT 3776）；返回 id ≠ 请求 id → 判 `native-identity` 异常，不自动重试（WT 3783）。
  3. prompt 用确定性 id（如 `${runId}:fix`），重复提交被 Host 折叠为 `{accepted:true}`，天然幂等（`commands.ts:307`）。
  4. WT 的准入三态 `submitting → accepted | unknown | failed`（WT 2895–2915）值得照抄：`unknown` 一律「不自动重发」。
- **会话中断/宿主重启**：未闭合 turn 在恢复时补 `interrupted` closer（types.ts:221–227）；内存里没有 Agent 时列表行 `agentAvailable:false`，
  桥必须靠读日志对账，不能依赖事件（重启期间的事件已丢）。
- **窗口3 恢复**：一律以「日志重放」为准，把 UI 状态算成纯函数（run 表 + 最后 turn/end + manifest 是否存在），
  事件只做触发刷新用。

## 现成的 HTTP / 远程 API

- 泛化 RPC 通道已存在：`POST /api/<namespace>/<method>`，body 为
  `{"type":"client-request","rpcId":"…","method":"session/list","payload":{}}`
  （client/connection `src/rpc-host.ts:304–349`；信封 `src/rpc-schema.ts:35–40`；endpoint 拼接 `src/rpc-host.ts:361–370`、gateway `src/index.ts:1525`；
  鉴权走 `connection.admit` 的浏览器 cookie，`src/index.ts:146–160`）。
- 可直接用的：`/api/session/list`（含 `running/blank/agentAvailable`，冷读时带 `projections` 提示）、`/api/session/projections`（`{sessionId}`）、
  `/api/session/page`、`/api/session/search`。
- 流式（`follow`、`control`）不能走 unary HTTP（gateway `src/index.ts:423` 明确拒绝），必须连 WebSocket `/api/remote.mux`
  （`src/stream-protocol.ts:7`）。
- **没有**现成的「会话状态」聚合端点；要一个给窗口3 用的稳定接口，仍应自建路由
  （`ctx.webServer.register`，可参 WT `/api/worktable/generations`，WT 3443–3457）。
- 页面轮询 `POST /api/session/list`（1–2s）是可接受的**兜底**，但比桥插件订阅事件差：多一次序列化、丢事件、且拿不到 `turn/end` 原因。

## 未验证项

- 在 window3 iframe 内 `fetch('/api/session/list')` 是否被当前部署的 cookie/同源策略放行（机制层面 owner 判定成立，未实测）。
- bug-solver 桥插件若为 Host 插件，`ctx.inject([... 'sessionController','sessionPersistence','sessionQuery'])` 是否与 WT 完全等价可用
  （WT 已证明可行，但它的 `worktableAdmission` gate 是自己的工作台闸门，bug-solver 没有）。
- `updateQueue` 清空 inbox 时如何可靠枚举 `itemId`（台账未确认；建议改用新会话规避）。
- 审核会话能否用 preset/权限把写入关掉（`permissionPresets`/`sandboxPolicy` 投影存在，但「只读 preset」是否已内置未验证，见 07 工单）。
- 桥作为 **client 插件** 时 `ctx.sessions` 的可用性（client 侧 `ISessions` 存在，未在 bug-solver 里试过）。
