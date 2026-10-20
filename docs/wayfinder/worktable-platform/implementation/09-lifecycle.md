---
id: worktable-framework-09
title: 停用、升级与回退的数据保护
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: lifecycle
blocked_by: [worktable-framework-08]
---

# 09: 停用、升级与回退的数据保护

**What to build:** 停用阻止新实例与新任务，不自动停止已有任务；仍可在原生会话查看、审批和Stop。

**Blocked by:** [持久化、并发与冷恢复](08-recovery.md)。

**Status:** in-progress

- [ ] 停用阻止新实例与新任务，不自动停止已有任务；仍可在原生会话查看、审批和Stop。
- [ ] 卸载前明确处理运行任务；在控制交接未完成时不销毁必要控制入口，不能将任务变成无人可管。
- [ ] 可验证可回退配置升级可自动执行；不可逆业务迁移先说明影响并确认，不兼容时停止并保留原数据。
- [ ] 实际安装旧/新产品升级、失败及回退可复验；回退不倒灌旧整库，也不承诺撤销不可逆业务修改。
- [ ] 停用、卸载和重装不默删资料、成绩、记录、授权元数据或原生会话；复核原生和上游保护清单。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
