---
id: application-composition-authoring
title: 确定新增应用的操作者与第一版配置边界
parent: application-composition-map
labels: [wayfinder:grilling]
status: closed
assignee: codex
blocked_by: [application-composition-prototype]
---

## Question

第一版由 AI 配合开发者生成配置与专用组件，还是由普通用户可视化搭建？哪些功能只需配置，哪些必须允许代码扩展？配置预览是否属于产品第一版？

## Resolution · 2026-10-03

用户确认：描述需求，由 AI 生成应用配方及必要组件；公共模块通过配置复用，特殊业务允许专用组件扩展；生成结果进入草稿，编辑和预览后显式启用，不直接更改运行中的应用。第一版不要求所有业务都无代码实现。
