---
id: paper-reader-hf-mirror
title: Hugging Face 官方接口的代理接入与降级
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [paper-reader-proxy-policy]
---

## Question

Hugging Face 官方直连不可达，但系统代理下官方 API 可用（`?date=YYYY-MM-DD` 返回 34/46 条，含 `upvotes`、`ai_summary`、`githubRepo`，`paper.id` 即 arXiv id）。原 `hf-mirror` 方案因此不再必需，且可避开其 `robots.txt: Disallow: /` 的合规问题。

选择：官方 HF + 显式代理为主；代理不可用时跳过 HF、由 arXiv 自排序补位；是否保留镜像备用。

## Resolution

用户确认按建议执行：

- **官方 HF + 显式代理**为唯一接入方式，不使用 `hf-mirror` 或其他镜像。
- 每日榜取 `?date=YYYY-MM-DD`，按 `upvotes` 排序；`paper.id` 作为 arXiv id，正文回 arXiv 取。
- 代理不可用时：**跳过 HF**，在 digest 与页面记录「HF 当日缺失」；用 arXiv 新论文自排序补位，不静默失败。
- `?limit=` 不带日期会跨天且不排序，禁止用于每日全量。
- HF 仅提供「热度信号 + 标题/摘要」，正文与段落一律以 arXiv 为准。
