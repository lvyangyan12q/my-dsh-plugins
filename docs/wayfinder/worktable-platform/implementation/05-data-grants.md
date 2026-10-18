---
id: worktable-framework-05
title: 实例授权、数据联动与显式共享
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-04]
---

# 05: 实例授权、数据联动与显式共享

**What to build:** 深度应用的列表、筛选、统计和详情使用同一实例数据上下文，多个视图正确联动。

**Blocked by:** [深度应用接入与同实例多视图](04-deep-views.md)。

**Status:** ready-for-agent

- [ ] 深度应用的列表、筛选、统计和详情使用同一实例数据上下文，多个视图正确联动。
- [ ] 共享资源由数据所属应用管理；用户可以显式引用同一资料源而不复制整库。
- [ ] 授权默认只对选定实例生效且共享默认只读；相同应用的其他项目/实例不自动获得权限。
- [ ] 撤销共享阻止后续访问并有明确状态，不宣称撤回已发送AI历史；读写授权分开验证。
- [ ] 写入仅在显式许可下通过数据所属应用执行，错误/过期请求不静默覆盖；权限不能只靠UI隐藏。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
