---
id: application-composition-data-role
title: 确定数据联动、角色上下文与持久会话的边界
parent: application-composition-map
labels: [wayfinder:grilling]
status: closed
assignee: codex
blocked_by: [application-composition-prototype, application-composition-authoring]
---

## Question

应用、页面与模块如何拥有和引用数据？筛选和选中项如何联动？角色会话按应用实例还是按页面复用？模块动作传递哪些上下文，用户能否检查、移除和确认发送？无 AI 的展示页面如何运行？

## Resolution · 2026-10-03

用户确认业务数据属于应用，页面模块共享筛选与选中项，跨应用通过明确数据连接读取。会话按应用实例与角色保留，多个页面/模块可复用，同一 Agent 在不同应用的会话独立。模块任务动作准备目标角色、任务与上下文，允许用户编辑或移除后显式发送；纯展示、筛选和选择不触发模型调用。
