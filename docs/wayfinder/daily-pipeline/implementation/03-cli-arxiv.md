---
id: paper-reader-impl-03
title: CLI 骨架、选择/去重/配额与 arXiv 全链路
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [paper-reader-impl-01, paper-reader-impl-02]
---

# 03: CLI 骨架、选择/去重/配额与 arXiv 全链路

## What to build

一个可手动运行的 CLI：读取配置与日期，抓取 arXiv 当日列表，按配额/去重选出论文，抽取 LaTeXML 全文，写出当日 v2 digest 与 run 记录；插件随即能读到这批条目（翻译先保持 pending）。这是第一条完整纵向链路：配置 → 网络 → 抽取 → 文件 → 页面。

## Blocked by

- 01 数据契约 v2 与阅读页原文/译文适配
- 02 按天 digest、索引、历史与页面加载

## Acceptance criteria

- [x] `--date`、`--dry-run`、`--source` 可用；配置控制分类、关键词、配额、超时；无网络时明确失败并保留上一份 digest。
- [x] 选择规则：arXiv 去重、每日 10 条上限（论文 6）可配置；低分条目被截断，不凑数。
- [x] 抽取保留标题/段落/公式/图注/代码；HTML 缺失回退摘要级并标 `excerpt`。
- [x] 写出当日 v2 digest、索引与 run 记录；页面能读到这批条目并显示 pending 译文。
- [x] fixture 测试覆盖 Atom 解析、去重、配额、抽取、原子写与 run 状态。

**Evidence:** `db0257f`；集成分支 `dc8de43` 上 9 个测试文件 90 项通过（host 26、storage 13、client 11、history 9、arxiv 8、selection 5、pipeline 10、cli 7、e2e 1）；合并后修复代码块 CRLF 归一化（`src/sources/arxiv.js`）。
