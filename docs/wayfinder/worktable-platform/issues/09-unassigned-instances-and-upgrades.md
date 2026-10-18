---
id: worktable-platform-unassigned-upgrades
title: 确定无项目实例归属与可逆升级边界
parent: worktable-platform-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [worktable-platform-instance-grants-disable]
---

## Question

无项目时是否可直接打开深度应用？后续关联项目怎样保留身份？升级是否可以自动改变业务数据？

## Resolution

用户对Q8、Q9回复“确认”：

- 允许无项目直接打开深度应用，使用明确标注未归属项目的独立实例。后续由用户选择关联项目，不移动资料、不重建会话。一个实例不能同时归属多个项目；另一项目使用独立实例并可显式共享数据。
- 区分配置升级和业务数据迁移。可验证、可回退的配置升级可自动执行；不可逆业务数据迁移须先说明影响并由用户确认。不兼容时停止升级、保留原数据，不清空或恢复旧整库来掩盖问题。

本轮至此收敛产品语义与框架边界；上游快照、目标宿主及原型实测仍作为技术/验证前置保留。工单草案须按阶段重排后确认，未因用户确认上述行为自动发布。
