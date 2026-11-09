---
id: paper-reader-impl-08
title: DeepSeek 官方双语适配器
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [paper-reader-impl-03]
---

# 08: DeepSeek 官方双语适配器

## What to build

抓取 DeepSeek 官方新闻的英文/中文成对内容，直接写入原文与译文，不调用翻译；条目标记 `sourceLanguage: "zh"`，阅读页以「中文 | 英文」对照；中文缺失时回退英文并标 pending。

## Blocked by

- 03 CLI 骨架、选择/去重/配额与 arXiv 全链路

## Acceptance criteria

- [x] 通过 sitemap 发现新闻条目，避开 `/news` 软 404。
- [x] 英文与中文 Markdown 成对抽取；块级对齐，不重复段落。
- [x] 不产生任何模型翻译请求；`translationState` 仍为 complete（官方双语）。
- [x] 中文缺失时保留英文、标 pending，页面可见。
- [x] 英文源与中文源的三种阅读模式都正确；fixture 覆盖成对与缺失两种情况。

**Evidence:** `4aee76a`；集成分支 `df58424` 上 13 个测试文件 155 项通过（deepseek 15）。已知限制：en/zh 段落数不同时按结构启发对齐并标 partial；中文缺失回退项按 `sourceLanguage: en` 处理；真实网络冒烟未做。
