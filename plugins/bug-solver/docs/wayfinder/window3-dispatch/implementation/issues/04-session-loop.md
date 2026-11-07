# IM04 会话循环

Status: resolved
Depends on: IM01

## Scope

在 IM01 的骨架上接真实 Host 服务：

- `SessionGateway`：`workspaceRegistry.create(realpath)`、`sessionController.create({workspaceId})`、`rename`、`setSandboxMode`、`prompt`、`cancel`、`sessionPersistence.flush`、`sessionQuery`/日志重放。
- plan / implement / review 三段 prompt 契约；每轮确定性 requestId；审核 JSON verdict 解析；`needs_attention`（blocked）；无进展暂停；Stop/unknown。
- `messages` 只读：按 role/cursor 分页，桥侧脱敏；工具调用分类。
- 审核会话 read-only；修复会话 workspace-write；`allowedRoots`。
- 测试：fake Host 适配覆盖创建/重命名/prompt/事件/分页/脱敏；不安装。

## Acceptance

- 测试全绿；无安装/重启；不改 IM01 对外契约。
- 提交到 `im04-session-loop`，merge 集成分支后报告。

## Result

已合入 integration（merge `5231f89`；工作 commit `c615ca5`）。新增 `host.js` 真实 SessionGateway、`session-log.js`、fake Host 与 19 个测试；bridge 106/106。未安装、未重启、未跑真实会话；待 IM05 验证真实 ctx 的 session.id/sessions.get、sandbox 生效、rename、allowedRoots/dataDir、artifacts manifest。
