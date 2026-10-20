---
id: worktable-framework-10
title: 第二应用独立接入并冻结首版协议
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: in-progress
assignee: second_application
blocked_by: [worktable-framework-08]
---

# 10: 第二应用独立接入并冻结首版协议

**What to build:** 另一个真实开发应用依据接入文档通过注册接入，主要增加应用自身代码，不修改工作台核心私有分支。

**Blocked by:** [持久化、并发与冷恢复](08-recovery.md)。

**Status:** in-progress

- [ ] 另一个真实开发应用依据接入文档通过注册接入，主要增加应用自身代码，不修改工作台核心私有分支。
- [ ] 验证完整页面和模块、实例上下文、数据源及需要时的角色任务可以按声明复用。
- [ ] 公开最小注册/生命周期/状态/数据/任务契约，集中DSH适配；说明轻量网页与深度接入能力差异。
- [ ] 协议、应用、配置schema和业务数据版本分别处理，未知版本/缺能力明确反馈，注销及释放行为可复验。
- [ ] 依据两个真实应用的结果冻结第一版接口并记录兼容策略，提供开发者接入和反例说明；不假设高级网页桥接已交付。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。

## Prepared candidate

Project Notes与公开SDK候选实现见[10接入合同](10-sdk-contract.md)。已合入09最终生命周期实现；产品Worktable0.6.0首次发布SDK子路径，Notes要求>=0.6.0。源码/包门禁仅辅助，真实双应用、公共与应用私有Skill加载、跨实例/冷恢复待root最终安装验收；本工单保持in-progress，未勾选真实结果。
