---
id: paper-reader-scope
title: 确认目的地、来源范围与全文/自动化边界
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: lead
blocked_by: []
---

## Question

首轮范围确认：这个工具要做到什么程度、抓哪些来源、抓多深、X 怎么处理？

## Resolution

用户在 2026-11-04 首轮讨论中确认：

- 目的地是**完整工具**，不止规格：每天抓取最新内容，生成中英对照供阅读。
- 来源范围：arXiv、Hugging Face 每日榜单、Anthropic、DeepSeek、月之暗面（Kimi）、OpenAI；不使用 Claude Code 来源，X 预留。
- 不依赖 DSH `web_search` 作为发现或抓取入口（用户明确去掉），只走来源自身入口。
- 采用**自动化定时任务**运行。
- 内容深度：**全文**，不是摘要或节选。
- X 本轮**先预留**，不接入；保留来源扩展位与 schema 位置。

未确认：每日配额、翻译引擎与凭据、调度实现、中文来源的对照方向、存储与历史范围。这些已分别拆成前沿/阻塞票。
