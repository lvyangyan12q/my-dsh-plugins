---
id: worktable-layout-client
parent: worktable-project-layout-spec
title: 自动保存与项目目录恢复
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: []
---

按目录 README 冻结接口实现工作台接入：完整内容和几何快照、600ms防抖队列、项目切换归属、保存状态和重试/冲突操作、旧缓存兼容、从目录恢复登记、旧文件候选选择。修复已有分栏候选并保护原生布局与既有应用引用。任何读取错误禁止缓存自动覆盖。

在已确认的客户端真实分栏交互及存储接口接缝使用 TDD，验证仅拖动保存、不同项目快照不串用、乱序返回、无缓存恢复、错误可见及旧数据保留。新增样式遵守项目模板单一来源规则。

## Resolution

待实施。
