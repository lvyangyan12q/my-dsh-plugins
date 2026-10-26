---
id: worktable-layout-storage
parent: worktable-project-layout-spec
title: 固定布局文件与持久化接口
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: []
---

实现规格中的版本2格式、严格校验、分类读取、旧格式转换、同目录原子替换、跨进程互斥与修订冲突保护。新增受认证布局接口；共享 Node 存储模块供 CLI 使用。接口以本目录 README 为准。

用已确认的实际布局存储和受认证接口接缝做 TDD；覆盖首次创建、重读、坏文件字节保留、旧文件候选、跨进程冲突及准入拒绝。不得修改通用文件 API 的语义。

## Resolution

待实施。
