---
id: worktable-framework-01
title: 保护本地改动并验证派生基线
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: []
---

# 01: 保护本地改动并验证派生基线

**What to build:** 保留上游本地源码、清单、未跟踪修复和现有编译产物的精确检查点，并识别许可证与来源；原文件和六项历史变更不受影响。

**Blocked by:** None (can start immediately)。

**Status:** ready-for-agent

- [ ] 保留上游本地源码、清单、未跟踪修复和现有编译产物的精确检查点，并识别许可证与来源；原文件和六项历史变更不受影响。
- [ ] 从受保护快照形成自己的派生插件，在已记录的未经修改DSH候选中独立构建、官方安装并打开工作台。
- [ ] 空会话和已有会话、项目开关、原生菜单、布局缩放及关闭恢复实际可用；失败保留诊断，不修改原生或正式3080。
- [ ] 构建产物与安装包身份一致，实际安装逐文件核对；不能只因构建成功关闭工单。
- [ ] 保存精确上游快照与宿主版本、依赖图、保护校验及可复验操作证据；不把dirty工作树等同HEAD。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
