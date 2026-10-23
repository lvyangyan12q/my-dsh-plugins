---
id: harness-upgrade-native-research
title: 核实 rc.3 公开接口与工作台依赖的差异
parent: harness-upgrade-map
labels: [wayfinder:research]
status: open
assignee: codex
blocked_by: []
context_branch: research/harness-rc3-compatibility-20261024
---

## Question

在固定原生 rc.3 与 Worktable 0.9.6 代码基线上，插件使用的配置、Host/Client 注册、会话/输入/原生执行、存储、生命周期和安装版本检查有哪些实际差异？哪些可由插件公开适配层修复，哪些须明确不可用或等待上游？Notes/Reading 这两个消费者需要随 SDK 验证什么？

研究须引用拥有接口的源码，区分声明不兼容、实际调用失配及尚未运行验证；给出适配接缝、版本/能力检查和建议验收矩阵。不要改产品代码、绕过版本检查、写原生补丁或把原生构建通过当作插件闭环。
