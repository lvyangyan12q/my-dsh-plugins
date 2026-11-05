---
id: paper-reader-language-semantics
title: 确定原文语言与三种阅读模式的语义
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: []
---

## Question

来源里既有英文（arXiv、OpenAI、Anthropic），也有中文（DeepSeek、月之暗面）。「中英对照 / 仅中文 / English」分别以什么为基准？

建议：每条带 `sourceLanguage` 与译文；对照模式固定「原文 | 译文」；仅中文与 English 指目标语言的阅读视图；中文原文的条目在对照模式是「中文 | 英文」，English 模式显示英文译文。需要确认这个语义，以及数据字段是否用 `lang` + `blocks[].zh/en` 表达，还是要引入通用的 `original/translation`。

## Resolution

用户回复「k可以」，确认推荐语义：

- **对照模式固定「原文 | 译文」**，不假定原文是英文：英文来源左英文、右中文；中文来源左中文、右英文。
- **「仅中文」「English」是目标语言视图**，不是「原文/译文」视图：中文来源的 English 模式显示英文译文，英文来源的仅中文模式显示中文译文。
- **数据契约为 `sourceLanguage` + `original/translation`**：`item.sourceLanguage` 为 `en` 或 `zh`；标题、摘要、段落、图注、公式说明成对提供 `original` 与 `translation`；缺译文用 `translation: null` + `translationState`。
- **语言中性的内容只渲染一份**：公式主体、代码、图形不因模式复制两份；它们的说明/图注仍按 `original/translation` 成对。
- 现有 `en/zh` 字段与英文优先顺序是当前实现的过渡形态，需按本决定迁移；迁移由适配票承接，迁移前页面行为不变。
- 中文来源的英文译文成为必需；翻译票不再把「是否反译」作为开放问题。
