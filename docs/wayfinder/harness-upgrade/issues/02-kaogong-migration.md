---
id: harness-upgrade-kaogong-research
title: 核实考公旧接入、数据及角色会话的迁移接缝
parent: harness-upgrade-map
labels: [wayfinder:research]
status: open
assignee: codex
blocked_by: []
context_branch: research/kaogong-worktable-migration-20261024
---

## Question

当前考公对 personal-workbench 和旧 Harness 的依赖分别落在哪里？题库/资料、进度、错题、练习轮次、课堂/计划、角色绑定和原生会话各由谁持有，哪些目前是全局/default 作用域？派生 Worktable SDK 已能承接哪些职责，哪些还需新增接口或应用侧实现？

只读核实代码与脱敏的路径配置，给出共享只读资料与实例私有学习状态的候选划分、旧记录/绑定接管的风险和迁移前核验项。不得读取或输出凭据、复制私有题库到报告、改答案、迁移正式数据、创建 Session 或改变资料链接。
