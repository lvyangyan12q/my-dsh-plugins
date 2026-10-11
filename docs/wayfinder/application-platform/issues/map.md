---
id: application-composition-map
title: 应用组合与角色绑定：原型先行的决策地图
labels: [wayfinder:map]
status: closed
---

## Destination

先通过可操作原型明确工作台作为平台型插件如何开发、管理和使用后续应用，以及应用如何组合页面与模块、连接数据和绑定角色，再形成可执行规格。完成表示关键决策有用户确认、验收边界清楚；本轮不交付生产实现。

## Notes

采用项目现有本地 Markdown 任务跟踪。子任务 frontmatter 的 parent 指向本地图；blocked_by 是依赖，全部关闭才可领取。status: closed 且 assignee 为空、依赖已关闭的任务构成前沿。

使用 wayfinder、prototype；讨论决策时使用 grilling、domain-modeling；规格阶段使用 to-spec。保留 DSH 原生菜单与会话功能，Agent/Skills 独立管理，考公数据和资料引用不受影响。

AI 生成配置与必要组件、公共模块加专用组件已获用户确认。原型数据与会话均为内存模拟。

## Decisions so far

- [原型验证：模块联动与角色会话是否清楚](01-prototype.md)：A 为平台首页、B 为创建流程、C 为管理页面；具体决策与原型归档见任务。

平台定位为用户已确认的前提：工作台为后续应用提供通用基础，考公只是首个接入应用；Agent/Skills 仍为独立能力管理。

- [确定新增应用的操作者与第一版配置边界](02-authoring.md)：AI 生成配方与必要组件，公共模块可配置，草稿预览后显式启用。

- [确定数据联动、角色上下文与持久会话的边界](03-data-role.md)：应用拥有数据，实例与角色拥有会话，模块任务经上下文预览后发送。

- [确定验收边界并形成应用组合规格](04-spec.md)：考公与简单展示应用验证平台闭环，规格 ready-for-agent，真实地图后移。

## Not yet specified

无阻碍第一版规格交付的待决策项。


## Out of scope

- 本轮生产代码开发、真实模型调用和部署。
- 修改 DSH 原生导航、删除旧考公路径或迁移学习数据。
- 未经确认的通用拖拽低代码平台。
- 真实地图服务、跨应用真实数据源授权、业务数据迁移和自动升级：第一版先验证平台闭环，不纳入本地图实现范围。

## Handoff

[工作台应用平台规格](../platform-spec.md)为 ready-for-agent。地图完成代表决策路线清楚，生产实现与验收尚未开始。

开放任务通过本目录 frontmatter 查询，不在地图中重复维护列表。
