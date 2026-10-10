---
id: workbench-completion-runtime
title: 平台入口与窗口恢复
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: codex-completion-runtime
blocked_by: []
---

# 01: 平台入口与窗口恢复

**What to build:** 用户在原生菜单及兼容侧栏使用同一应用窗口，关闭、切换、刷新、重启和停用后能继续操作且无失效内容。

**Blocked by:** None (can start immediately)。

**Status:** claimed

**执行条件：** 先核实已认领侧栏公共接缝研究，实际清理通过前不能关闭。

**范围关系：** 补充规格 User Stories 1、2、3、4、5、15、31；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 原生工作区、会话导航、菜单和未发送草稿保留；同一应用实例重复打开只聚焦现有窗口。
- [ ] 最大化、最小化、恢复、关闭重开、页签和布局恢复在实际安装浏览器通过；桌面与窄屏无遮挡且焦点合理。
- [ ] 从全局插件管理停用 Better Sidebar 后，自有原生工作台标签实际消失；热更新、重新启用无重复注册，其他标签和会话保留。
- [ ] 无可选插件、未知或不兼容依赖均保留主入口并显示明确原因；只用受支持公共接口。
- [ ] 浏览器刷新和 Host 冷启动后数据、应用状态及会话身份保持；不能把关闭当作停止 Agent。
- [ ] 针对实际缺陷给出失败再通过的外部回归；真实执行期间窗口恢复在原生执行工单继续验收。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。

## 2026-10-10 partial installed checkpoint

Official archive at `2d06641c802475b807130f5f100e0b6ebbfbb7c3` passed the adopted-session unload browser RED→GREEN: native Workbench tab 1→0, unrelated File tab and native session tree preserved. Re-enable and browser reload each restore exactly one catalog; isolated configuration restored byte-for-byte. Evidence: [browser receipt](../../../evidence/2026-10-10/completion-sidebar-retirement-browser.json). Full ticket remains open for the remaining window, compatibility, dormant-session and executing-Agent scope.
