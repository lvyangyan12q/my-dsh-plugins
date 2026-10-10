---
id: workbench-completion-native-cleanup
title: 确定可选侧栏卸载清理的受支持接缝
parent: workbench-completion-map
labels: [wayfinder:research]
status: open
assignee: codex-sidebar-lifecycle-research
blocked_by: []
---

## Question

DSH 0.2.0-rc.2 与 Better Sidebar 0.24.1 中，哪个公开且有生命周期保证的接口可在全局插件面板停用后清除工作台自有原生 Tab，并保留其他 Tab、所有会话和业务状态？已修正真实 ID 捕获但实际残留仍在；需区分可用公共接口、仅实现内部接口与未声明兼容性，不允许私有 DOM 或核心补丁绕过。研究应给出可复现的外部验证方案及版本/未加载/未挂载限制，供实施决策使用。

## Context

当前代码基线 194d546；实际失败证据见 [兼容矩阵](../../../evidence/2026-10-10/better-sidebar-historical-matrix-browser.json)。研究成果在独立 research 分支，不进入实现 PR，不能标记真实缺陷已修复。
