---
id: worktable-platform-integration-route
title: 选择上游维护方式与现有能力迁移接缝
parent: worktable-platform-map
labels: [wayfinder:grilling]
status: open
assignee: codex
blocked_by: [worktable-platform-application-model]
---

## Question

固定哪个 Worktable 提交与 DSH 兼容目标？以派生分支还是可扩展模块维护？现有 Host 配方、角色、数据源与能力目录怎样接入，谁拥有配置与业务数据？如何逐项迁移并退役重复系统，同时保留原仓库、来源许可及上游更新通路？

源码现状依据为本轮两套本地源码对照，不把旧版本兼容声明或先前实页证据外推为新组合已经通过。

## 已确认技术组织方式

用户确认：一个Worktable派生插件作为唯一前台；平台内核采用独立代码模块，先放在同一插件内而不增加额外安装依赖；DSH原生能力集中适配；具体应用通过约定独立接入。后续有明确需要才拆包。新增应用、宿主兼容、布局修改分别集中在对应部分。

这不等于已选定上游精确提交和可支持的宿主范围，也不证明现有Worktable已提供应用/多视图注册接口。源码接缝调查完成后再记录可实施方案；本工单暂不关闭。

## 源码研究进展

[框架草案的接缝核对](../framework-draft.md#本轮接缝核对结论)明确已有项目插槽可复用，以及分栏单例、封闭内容类型、多视图编辑器所有权和本地dirty基线风险。架构方向已获确认，精确基线快照、宿主兼容目标及新增接口的验证仍未完成，不提前关闭本决策。
