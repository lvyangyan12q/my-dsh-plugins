---
id: window3-dispatch
title: 窗口3 调度台（bug-solver）
labels: [wayfinder:map]
status: complete
created: 2026-10-27
---

# 窗口3 调度台（bug-solver）

## Destination

窗口3 成为 bug-solver 的调度台：从窗口1 点「处理」出发，确认并补齐缺陷信息与窗口2 的 SSH/代码库配置，按确定性顺序启动**两个 DSH 原生会话**——「分析修复」和「审核」——在窗口3 展示阶段、状态与产物，最后由用户决定合入。

这张地图走完 = 一份能直接开工的设计规格（数据契约、会话编排、安全边界、验收）；实现不在本图内。

**实现规格已发布**：[spec.md](spec.md)（`ready-for-agent`）。后续开工以该规格为准。
**复盘窗口规格**：[window4-retro/spec.md](../window4-retro/spec.md)（窗口3 `approved` 后进入，合入前）。
**施工图**：[implementation/README.md](implementation/README.md)（IM01–IM05）。

**规划已完成**（2026-10-27）：决策已收敛到规格；施工与验收见规格，09 保留为施工验收任务，不代表实现完成。

## Notes

- 运行时用 **DSH 原生会话**，不用 Claude CLI / herdr。
- **两个 agent，不设调度 agent**：分析修复会话 + 审核会话；顺序由窗口3（确定性状态机）编排。
- **不预设运行默认值**：超时、模型、并发、重试策略都不锁死，按实际需要配置或留空。
- 窗口3 是 HTML iframe（工作台自定义窗）；它没有公开的建会话 API，桥接方式见 01。
- 项目产出都在 `F:\ai-project\my-dsh-plugins\plugins\bug-solver`；地图与工单在 `docs/wayfinder/window3-dispatch`。
- 相关技能：`ssh-connect`（只读 SSH）、`grilling`、`prototype`、`domain-modeling`。
- 已核实事实：
  - DSH 的会话创建在客户端服务（`ctx.sessions`）与 host `ctx.sessionController`；纯页面没有公开接口。
  - 工作台 deep app 的 roles/tasks 能建原生会话；小桥插件也能（工作台自己就是这么建）。
  - 窗口 iframe 同源、无 sandbox；`/api/worktable/term` 的 PTY 随页面关闭被杀。
  - 窗口2 `links` 为空、bug 的 `repo` 为空、且没有本地仓库路径；bug 描述含明文密码。

## Decisions so far

- **DSH 原生会话**（2026-10-27）：不用 Claude CLI / herdr，审批、追问、Stop 用 DSH 原生能力。
- **两个 agent，不设调度**（2026-10-27）：分析修复 + 审核；窗口3 按固定顺序编排。
- **不设固定运行默认值**（2026-10-27）：不做 20 分钟上限、模型锁定、并发/重试硬策略。
- [05 双会话交接](issues/05-two-session-handoff.md)：完成信号用 Host 的 `turn/end` + `completed`；Client 无完成语义；审核会话同 workspace 新 id + `rename`；prompt 会排队、顺序由桥保证；Stop 保留 inbox，重试优先新会话。
- **规格已发布**（2026-10-27）：桥插件 + 两个 DSH 会话 + 无调度 + 无固定运行默认值，详见 [spec.md](spec.md)。
- [01 启动桥接](issues/01-session-start-bridge.md)：单文件 Host 插件 + **`webServer` exact 路由 + `connection.admit`**（原 `connection.fetch` 在普通 iframe 下 400，已更正）+ `sessionController`/`workspaceRegistry`；需 `allowedRoots`；无删除 API，prompt 失败记 `delivered-unknown`；安装后重启 web。
- **每轮方案确认**（2026-10-27）：修复会话每轮先写 `round-N/plan.md`，窗口3 批准后才动代码；退回则改方案。
- **只读对话镜像**（2026-10-27）：窗口3 增加“任务 / 对话”页签，只读展示修复/审核会话；回复/审批/Stop 仍回 DSH。
- **UI 方向 B 时间线**（2026-10-27）：以轮次为主线；原型 `prototype-window3-ui.html`，A/C 仅留档。
- [02 窗口1 派发](issues/02-window1-dispatch.md)：处理=直接派发；草稿 + BroadcastChannel + 队列；按 bugId 幂等。
- [03 窗口2 数据](issues/03-window2-repo-data.md)：~~`project.localPath` + `serviceMap`~~ → 2026-10-28 被 IM07 取代：窗口2 只保留 SSH 连接。
- [04 确认页](issues/04-confirm-page.md)：带出 bug/SSH + **窗口3 直接填代码仓库/基线分支/spec**；先方案后代码（写回窗口2 已移除）。
- [06 修复落点与审核](issues/06-fix-landing-review.md)：新分支 + commit；审核只读；每轮先 plan；用户合入。
- [07 安全边界](issues/07-safety-boundaries.md)：只读 SSH 白名单、脱敏、`allowedRoots`、read-only 审核、不自动合入。
- [08 运行看板](issues/08-run-dashboard.md)：B 时间线 + `任务 / 对话（只读）`；原型与截图已出。
- [10 提示词契约](issues/10-session-prompt-contract.md)：plan/implement 两阶段、固定 JSON verdict、`specRef`、确定性 requestId。
- **复盘窗口独立**（2026-10-27）：p4 与窗口2 并列；语料集中在 bug-solver；外部知识库按目标仓库 `.claude/settings.local.json` 解析；规格见 [window4-retro/spec.md](../window4-retro/spec.md)。
- **仓库/分支统一到窗口3**（2026-10-28）：窗口2 只保留 SSH 连接；代码仓库路径、基线分支、spec 在窗口3 派发确认页填写；桥不再按 `projectId` 校验，`allowedRoots` 只来自插件配置。

## Not yet specified

无。规划已完成；施工与验收见规格与 09。

## Out of scope

- 实现代码（本图只到规格；施工另起）。
- Claude Code CLI、herdr、主会话 + 子代理调度器。
- 自动合入、自动重启服务、任何生产写操作。
- 深应用 React 视图（若 01 选桥插件）。
- 同一仓库并行修复（worktree）与多缺陷并发展示细节（当前规格同仓库串行）。
- 窗口3 内嵌完整聊天/输入，或从窗口3 发送消息/审批。
- 多用户 / 权限系统、计费。

## Tickets

见 `issues/`：01 启动桥接、02 窗口1 派发、03 窗口2 数据、04 确认页、05 双会话交接、06 修复落点与审核、07 安全边界、08 运行看板、09 挂载验收、10 提示词契约。
