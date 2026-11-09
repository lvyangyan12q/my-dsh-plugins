---
id: paper-reader-fulltext-quality
title: 原型验证全文抽取与双语段落对齐质量
parent: paper-reader-pipeline-map
labels: [wayfinder:prototype]
status: closed
assignee: null
blocked_by: [paper-reader-source-access]
---

## Question

用两个代表性来源做一次粗糙原型，验证抽取结果能否直接支撑阅读页：标题/段落/公式/图注/代码、段落对齐、PDF 回退、降级边界。

## Resolution

研究票已给出可施工的抽取方案；原型验证并入实施切片，不再单独产出原型：

- arXiv：`arxiv.org/html/<id>` 的 LaTeXML 结构（`h2.ltx_title_section`、`p.ltx_para`、`figcaption.ltx_caption`、`math annotation[encoding="application/x-tex"]`、`div.ltx_listing`）；失败回退 `/abs` 摘要级（`excerpt: true`），PDF 仅最后手段。
- Anthropic：`main#main-content` + `ld+json`；先删 script/style；单篇失败跳过并告警。
- DeepSeek：官方 en/zh Markdown 成对写入，免翻译。
- Kimi：`main.layout-content`，英文正文；去重明暗双图。
- OpenAI：代理下 `main` SSR 正文；无代理时 RSS 节选。
- HF：只作排序信号，正文回 arXiv。
- 对齐规则：一个抽取块 = 一个 `original` 块；标题/公式/图注/代码单独成块；不合并、不拆分段落；公式与代码不翻译。
- 老论文的 `ltx_ERROR` 过滤并记降级；表格暂按图注/文本降级，不阻塞。
- 验收：实施票 03/05/09 的 fixture 测试 + 11 的端到端演练共同覆盖，不另开原型票。
