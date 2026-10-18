---
id: worktable-framework-07
title: 数据上下文与原生AI执行闭环
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-05, worktable-framework-06]
---

# 07: 数据上下文与原生AI执行闭环

**What to build:** 准备任务展示准确的实例、角色、来源视图及选中记录/筛选上下文；可编辑、移除上下文和放弃。

**Blocked by:** [实例授权、数据联动与显式共享](05-data-grants.md)、[角色会话隔离与能力复用](06-roles.md)。

**Status:** ready-for-agent

- [ ] 准备任务展示准确的实例、角色、来源视图及选中记录/筛选上下文；可编辑、移除上下文和放弃。
- [ ] 准备、打开及恢复不调用模型，显式发送才发起原生任务，失败不换通道重复发送。
- [ ] 实际模型回复与工具执行可在正确原生会话中查看，原生问题、审批、轨迹和Stop真实可操作。
- [ ] 隐藏/关闭视图不误停任务，运行/待处理/取消/失败/未读分别反馈，不把结束信号当业务成功。
- [ ] 同会话多视图采用清楚输入所有权，跨实例草稿保持隔离；原生能力缺口明确反馈并保留既定阶段替代路径。

## Scope and evidence

依据[框架与应用接入规格](../framework-spec.md)及其中首阶段限定；真实安装用户流程为主接缝，契约测试只作辅助。记录版本、操作、结果与限制；无证据不勾选、不以提交或构建成功关单。保留用户数据、源码改动、原生DSH和历史工单状态。
