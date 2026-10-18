---
id: worktable-platform-first-stage-access
title: 确定首阶段范围与分级接入、共享授权边界
parent: worktable-platform-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [worktable-platform-positioning, worktable-platform-application-model]
---

## Question

是否允许无项目的原生AI工作？第一阶段与完整规格如何区分？普通网页能否保证内部状态共享？共享数据的读写与撤销分别意味着什么？

## Resolution

用户对本轮四项建议回复“全部同意”：

1. 允许不创建项目直接使用原生对话和工具；需要组织多应用和隔离工作状态时再创建项目。后续关联项目不自动搬动旧会话或资料。
2. 第一阶段证明框架成立：网页和深度应用接入、同实例多视图状态共享、跨项目状态/任务/会话隔离、显式共享数据、真实原生AI执行及恢复。完整搭建器、高级网页桥接、自动追改分阶段接入，保留原需求；阶段完成不等于完整规格完成。
3. 普通网页只保证打开、布局和入口管理；主动接入协议的应用才保证声明范围内的状态共享、数据联动和AI调用。
4. 共享默认只读；写入另行授权，由数据所属应用执行。撤销共享阻止后续访问，不撤回已经发送进AI会话的内容。

原14张实施工单草案尚未批准；必须依据阶段边界修订后再确认、发布。此记录不关闭原工单或实现规格。

长期集成取舍见[分级应用接入与应用所有的数据共享](../../../adr/0001-graded-app-integration-and-owned-sharing.md)。
