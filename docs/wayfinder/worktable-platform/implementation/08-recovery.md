---
id: worktable-framework-08
title: 持久化、并发与冷恢复
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: recovery
blocked_by: [worktable-framework-05, worktable-framework-07]
---

# 08: 持久化、并发与冷恢复

**What to build:** 真实应用项目、未归属实例、显式关联、授权、数据状态和角色引用在刷新/Host重启后正确恢复。

**Blocked by:** [实例授权、数据联动与显式共享](05-data-grants.md)、[数据上下文与原生AI执行闭环](07-native-execution.md)。

**Status:** in-progress

- [ ] 真实应用项目、未归属实例、显式关联、授权、数据状态和角色引用在刷新/Host重启后正确恢复。
- [ ] 平台配置、浏览器偏好、应用业务记录与原生会话分别归属；不清理浏览器存储作为恢复捷径。
- [ ] 视图被淘汰和重新挂载后恢复到同一实例，会话与业务数据不会依赖仅存组件内存。
- [ ] 并发修改及存储失败有明确冲突/错误与重试路径，不静默覆盖较新数据或报告虚假成功。
- [ ] 重启中断的任务不伪报成功，用户仍能在原生会话找回状态；保护近期业务数据、原生历史与凭据。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
