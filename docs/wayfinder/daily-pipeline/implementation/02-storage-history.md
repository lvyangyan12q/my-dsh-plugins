---
id: paper-reader-impl-02
title: 按天 digest、索引、历史与页面加载
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [paper-reader-impl-01]
---

# 02: 按天 digest、索引、历史与页面加载

## What to build

工具按天写 digest 与索引，插件按日期读取：页面默认加载最近 7 天并按天分组，可继续加载到 30 天前；单日文件原子写入，过期文件清理，单日 8 MiB 上限；文件缺失、损坏、超限都有明确状态。

## Blocked by

- 01 数据契约 v2 与阅读页原文/译文适配

## Acceptance criteria

- [x] 每天一个 digest 文件 + 一个索引文件；索引最后更新，页面不会看到半份数据。
- [x] 宿主提供索引、按日期 digest、健康检查路由；鉴权、缺失、损坏、超限响应明确。
- [x] 页面加载最近 7 天，可继续加载更早（最多 30 天），日期分组与空态正确。
- [x] 写入失败保留上一份文件；过期清理失败不阻塞当天写入。
- [x] 用 8 天 fixture 验证加载、翻页、损坏文件与 8 MiB 上限。

**Evidence:** `7347893`；集成分支 `16b9a57` 上 host 26/26、storage 11/11、client 11/11、history 9/9 通过。
