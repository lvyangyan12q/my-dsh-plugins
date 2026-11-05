---
id: paper-reader-impl-01
title: 数据契约 v2 与阅读页原文/译文适配
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: []
---

# 01: 数据契约 v2 与阅读页原文/译文适配

## What to build

阅读页能正确读两种原文语言：digest 使用 `sourceLanguage` 与 `original/translation`，阅读页按原文语言决定对照顺序；英文源仍是「英文 | 中文」，中文源变为「中文 | 英文」；「仅中文 / English」按目标语言取文本。示例数据、校验与测试同步迁移，旧 `en/zh` 字段在迁移期仍可读。

## Blocked by

None (can start immediately).

## Acceptance criteria

- [x] 示例 digest 迁移到 v2（英文源 + 一条中文源样本），宿主校验接受 v2、拒绝缺 `sourceLanguage` 或成对块字段的条目。
- [x] 阅读页对照列顺序由 `sourceLanguage` 决定；中文源在三种模式下都正确。
- [x] 语言中性块（公式/图/代码）只渲染一份；缺译文显示 pending/原文回退并标「未翻译」。
- [x] 旧 `en/zh` 数据仍能读，不要求用户先迁移文件。
- [x] 宿主契约测试与客户端渲染测试覆盖英文源、中文源、三种模式。

**Evidence:** `6b4c30d`；集成分支 `a317a08` 上 host 16/16、client 11/11 通过。
