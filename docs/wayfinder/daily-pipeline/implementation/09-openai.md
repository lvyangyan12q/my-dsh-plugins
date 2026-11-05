---
id: paper-reader-impl-09
title: OpenAI 全文与节选降级
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [paper-reader-impl-04, paper-reader-impl-05]
---

# 09: OpenAI 全文与节选降级

## What to build

OpenAI 来源分两级：代理可用时抓文章页服务端渲染全文并翻译；代理不可用时只保留 RSS 的标题、日期、官方 dek 与链接，标 `excerpt: true`，页面显示「节选 / 代理不可用」，不伪装成全文。

## Blocked by

- 04 翻译服务、缓存、pending 与预算
- 05 代理配置、健康检查与来源降级状态

## Acceptance criteria

- [x] RSS 列表可用，解析标题、日期、分类、dek 与链接。
- [x] 代理可用时抽取文章页正文（标题、日期、作者、段落），生成中文译文。
- [x] 代理不可用或单篇失败时写入节选条目，`excerpt` 与原因可见；不重试到无限。
- [x] 全文与节选都计入每日配额；节选不计入「全文已翻译」统计。
- [x] fixture 测试覆盖 RSS、全文抽取、节选降级与页面标记。

**Evidence:** `50612ca`（合并 `725e79e`、集成合并 `c78b123`）；集成分支 16 个测试文件 180 项通过（新增 openai 11、openai-page 2）。注意：OpenAI 默认 `enabled:false`，需显式开启；真实代理页面样本未做冒烟。
