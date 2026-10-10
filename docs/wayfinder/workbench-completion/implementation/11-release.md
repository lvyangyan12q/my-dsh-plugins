---
id: workbench-completion-release
title: 兼容、升级与回滚验收
parent: workbench-completion-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [workbench-completion-runtime, workbench-completion-generation, workbench-completion-reading, workbench-completion-kaogong]
---

# 11: 兼容、升级与回滚验收

**What to build:** 维护者用发布包在不同依赖环境和升级/回滚流程实际使用完整平台，原数据、资料和会话保持。

**Blocked by:** 1 · 平台入口与窗口恢复；7 · AI 创建应用闭环；9 · 阅读统计通用应用闭环；10 · 考公学习完整闭环。

**Status:** ready-for-agent


**范围关系：** 补充规格 User Stories 30、32；继承全部相关原规格要求。已有实现先复核并复用，旧工单和历史验收不被覆盖。

## Acceptance criteria

- [ ] 完整用户流程分别通过无可选侧栏、兼容侧栏和停用适配器环境；未知/缺失依赖可操作恢复。
- [ ] 实际旧版本到当前归档升级、回滚、冷恢复、卸载重装保留数据、会话、能力归属和资料引用。
- [ ] 干净构建、全量回归、官方离线安装、字节、公开类型和原生客户端模块解析通过，不设置兼容豁免。
- [ ] 复核全部原规格及补充要求的逐项证据；部分、缺失、明确失败和条件阻塞不改写为完成。
- [ ] 正式数据与旧路径保持；桌面/窄屏、样式、焦点和物理输入法证据齐全，不能仅凭日志绿灯。

## Evidence and closure

仅在每项标准有与其范围匹配的实际证据后关闭；研究、夹具、原型、源码断言和推送不代替使用验收。修复按已确认公共接缝 TDD，遵循实际安装浏览器/Host 流程。缺证据或外部条件阻塞如实记录，不勾选。
