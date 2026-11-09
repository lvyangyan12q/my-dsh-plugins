---
id: paper-reader-source-access
title: 确认各来源的入口、列表与正文抽取路径
parent: paper-reader-pipeline-map
labels: [wayfinder:research]
status: closed
assignee: research-subagent
blocked_by: []
---

## Question

在 2026-11-04 的网络环境下，逐来源确认「列表怎么拿、正文怎么拿、失败怎么办」：

- **arXiv**：每日新论文列表（API 查询式）、HTML（LaTeXML）与 PDF 全文的可用性与结构，公式、图注、章节标题是否保留。
- **Hugging Face Daily Papers**：直连失败时是否存在可用替代入口（镜像、API、第三方榜单、RSS）；若都不可用，替代的「每日热度」信号是什么。
- **OpenAI News**：RSS 是否含正文，文章页 403 时如何取全文，语言与作者信息。
- **DeepSeek / 月之暗面（Kimi）/ Anthropic Engineering & News**：列表结构、文章页是否服务端渲染、正文与标题语言、发布日期字段。
- 每类的请求频率、缓存头、robots/条款与礼貌抓取建议。

## Resolution

报告全文：[`research/01-source-access.md`](../research/01-source-access.md)（逐来源实测 URL/状态/字段/选择器，含不可达来源的替代评估与「不可用就不做」清单）。

证据：[`research/01-source-access.probes.jsonl`](../research/01-source-access.probes.jsonl)（67 条逐 URL 记录：状态、content-type、字节数、耗时、重定向终址、缓存与限流头、错误码）。

范围变更：用户于 2026-11-04 14:23 移除 Claude Code，并明确不使用 DSH `web_search`；本票结论只保留其余来源。

1. **arXiv 能抓**：`export.arxiv.org/api/query`（Atom，`submittedDate` 区间实测 173 条 / 54s）+ `arxiv.org/html/<id>`（LaTeXML：`h2.ltx_title_section`、`p.ltx_para`、`figcaption.ltx_caption`、`math annotation[encoding="application/x-tex"]`、`div.ltx_listing` 均在）。限制：API ToU 每 3s 一次、robots `Crawl-delay: 15`、链路慢（单篇 6–13s）；PDF 仅降级。
2. **Hugging Face 官方直连不能**（TCP 超时）；**`hf-mirror.com/api/daily_papers?date=YYYY-MM-DD` 能**，返回 `upvotes` 降序的当日 29 篇 + `ai_summary`，`paper.id` 即 arXiv id → 热度在镜像、正文回 arXiv。该镜像 `robots.txt` 为 `Disallow: /`，属需显式豁免的第三方镜像；是否使用见 [是否允许 HF 镜像](11-hf-mirror.md)。PwC / arxiv-sanity / Semantic Scholar / alphaXiv 替代均不可用。
3. **Anthropic 能抓**：列表只能用 `sitemap.xml`（`/news/` 281、`/research/` 212、`/engineering/` 0；`/news` 页 283 条只 SSR 7 条）；正文取 `main#main-content` + `ld+json`（headline / datePublished 齐全）。
4. **DeepSeek 能抓且唯一官方双语**：`/news` 是软 404，靠 sitemap 的 `/news/newsYYMMDD` 发现；`…/news/<slug>.md` 与 `…/zh-cn/news/<slug>.md` 成对 → 免翻译直接对照。
5. **Kimi 能抓但只有英文**：`www.kimi.com/blog/` 的 `p.card-date` 给日期，正文取 `www.kimi.com/en/blog/<slug>` 的 `main.layout-content`；`/blog/<slug>` 302 到 `/en/`，未找到中文正文。
6. **OpenAI 列表能、全文不能**：RSS（1354 项，标题 + 一句 dek + pubDate，无 `content:encoded`）可做列表；文章页普通 UA / 浏览器头 / `web_fetch` 三种方式全部 403 → 只做「标题 + dek」节选级条目，不引入代理绕过；是否纳入见 [OpenAI 降级选择](12-openai-excerpt.md)。
7. **不可用就不做**：X（预留）、OpenAI 全文、HF 官方直连、GitHub 直连、arXiv PDF 主路径、Anthropic `/news` HTML 列表。
8. 仍不确定：arXiv `/html` 覆盖率与老论文 `ltx_ERROR`、PDF 文本层、镜像可信度与合规、HF 票数采集时点、DeepSeek 双语覆盖、Kimi 中文正文，以及各站 ToS 未逐条核对。
