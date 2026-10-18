---
id: worktable-framework-06
title: 角色会话隔离与能力复用
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-04]
---

# 06: 角色会话隔离与能力复用

**What to build:** 应用实例的角色通过稳定身份关联原生会话，读取/创建/重试/替换语义分开。

**Blocked by:** [深度应用接入与同实例多视图](04-deep-views.md)。

**Status:** ready-for-agent

- [ ] 应用实例的角色通过稳定身份关联原生会话，读取/创建/重试/替换语义分开。
- [ ] 重复和真实并发创建收敛到同一角色绑定；不同项目或实例默认隔离，替换保留旧历史并需明确操作。
- [ ] 公共Agent/Skills可供应用复用；应用私有能力保持所有权，教学专用逻辑不成为所有应用的必选接口。
- [ ] 禁用、缺失或不可调用能力明确反馈，不自动替换Agent、不新建Session掩盖失败。
- [ ] 原生会话可重新打开并查看历史；未发送文字、编辑器归属不跨实例混用。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
