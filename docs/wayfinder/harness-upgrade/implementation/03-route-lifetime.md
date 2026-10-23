---
id: harness-rc3-route-lifetime
title: 工作台 Host 路由和终端的插件生命周期
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: null
blocked_by: []
implementation_status: implemented
acceptance_status: pending-installed-native
target: 0.2.1-rc.3
---

## 范围

实现 [HU04](../../worktable-platform/framework-spec.md#host-upgrade-requirements) 中可独立处理的 Host 注册生命周期切片。原生基线为 `22ddee3792402c3e70ec5f86a63c3e3e895a2f60`，插件实施基线为 `a81ac773fd2599744085ffd098cc32d3f4418e2c`。不改变宿主源码、安装版本、正式 profile 或业务数据，不代表整个 HU04 完成。

公开验证接缝：插件导出的 `apply`、Cordis `effect` 的注册/释放合同、WebServer 的 HTTP/Upgrade 注册与 disposer、终端连接与 PTY 的外部资源合同。沿用规格既定生命周期与错误恢复测试边界。注入应用服务不可用的测试环境不打开实例存储或原生 Session。

## 实现及证据

- [x] 九条旧 HTTP 路由通过 `ctx.effect` 持有注册回执；不修改共享 WebServer，不改变既有认证策略。
- [x] 保留框架路由和终端 Upgrade 已有的生命周期归属；插件停止时关闭自己接入的 WebSocket，释放自己的 PTY 监听器及进程，并关闭自己的 WebSocketServer。其他路由不受影响。
- [x] 新增 `plugins/worktable/04_test/host-route-lifetime.test.mjs`，从入口编译并执行实际插件 `apply`。WebServer 边界对重复注册报错；终端外部依赖为临时夹具，不启动真实 shell。
- [x] Red：原实现卸载后遗留九条 HTTP 路由。HTTP 修复后继续红在已准入终端仍存活。补齐终端释放后 Green。
- [x] 2026-10-24：`node --test plugins/worktable/04_test/host-route-lifetime.test.mjs plugins/worktable/04_test/application-http.test.mjs plugins/worktable/04_test/role-lifecycle.test.mjs` 共 4 项通过，包括认证拒绝、其他路由保留、路由卸载重注册、终端及监听器释放。现有持久化夹具在 sandbox 下受文件锁/rename 限制，使用获准的隔离临时目录实际文件操作后通过。

## 仍须验收

- [ ] 对本次最终发布包在独立 rc.3 实例执行真实热卸载/重装与重启，确认无重复路由、旧 handler 或 socket 泄漏。
- [ ] 真实 node-pty/WebSocket 终端在停止插件时退出；其他插件及用户原生会话保持可用。
- [ ] 原有实例数据、原生任务控制和能力释放的整体验收由 HU04/HU07 对应集成工单记录；本切片回归不能替代真实安装或模型闭环。

不修改冻结版本号或发布资产。当前状态保留 `in-progress`，待集成最终产物验收补证后关闭。
