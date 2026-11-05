---
id: paper-reader-impl-04
title: 翻译服务、缓存、pending 与预算
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [paper-reader-impl-03]
---

# 04: 翻译服务、缓存、pending 与预算

## What to build

入选条目获得成对译文：按段落批量调用 OpenAI 兼容端点，保留块 id 对齐；缓存命中不重复调用；失败写 pending 而不是伪造译文；每日 token 预算超限后剩余条目 pending；页面显示翻译进度、pending 与「未翻译，显示原文」。

## Blocked by

- 03 CLI 骨架、选择/去重/配额与 arXiv 全链路

## Acceptance criteria

- [ ] 端点/模型/密钥由环境变量配置；缺少配置时明确失败或跳过翻译，不静默。
- [ ] 段落批量请求返回缺块、多块、乱序时判失败并重试；不合并、不重排块。
- [ ] 缓存键包含原文、目标语言、模型与术语表版本；重复运行不再付费翻译。
- [ ] 单块失败重试后仍失败 → `translationState: "pending"`，页面可见；其余块正常。
- [ ] 每日预算超限后剩余条目 pending，run 记录与页面标注；密钥不出现在 digest/日志。
- [ ] fixture + 假 LLM 测试覆盖对齐、缓存、失败、预算与页面状态。
