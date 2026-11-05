---
id: paper-reader-impl-06
title: Anthropic 与 Kimi 博客适配器
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [paper-reader-impl-04]
---

# 06: Anthropic 与 Kimi 博客适配器

## What to build

新增两类英文博客来源：Anthropic 用 sitemap 发现新文章并抽取服务端渲染正文；Kimi 用博客列表发现并按发布日期取文；两者都生成中文译文，按来源隔离失败，进入每日配额与页面阅读。

## Blocked by

- 04 翻译服务、缓存、pending 与预算

## Acceptance criteria

- [x] Anthropic：sitemap 差集发现新文章；`/news` 不全量 SSR 时仍能拿到完整清单；正文含标题、日期、作者、段落。
- [x] Kimi：列表日期与正文页可解析；明暗重复图去重；只有英文时生成中文译文。
- [x] 两者都遵守每日 4 条博客配额的一部分；同一 URL 不与 arXiv 重复。
- [x] 单篇抽取失败跳过并记 run 状态，不影响其他来源；页面显示来源与失败原因。
- [x] fixture 测试覆盖列表解析、正文抽取、翻译对齐与单篇失败。

**Evidence:** `ec1c9a3`；集成分支 `dae2d22` 上 17 个测试文件 192 项通过（新增 blog-sources 10）。已知限制：未做真实 Anthropic/Kimi 页面冒烟，结构变更需真实样本复核。
