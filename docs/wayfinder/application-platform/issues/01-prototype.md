---
id: application-composition-prototype
title: 原型验证：模块联动与角色会话是否清楚
parent: application-composition-map
labels: [wayfinder:prototype]
status: closed
assignee: codex
blocked_by: []
---

## Question

用户能否通过平台原型清楚理解创建、开发、管理、使用应用的流程，以及布局、业务模块、数据联动和角色会话的职责？平台首页三种结构与旅行应用三种结构应如何组合为最终交互？

## Assets

- [可操作原型](http://127.0.0.1:3084/?variant=A)：旅行示例，包括统计、列表、示意地图、详情及两个角色。
- 源文件：prototype-app-composition.html；启动：node serve-app-composition-prototype.mjs（用户本地 harness 工作区）。
- 原型已归档于 codex/prototype-application-platform 分支的 .local/prototype-platform；正式分支不包含原型代码。

## Resolution · 2026-10-03

用户确认 A 应用中心作为首页、B 分步流程用于创建应用、C 目录与配置用于应用管理。工作台是平台型插件，考公是首个接入应用；Agent/Skills 独立管理，DSH 原生区域保留。此决策只确定平台信息架构，不代表地图服务、数据授权、配方生成或会话复用规则已确定。
