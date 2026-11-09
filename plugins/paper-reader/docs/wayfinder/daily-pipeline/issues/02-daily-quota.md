---
id: paper-reader-daily-quota
title: 确定每日配额、排序与重要度规则
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [paper-reader-proxy-policy, paper-reader-hf-mirror, paper-reader-openai-excerpt]
---

## Question

每天进入 digest 的条目上限、来源配额与排序规则是什么？全文翻译成本与超限降级？

## Resolution

用户确认进入实施，采用可配置的默认值（首轮演练后可调）：

- **每日上限 10 条**：论文 6、博客/公告 4。来源内部可少不可超；不足 10 条不凑数。
- **论文**：HF 当日榜按 `upvotes` 取前 6，与 arXiv 结果按 arXiv id 去重；HF 缺失时用 arXiv `cs.CL/cs.AI/cs.LG` 的当日新论文按提交时间 + 关键词/机构白名单补足。
- **博客**：Anthropic（`/research` + `/news` 新条目）、DeepSeek、Kimi、OpenAI 各按发布时间取最新，合计上限 4；同一文章不重复。
- **去重键**：arXiv id 优先；其余用 canonical URL；标题指纹兜底。
- **全文翻译只对入选条目**；未入选不翻译。超出上限的低分条目不进入当日 digest。
- **降级**：源不可用（HF/OpenAI 代理失败、单篇抽取失败）时保留其余来源，并在 index/页面标注，不用旧内容冒充当日。
- 配额与来源权重放在配置文件中，不改代码即可调整；首轮端到端演练后按实际阅读量复核。
