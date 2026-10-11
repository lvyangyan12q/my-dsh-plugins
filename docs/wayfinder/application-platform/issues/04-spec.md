---
id: application-composition-spec
title: 确定验收边界并形成应用组合规格
parent: application-composition-map
labels: [wayfinder:grilling]
status: closed
assignee: codex
blocked_by: [application-composition-authoring, application-composition-data-role]
---

## Question

哪些从应用注册到模块联动及角色交接的外部行为足以验收第一版？优先沿用现有应用注册、持久角色绑定与原生会话测试边界；确认后将已解决决策整理为可执行规格，应用 ready-for-agent 标记。

## Resolution · 2026-10-03

用户确认：用考公与一个简单展示应用验证草稿生成、编辑预览、显式启用、模块联动、角色交接和刷新恢复。地图保留扩展接口，真实地图服务后移。沿用应用生命周期、Host 持久化和原生会话边界，验证用户可观察行为。规格已写为 [工作台应用平台规格](../platform-spec.md)，标记 ready-for-agent。仅表示可进入实现，不表示功能已完成。
