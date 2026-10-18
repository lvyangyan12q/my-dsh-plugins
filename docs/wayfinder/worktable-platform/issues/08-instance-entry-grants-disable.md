---
id: worktable-platform-instance-grants-disable
title: 确定实例入口、授权范围与停用行为
parent: worktable-platform-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [worktable-platform-first-stage-access]
---

## Question

再次打开应用是否新建实例？共享授权是否随应用跨项目复用继承？停用应用时已有运行任务怎样处理？

## Resolution

用户对Q5至Q7回复“都确认”：

- 在同一项目再次点击应用，默认回到最近使用的实例；新建实例与添加同实例视图是两个明确操作。无可恢复实例时提供清楚的新建入口，不能把重复打开当新建。
- 授权默认只对选定实例生效；其他项目/实例不会因为使用同一应用而继承权限。用户可以显式共享同一资源给多个实例。
- 停用阻止新开实例和发起新任务，不自动停止已有任务；原生会话仍可查看、审批和Stop。卸载前必须明确处理运行任务，避免控制入口随插件消失。

无项目时的深度应用实例选择、项目关联及破坏性数据迁移仍待讨论；不由上述确认推定。实施工单未发布。
