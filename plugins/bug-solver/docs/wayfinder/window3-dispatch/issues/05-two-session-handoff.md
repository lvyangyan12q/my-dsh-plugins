# 05 双会话交接：修复完成 → 启动审核

Type: research
Status: resolved
Blocked by: 01

## Question

分析修复会话完成后，窗口3 怎么知道，以及怎么把 diff 交给审核会话？

- 完成信号：会话 idle / completed、会话状态投影、Host 事件、agent 自己写 status 文件、还是 agent 调桥接口回报？
- 审核会话：在同一个仓库、带哪些上下文（run id、分支、diff、诊断结论）启动？
- Stop / 重试 / 会话中断时窗口3 怎么恢复？重复启动怎么幂等？
- 两个会话与 run 记录怎么一一对应（run id、session id、标题）？

给出推荐机制、API 依据和失败路径。

## Answer

调研报告：[research/05-two-session-handoff.md](../research/05-two-session-handoff.md)（2026-10-27）。

- **完成信号在 Host 侧**：订阅 `ctx.on('session/event')`，先等 `user/message.source.rpcId === requestId`，再等该 turn 的 `turn/end`；`reason.kind === 'completed'` 成功、`aborted` 是 Stop、`error` 失败、`interrupted` 是宿主崩溃/未知。事件后再做一次权威核对（`sessionPersistence.flush()` → `sessionQuery.observeSession`）。不要拿 agent 自写状态文件或 DOM 轮询当状态机依据。
- **Client 侧没有「跑完」语义**：只有 `running` 布尔 + 投影；窗口3 的状态必须由桥插件提供。
- **审核会话**：同 workspace/cwd、新 `sessionId`、`create` 之后 `rename` 设标题；prompt 用 `mode:'queue'`，**不会因忙拒绝**，顺序必须由桥的状态机保证。两个会话同 cwd 时注意 git 工作区污染，审核建议只读。
- **幂等**：run 表（runId ↔ sessionId）、预生成 sessionId + `sessionPersistence.stat`、确定性 requestId；`create` 若目标 session 已开过 turn 会返回**另一个 id**，必须核对；`unknown` 一律不自动重发。
- **Stop**：`cancel` 带 `keepInbox:true`，旧队列会保留；可靠做法是 Stop 后开新 run/新会话，不复用。
- **现成 HTTP**：`POST /api/session/list|projections|page` 可作页面兜底轮询，但没有会话状态聚合端点；给窗口3 用仍应自建桥路由。
- **未验证**：iframe 内 fetch `/api/session/*` 是否放行、桥插件的 Host 服务组合、只读 preset。
