# IM01 桥核心

Status: resolved
Depends on: —

## Scope

在项目内新建 `bridge/` 单文件 Host 插件包（ESM，无构建）：

- `package.json`（`dsh.bundle.patch`）、`cordis.patch.yml`、`lib/index.js`。
- `DispatchService`：run 表 + 状态机（draft → confirmed → fix_planning → awaiting_plan_approval → fix_implementing → fix_done → review_running → review_done / needs_attention / stopped / approved），审核结论驱动下一轮方案；无进展暂停。
- `RunStore`：版本化 JSON、原子写、项目数据目录；不碰 target repo 的 data。
- `SessionGateway` / `Clock` / `Redactor` 注入接口；本票只做 fake 实现和测试，不接真实 DSH。
- HTTP 契约（thin adapter，可先只做 handler 函数）：`start`、`runs`、`run`、`approve-plan`、`plan-feedback`、`stop`、`approve`、`messages`；`allowedRoots` 校验；只读 messages。
- 测试：`node --test`，覆盖状态机、幂等、方案闸门、Stop/unknown、无进展、脱敏、分页。

## Acceptance

- `cd bridge && npm test`（或 `node --test`）全绿。
- 无运行时依赖；不安装、不重启。
- 提交到 `im01-bridge-core`，merge `integration/window3-dispatch` 后报告 commit。

## Result

已合入 integration（merge `0d1aece`；工作 commit `60eeba9`）；`bridge/` 10 个 lib 模块 + 9 个测试文件；`node --test --test-isolation=none` 88/88 passed。路由：start/runs/run/approve-plan/plan-feedback/stop/approve/messages；`run` 与 `messages` 同时接受 `?id=` 和 `?runId=`（对齐 IM02 页面）。未安装、未重启。

**运行时更正（2026-10-27）**：`connection.fetch` 只适用于客户端 RPC，普通 iframe fetch 会 400；真实路由已改为 `ctx.webServer.register` exact + `connection.admit`（见 `bridge/lib/node-http.js`）。
