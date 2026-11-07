# 01 启动桥接：窗口3 如何启动 DSH 会话

Type: research
Status: resolved
Blocked by: —

## Question

窗口3 的「派发」要在目标本地仓库里启动一个 DSH 原生会话。对比并推荐一条路：

- **A. 小桥插件**：一个很小的 Host 插件，暴露 `POST /api/bug-dispatch/start`，内部用 `ctx.sessionController.create` + `prompt` 建会话；按请求里的仓库路径取/建 workspace；鉴权复用 `connection.admit`；返回 sessionId。
- **B. 工作台深应用 roles/tasks**：官方角色/任务模型，但要 React 视图 + 固定 cwd。
- **C. 零插件**：窗口3 只生成任务包，用户回窗格自带的「发送并新建对话」点一下。

需要核实：A 的安装/启用方式（profile、`cordis.patch.yml`、本地包）、会话是否出现在 GUI 会话列表、能否自动打开（`uiWorkspace` 是客户端服务）、agent preset / permission preset 怎么取、失败回滚、最小实现清单与风险。

## Answer

调研报告：[research/01-session-start-bridge.md](../research/01-session-start-bridge.md)（2026-10-27）。

- **最小可行 = 单文件 Host 插件**（ESM JS，无构建）：`ctx.connection.fetch.register` 暴露 `POST /api/bug-solver/dispatch`；`workspaceRegistry.create(realpath(absPath))` → `sessionController.create({workspaceId})` → `rename` / `setSandboxMode` → `prompt`。约 100–150 行。
- **不用** `webServer.register` + 手工 `connection.admit`：`/api` 共享通道已做 Cookie/Origin/owner 校验；桥内只做业务校验（绝对路径、allowedRoots、prompt 大小）。
- 目录必须已存在；`workspace.create` 按 canonical path 幂等；`create` 的 `workspaceId`/`cwd` 互斥，不要手工 attach。
- **无删除会话 API**：create 成功后 prompt 失败只能记 `delivered-unknown` + cancel/archive，不自动重发；create 抛错记 creation-unknown。
- GUI 列表/侧栏实时更新；Host 不能自动切会话；窗口3 可试 `window.top.__dshOpenSession(id)`（未验证）。
- 安装：`dsh plugin --profile web add file:<目录|tgz>`，bundles 自动追加，重启 `dsh web` 最稳；`engines.dsh` 要对齐。
- 不推荐 worktable roles/tasks（tasks 仅 deep app）；零插件直连 `/api/session/create` 是内部未文档化通道，只用于验证，不作为长期契约。
- 建议加 `allowedRoots` 配置，realpath 后前缀校验，拒绝任意目录。
