---
id: paper-reader-translation-engine
title: 确定翻译引擎、凭据、缓存与失败策略
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [paper-reader-daily-quota]
---

## Question

全文翻译由谁执行、用什么模型和凭据、如何控制成本与质量？

## Resolution

进入实施，采用以下默认（可在配置中调整）：

- **引擎**：OpenAI 兼容的 Chat Completions 接口；通过 `PAPER_READER_LLM_BASE_URL` / `PAPER_READER_LLM_API_KEY` / `PAPER_READER_LLM_MODEL` 配置，默认指向本机已配置的 DeepSeek 兼容端点与性价比模型。**不直接读取 DSH 凭据文件**，避免把插件与 DSH 内部存储耦合；后续可另做适配器。
- **粒度**：按段落块批量翻译（每次 6–12 段，保留块 id 映射），不整篇塞一次；章节标题、图注、公式说明分别处理；公式主体与代码不翻译。
- **对齐**：译文必须按 `original` 块逐段返回；返回缺块/多块视为失败，不用模型自行合并段落。
- **术语表**：配置内置术语（模型名、方法名、常见缩写），作为 system prompt 一部分；术语表版本进入缓存键。
- **缓存**：`sha256(原文 + 目标语言 + 模型 + 术语表版本)` 命中直接复用；缓存跨天保留。
- **失败**：单块失败重试 2 次；仍失败写 `translation: null` + `translationState: "pending"`，页面显示骨架/原文回退，不阻塞其余块。
- **中文来源**：DeepSeek 官方双语直接使用；其余中文来源需生成英文译文。
- **预算**：每日 token 上限可配置（默认 250k）；超限后剩余条目保持 pending，并在 run 记录与页面标注，不静默截断。
- 密钥不写 digest、不入日志明文；日志只记录模型名、token 数与错误码。
