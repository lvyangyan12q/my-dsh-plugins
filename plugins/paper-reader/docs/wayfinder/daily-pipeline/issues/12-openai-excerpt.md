---
id: paper-reader-openai-excerpt
title: OpenAI 全文与代理降级选择
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [paper-reader-proxy-policy]
---

## Question

无代理时 OpenAI 文章页 403，只能得到 RSS 标题 + dek；代理下文章页 200、SSR、可抽全文。选择：代理可用时全文；不可用时降级节选还是跳过来源。

## Resolution

用户确认按建议执行：

- **代理可用时抓 OpenAI 全文**：RSS 列表 → 文章页 SSR 正文抽取（保留标题、日期、作者、段落）。
- **代理不可用时**保留该条 RSS 节选条目：`excerpt: true`，只含标题 + 官方 dek + 日期 + 链接，明确标注「节选 / 代理不可用」，不伪装成全文。
- OpenAI 全文与节选都计入每日配额；节选条目不参与「全文已翻译」的统计。
- 仍不接受代理/镜像之外的绕过方式；403 时不重试到无限。
