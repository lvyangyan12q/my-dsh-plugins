---
id: paper-reader-impl-08
title: DeepSeek 官方双语适配器
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [paper-reader-impl-03]
---

# 08: DeepSeek 官方双语适配器

## What to build

抓取 DeepSeek 官方新闻的英文/中文成对内容，直接写入原文与译文，不调用翻译；条目标记 `sourceLanguage: "zh"`，阅读页以「中文 | 英文」对照；中文缺失时回退英文并标 pending。

## Blocked by

- 03 CLI 骨架、选择/去重/配额与 arXiv 全链路

## Acceptance criteria

- [ ] 通过 sitemap 发现新闻条目，避开 `/news` 软 404。
- [ ] 英文与中文 Markdown 成对抽取；块级对齐，不重复段落。
- [ ] 不产生任何模型翻译请求；`translationState` 仍为 complete（官方双语）。
- [ ] 中文缺失时保留英文、标 pending，页面可见。
- [ ] 英文源与中文源的三种阅读模式都正确；fixture 覆盖成对与缺失两种情况。
