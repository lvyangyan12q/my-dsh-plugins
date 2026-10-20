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

## Implementation checkpoint（待真实安装验收）

已实现 [08 持久化与恢复契约](../08-recovery-protocol.md)：平台规范路径唯一所有者、有效死 PID 恢复、代际正文取消与排空、失败/未知状态保留、覆盖层重挂恢复，以及 Reading 全量清理。公开源码与最终产物检查见后续精确证据；本工单继续 in-progress，真实 3091 重启与业务/会话核对由主验收执行后记录，当前不勾选验收项。

最终候选辅助检查：Worktable `npm run pack` 166/166、零 skip，最终 7 文件安装/导入及工厂、导航、DOM8、目录3通过；Reading 官方域/实际页面/收尾 7/7，最终 6 文件独立安装逐字节比对与导入通过。Worktable 双资产 SHA256 `c05049edcaccd43e42baff90f18311fe85457b38963ade6ea03a393b964fe5ac`；Reading 双资产 SHA256 `639c6964e471ba7e3c53e4d6ae14874eea63c77671087d36198190a9fd41ba41`。完整本地辅助证据 `C:/Users/pc-zzy/Documents/ChatGPT/deepseek-harness/worktable08-final-receipt.json`；未以辅助检查替代 3091 重启验收。

真实验收发现已关联网页虽保留记录，但已填充模块缺少无损重开入口；本候选新增标签栏“＋应用”，复用项目作用域目录，继续原实例/视图并保留已有模块。实际 React 与真实临时平台目录回归验证追加、去重和跨项目晚响应隔离；新候选仍须正式安装后复验，不沿用旧包的通过结论。
