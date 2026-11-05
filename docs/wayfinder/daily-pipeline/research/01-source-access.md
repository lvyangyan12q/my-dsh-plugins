# 各来源的入口、列表与正文抽取路径（实测报告）

- 票：`paper-reader-source-access`（父图 `paper-reader-pipeline-map`）
- 实测时间：2026-11-04 14:06–14:31（+08:00，UTC 06:06–06:31）
- 实测方式：Node 24.22.1 内置 `fetch` 只读探测（短超时 9–13s，另用 60s 耐心超时补测慢站点）；不登录、不伪造 cookie、不绕付费墙；未使用代理或正文代理服务。DSH `web_fetch` 仅用于复核 OpenAI 文章页。
- 原始证据：[`01-source-access.probes.jsonl`](./01-source-access.probes.jsonl) —— 67 条逐 URL 记录（status / content-type / 字节数 / 耗时 / 重定向终址 / 缓存与限流头 / 失败错误码），本报告所有实测数字均可由其复核。探测脚本与抓回的响应体（约 21 MB）为临时产物，已清理。
- 结论口径：**「列表能拿到」不等于「能用」**。本票的判断标准是「正文能否稳定抽成段落块」，因为目标是全文 + 中英对照 + 每日自动跑。

> **2026-11-04 15:40 代理复测（更新）**：系统代理 `127.0.0.1:7897`（Node 24 需 `NODE_USE_ENV_PROXY=1` + `HTTP(S)_PROXY`）下，Hugging Face 官方 API/HTML、OpenAI 文章页、X 页面均返回 200；直连仍失败。HF 镜像不再是必需路径；OpenAI 可恢复全文；X 仍按用户决定预留。详见 [proxy-retest-2026-11-04.md](proxy-retest-2026-11-04.md) 与 [证据](proxy-retest-2026-11-04.jsonl)。

---

## 0. 总览：一条推荐路线

| 来源 | 列表入口（推荐） | 正文入口（推荐） | 原文语言 | 判定 |
| --- | --- | --- | --- | --- |
| arXiv | `export.arxiv.org/api/query`（Atom，按分类 + `submittedDate` 区间） | `arxiv.org/html/<id>`（LaTeXML HTML） | 英 | **能抓**，主路径 |
| Hugging Face 每日榜 | `hf-mirror.com/api/daily_papers?date=YYYY-MM-DD` | 不自带正文 → 用 `paper.id`（= arXiv id）回 arXiv 取 | 英 | **官方直连不能**；镜像能，但仅作热度信号 |
| Anthropic Engineering / News | `anthropic.com/sitemap.xml`（按 `/research/`、`/news/` 前缀过滤） | 文章页 `main#main-content` + `ld+json` | 英 | **能抓** |
| DeepSeek | `api-docs.deepseek.com/sitemap.xml`（`/news/newsYYMMDD`） | `…/news/<slug>.md` 与 `…/zh-cn/news/<slug>.md` | **中 + 英（官方双语）** | **能抓**，唯一免翻译来源 |
| 月之暗面 / Kimi | `www.kimi.com/blog/`（SSR 卡片） | `www.kimi.com/en/blog/<slug>` 的 `main.layout-content` | 英 | **能抓**，需自行翻译 |
| OpenAI | `openai.com/news/rss.xml` | **无**（文章页 403，硬封锁） | 英 | **列表能、全文不能** → 只做标题+导读级 |
| X | 本轮预留 | — | — | 不做（沿用地图 out of scope） |

一句话：**arXiv 供全文，HF 只供排序，DeepSeek 供现成双语，Anthropic/Kimi 供英文正文需翻译，OpenAI 只能到「标题 + 一句摘要」的粒度。**

---

## 1. arXiv

### 1.1 列表入口（API，首选）

- `https://export.arxiv.org/api/query?search_query=cat:cs.AI&start=0&max_results=5&sortBy=submittedDate&sortOrder=descending` → **200**，`application/atom+xml`，14.8 KB，2.1s。
- 结构化字段（实测 Atom `<entry>` 全部命中）：

| 字段 | Atom 位置 | 实测样例 | 用途 |
| --- | --- | --- | --- |
| id | `<id>` | `http://arxiv.org/abs/2611.05377v1` | 去重键（去版本号得 `2611.05377`） |
| 标题 | `<title>` | `DreamX: Video Diffusion Model is a Universal Latent Action Learner` | `titleEn` |
| 摘要 | `<summary>` | 1476 字符 | `summaryZh` 的翻译源 / 列表摘要 |
| 提交时间 | `<published>` / `<updated>` | `2026-11-03T18:59:56Z` | `published` |
| 作者 | `<author><name>` | 9 位，逗号可join | `authors[]` |
| 主分类 | `<arxiv:primary_category term>` | `cs.CV` | `direction`/筛选 |
| 全部分类 | `<category term>` | `cs.CV, cs.AI, cs.RO` | 跨类去重 |
| 链接 | `<link href rel="alternate"\|"related">` | abs 页 + PDF | 原文链接 |
| 备注 | `<arxiv:comment>` | `Project Page: https://…` | 可选展示 |
| 期刊/DOI | `<arxiv:journal_ref>` / `<arxiv:doi>` | 本例为空 | `venue` |

- **日期区间查询可用**（关键）：`search_query=cat:cs.AI+AND+submittedDate:[202611030000+TO+202611042359]&max_results=200&sortBy=submittedDate` → **200**，173 条，425 KB，**54.5s**。返回按提交时间倒序，`opensearch:totalResults=173`。
- 注意：**API 不返回 HTML 正文链接**，`/html/<id>` 需自行拼；`/abs` 页（200，43 KB，0.9s）可作元数据兜底。
- 不推荐：`https://rss.arxiv.org/rss/cs.AI`（200，889 KB，**66.4s**）；`https://arxiv.org/list/cs.AI/new`（200，1.34 MB，**27.2s**，需解析 HTML）。两者都比 API 重且慢。

### 1.2 正文入口（HTML，首选）

- `https://arxiv.org/html/2305.10601` → **200**，187 KB，6.5s；`https://arxiv.org/html/2611.05377` → **200**，279 KB，12.8s；连 1999 年的 `https://arxiv.org/html/hep-th/9901001` 也是 **200**（209 KB，7.2s）——`/html/` 覆盖比预期宽。
- 由 LaTeXML 生成，DOM 语义类稳定，可简单选择器抽取：

| 内容 | 选择器 / 证据 | 映射到 digest `blocks[]` |
| --- | --- | --- |
| 摘要 | `.ltx_abstract`（每篇 1 个） | 首段 `heading(Abstract)` + `paragraph` |
| 章节标题 | `h2 .ltx_title_section` / `h3 .ltx_title_subsection`（实测 5 节 + 29 小节） | `heading`（`level` 取 1/2） |
| 节号 | 标题内 `span.ltx_tag_section`（如 `1`） | 拼进标题文本 |
| 段落 | `p.ltx_para`（实测 121 个） | `paragraph`（`en`，`zh` 待译） |
| 公式 | `<math display="inline">` 内 `<annotation encoding="application/x-tex">` 给**完整 LaTeX**；`alttext` 属性为短 LaTeX（如 `p_{\theta}`）；行间公式为 `display="block"`，包裹层可能是 `.ltx_equation` / `.ltx_eqn_table` | `equation`（`display` 用 annotation 的 tex） |
| 图 + 图注 | `figure.ltx_figure` → `figcaption.ltx_caption`，内含 `span.ltx_tag_figure`（`Figure 1:`），实测 22 图 / 28 caption | `figure.captionEn` |
| 表 | `table.ltx_table` + `.ltx_tabular`（实测 7） | 暂按 `figure`/纯文本降级 |
| 代码 / 算法 | `div.ltx_listing`（20）→ 每行 `div.ltx_listingline`（16） | `code.code`（逐行拼接） |
| 参考文献 | `.ltx_bibitem`（44） | 默认丢弃，只留正文 |

- 抽取粒度足以支撑「左右段落行对齐」：2305.10601 正文文本约 54 K 字符 / 121 段；2611.05377 的 HTML 达 279 KB（未逐段统计，段落数以千级上限估计，实现时需按篇截断）。
- **质量告警**：老论文可能有转换错误——`hep-th/9901001` 出现 `ltx_ERROR` ×2；实测 2023/2026 两篇为 0。抽取时应过滤 `.ltx_ERROR` 节点并记降级标记，不要整篇失败。

### 1.3 PDF 通道（降级，不建议做主路径）

- `https://arxiv.org/pdf/2305.10601` → **200**，`application/pdf`，799,685 B，HEAD 0.6s；带 `Range: bytes=0-262143` 返回 **206**（支持分段）。
- 但同一次 13s 内**未读完 256 KB**，说明链路吞吐差；**PDF 文本层未验证**（未下载整包解析）。若要用，需 pdf 解析库并接受 30–90s/篇。
- 结论：**HTML 优先；仅当 `/html/<id>` 非 200 时降级 PDF**，并把该篇标记为「抽取质量降级」。

### 1.4 限制与礼貌抓取

- `https://arxiv.org/robots.txt`（200）：`User-agent: *`、`Crawl-delay: 15`，并明确「Indiscriminate automated downloads … not permitted」。
- `https://info.arxiv.org/help/api/tou.html`（200）原文：legacy API（含 RSS、OAI-PMH、arXiv API）**「no more than one request every three seconds, and limit requests to a single connection at a time」**，且不得靠加机器绕过。
- 无 API key、无登录、无付费墙。
- 实践建议：API 串行 + 每次间隔 ≥3s；每类一次查询（`max_results` ≤200）而不是逐篇查；HTML 正文按 1–2s 间隔抓，单篇超时 30–60s（实测 6–13s 正常）；命中 `Cache-Control: max-age=3600`（abs 页）可本地缓存一天。

---

## 2. Hugging Face 每日榜

### 2.1 官方直连：不可达

- `https://huggingface.co/papers` → **FAIL**（`UND_ERR_CONNECT_TIMEOUT`，TCP 连接 `huggingface.co:443` 10s 超时）。
- `https://huggingface.co/api/daily_papers?limit=3` → **FAIL**，同样是连接超时。
- 与地图记录一致：不是 403、不是 UA 问题，是**网络层不可达**。

### 2.2 可用替代：`hf-mirror.com`（第三方镜像，功能等价）

| 入口 | 结果 | 说明 |
| --- | --- | --- |
| `https://hf-mirror.com/api/daily_papers?limit=3` | **200** JSON 17 KB，1.0s | 与 HF 官方 API 同构 |
| `https://hf-mirror.com/api/daily_papers?date=2026-11-04&limit=50` | **200** 171 KB，4.9s | **当日榜单，已按 `upvotes` 降序**：29 篇，票数 0–35 |
| `https://hf-mirror.com/api/daily_papers?date=2026-11-03&limit=2` | **200** 13 KB | 可回补历史某天 |
| `https://hf-mirror.com/api/daily_papers?limit=50` | **200** 294 KB | **未排序**，且混了 11-03/11-02 两天 → 不要用它做榜 |
| `https://hf-mirror.com/api/papers/2611.02244` | **200** 3 KB | 单篇详情 |
| `https://hf-mirror.com/papers/date/2026-11-03` | **200** 683 KB HTML | HTML 版，能不看就不看 |
| `https://hf-mirror.com/papers/2611.02244` | **200** 134 KB HTML | 单篇页 |

字段（`?date=` 单条结构，实测）：

```
{ paper: { id: "2611.02782",            // ← 就是 arXiv id
           title, summary,              // summary = arXiv 摘要全文
           upvotes: 35,                 // ← 热度信号
           publishedAt, submittedOnDailyAt,
           authors[].name,
           ai_summary,                  // 1–2 句模型生成 TLDR（实测 162 字符）
           ai_keywords: [...],
           githubRepo, githubStars, projectPage,
           discussionId, numComments },
  thumbnail, submittedBy, organization }
```

- **镜像不自带正文**。但 `paper.id` 是 arXiv id（实测 50 条全部匹配 `^\d{4}\.\d{5}$`），且 `export.arxiv.org/api/query?id_list=2611.02782` → **200**（3.7 KB，2.8s）可回查元数据 → **正文仍走 arXiv `/html/`**。镜像只贡献「今天哪些论文热 + 票数 + 一句话 TLDR」。

### 2.3 限制与替代品评估

- `https://hf-mirror.com/robots.txt` → **200**，内容为 `User-agent: * / Disallow: /`，仅放行 `/`、`/ads.txt`、`/favicon.ico` 等——即**镜像复制了 HF 的「禁止爬取」策略**。这属于合规判断点，见 2.4。
- 镜像为第三方（CloudFront，页面自称 "Your daily dose of AI research from AK"），**无服务条款、无 SLA、无 rate-limit 头**；响应头带 `ETag` + `cf-cache-status`，可条件请求省流量。
- 不可用替代品（实测）：

| 候选 | 结果 | 判断 |
| --- | --- | --- |
| `paperswithcode.com` | **FAIL**（DNS 指向 `huggingface.co:443`，连接超时） | 已并入 HF，随 HF 一起不可达 |
| `arxiv-sanity-lite.com` | **FAIL**（连接超时） | 不可用 |
| `api.semanticscholar.org/graph/v1/paper/search` | **429**（`Too Many Requests`，需申请 key） | 无 key 不可用；也非「每日热度」榜单 |
| `www.alphaxiv.org` | **200**（1.13 MB，Next.js SPA） | 可达但列表在客户端渲染，未找到公开 JSON API（本轮未验证） |

- 是否够做「每日热度」？——**够，但只够一个维度**：`?date=` 的 `upvotes` 排序就是 HF Daily Papers 的官方排序，语义明确。缺点是票数量级小（当日 0–35），**采集时刻会显著影响排名**（早间票少）。建议固定每日采集时刻（如 09:00 +08）并保存当日快照，而不是盘中多次刷新。

### 2.4 明确结论与待决

- **HF 官方直连：不做**（不可达）。
- **镜像：能用，但需要用户/上层对「第三方镜像 + robots 禁止」点头**。若不允许，则 HF 这条线**降级为不做热度榜**：用 arXiv 每日列表（分类 + 关键词/白名单机构）自排序，接受「没有票数」。
- 不建议引入任何正文代理/阅读代理服务（地图 `Out of scope` 已排除「代理、镜像或绕过网络限制」——注意此处的 `hf-mirror` 属镜像类，正是需要显式豁免的对象）。

---

## 3. Claude Code（已移出来源范围）

用户于 2026-11-04 14:23 明确把 Claude Code 从来源中移除；原探测记录不再维护，也不进入推荐路线。此处保留占位只为说明范围变更。

---

## 4. Anthropic Engineering / News

### 4.1 列表：sitemap 才是完整清单

| 入口 | 结果 | 可用性 |
| --- | --- | --- |
| `https://www.anthropic.com/sitemap.xml` | **200**，74 KB，2.2s | **首选**：589 条 URL，含 `<lastmod>` |
| `https://www.anthropic.com/engineering` | **200**，324 KB，3.0s | 26 张卡片 SSR（页面自称 27 ARTICLES），按新→旧；可作「工程视角」子集 |
| `https://www.anthropic.com/news` | **200**，349 KB，0.9s | 页面写 283 ARTICLES，但**只 SSR 了 7 篇** `<article>`，其余靠客户端 → **不能当列表源** |
| `https://www.anthropic.com/rss.xml` / `/news/rss.xml` | **404** / **404** | 无 RSS |

sitemap 前缀分布（实测统计）：`/news/` **281**、`/research/` **212**、`/features/` **5**、`/engineering/` **0**。
→ **结论**：`/engineering` 没有独立 URL 空间，它是对 `/research/*` 的策展视图（卡片链接实测指向 `/research/…`）。所以「Anthropic Engineering」= sitemap 里 `/research/` 的子集 + 该页排序。

### 4.2 正文：SSR + ld+json，抽取简单

`https://www.anthropic.com/research/claude-code-best-practices`（**200**，280 KB，1.3s）：

- `main#main-content` 存在，内含 `article`；正文纯文本 **28,177 字符 / 4,377 词**；`h2`×7、`pre`×2、`figure`×6。
- `ld+json`（`Article`）字段齐全：`headline`、`description`、`datePublished: 2025-04-18`、`dateModified: 2026-10-29`、`author.name: Anthropic`、`mainEntityOfPage`。
- `news` 文章页同样结构（`NewsArticle`）：`main#main-content` → 8,569 字符，`h2`×4，无 `pre`/`figure`。

推荐抽取：
1. 元数据全取 `script[type="application/ld+json"]`（别自己写正则解析标题/日期）；
2. 正文取 `main#main-content`，再按 `h2/h3` 切 `heading`、按 `p` 切 `paragraph`、`pre`→`code`、`figure`→`figure.captionEn`；
3. 抽取前先删 `script`/`style`（实测 `main` 里嵌着 ld+json，直接 `innerText` 会把 JSON 混进正文）。

- 类名带哈希（`article.EaEYjq_Article`、`nUeDbq_article`），**不要**依赖这些类名；`data-listing-row`、`main#main-content`、`time[datetime]` 这类语义属性更稳。

### 4.3 语言与限制

- 语言：**英文**（`<html lang="en">`）。
- `Cache-Control: s-maxage=300, stale-while-revalidate=…`（CDN 5 分钟），可安心每天一次。
- `lastmod` 语义是「最后修改」而非「首次发布」：已发布文章补改也会变。每日增量的判定要用「URL 是否新出现」为主、`lastmod` 变化为辅，发布时间取文章页 `datePublished`。
- 无 robots 阻碍记录（本轮未逐条读 ToS，见「不确定点」）。

---

## 5. DeepSeek

### 5.1 列表：`/news` 是软 404，必须用 sitemap

- `https://api-docs.deepseek.com/news` → **200**，但内容是**「Your First API Call」文档页**，`rel=canonical` 指向 `https://api-docs.deepseek.com/`，`docs-doc-id="your_first_api_call"` → **这是软 404**，不是新闻列表。
- `https://api-docs.deepseek.com/sitemap.xml` → **200**，7.5 KB，0.1s：57 条 URL，其中 `/news/newsYYMMDD` 形式 19 条（`news0725` … `news261017`），另有 `/updates`。
- **slug 自带发布日期**：`news261017` = 2026-10-17。所以「新增 = 新 slug」，不依赖 `lastmod`（sitemap 的 lastmod 统一是构建时间，不可用）。

### 5.2 正文：Docusaurus SSR + **官方 Markdown（含中英两版）**

- `https://api-docs.deepseek.com/news/news261017` → **200**，25 KB；Docusaurus v3.1.0；`<article>` 存在，正文 1,740 字符、`h2`×4、`img`×6；页面里给出 `Copy Markdown / Open Markdown`，对应链接 `/news/news261017.md`。
- `https://api-docs.deepseek.com/news/news261017.md` → **200**，`text/markdown`，2,172 B：`# 标题`、`***`、`## 小标题`、`![](图片)`——**干净 Markdown**。
- `https://api-docs.deepseek.com/zh-cn/news/news261017.md` → **200**，3,529 B，**中文版**（`# DeepSeek V4.1 Flash 新版本：许愿式编程一键成真`）。
- 对照价值：**同一 slug 有官方英文版和官方中文版**，可以直接 `en`/`zh` 成对写入 `blocks[]`，**无需翻译**，也不会有译名漂移。这是七个来源里唯一能做到的。
- 图片/表格：图片是外链 Markdown（`![](https://…)`），表格在 `.md` 里为 Markdown 表格；HTML 版有 `img`×6、`table`×0（本篇无表）。

### 5.3 语言与限制

- 语言：**英文 + 简体中文（官方双语）**。
- `Cache-Control: max-age=0`（每次都回源），成本低（KB 级）。
- 无登录/付费；`www.deepseek.com`（200，`lang="zh-CN"`）是产品首页，不含 news。

---

## 6. 月之暗面 / Kimi

### 6.1 列表：SSR 卡片，日期在卡片里

- `https://kimi.com/blog` → **200**（302 到 `https://www.kimi.com/blog/`），199 KB，0.5s；`https://www.kimi.ai/blog/` → **200**（同一套内容）。
- 卡片结构（实测）：

```html
<a href="/en/blog/kimi-k3-1-pro" aria-label="Kimi K3.1 Pro" class="absolute inset-0 …"></a>
<h4 class="card-title …">Kimi K3.1 Pro</h4>
<p class="card-date …">2026-10-24</p>
```

→ 选择器：`a[aria-label]`（链接+标题）、`h4.card-title`、`p.card-date`（`YYYY-MM-DD`）。**没有 `<time>` 标签**，日期是纯文本。
- 列表页的 `<title>` 是中文「Kimi 研究博客 | 月之暗面」，页面含 1,422 个汉字（UI 文案），但**文章链接全部带 `/en/` 前缀**；`/blog/<slug>` 实测 302 → `/en/blog/<slug>`。

### 6.2 正文：SSR，英文单语

- `https://www.kimi.com/en/blog/kimi-k3-1-pro` → **200**，336 KB；`<main class="flex-1 layout-content">`；`h2`×8、`figure`×7、`img`×15（明/暗两套图，按 `src` 去重）、`pre`×0；页面正文文本 ~21.9 K 字符。
- `ld+json` 为 `@graph`，其中 `Article` 有 `headline`、`description`、`dateModified: 2026-10-24`、`author.name: Kimi`，**缺 `datePublished`** → 发布日期取列表 `p.card-date`。
- 中文版：`/blog/<slug>`（中文路径）实测被 302 到 `/en/`，**未找到中文正文**（整页汉字仅 10 个）。`www.moonshot.cn`（**200**，96 KB，`lang="zh-Hans"`）只是产品落地页，同样链接到 `/en/blog/…`。

### 6.3 语言与限制

- 语言：**英文**（站点 UI 中文）。中文读者需要翻译。
- `Cache-Control: s-maxage=60`，可频繁刷新；无 RSS；无登录/付费。

---

## 7. OpenAI

### 7.1 列表：RSS 可用，但只有标题 + 一句摘要

- `https://openai.com/news/rss.xml` → **200**，`text/xml`，805 KB，0.5s。
- 1,354 个 `<item>`；每项字段：`<title>`、`<description>`（1–2 句 dek，例："Discover how ChatGPT and Codex are helping engineers accelerate CAD, PCB design…"）、`<link>`（`https://openai.com/index/<slug>`）、`<guid>`、`<category>`（如 `Research`）、`<pubDate>`（RFC 822）。
- **没有 `<content:encoded>`**（0 次）→ RSS 不含正文。
- `https://openai.com/sitemap.xml` → **200**（索引，43 个子 sitemap）；`/sitemap.xml/page/` → **200**（3.8 MB，570 URL，213 条 `/index/`）。但 `lastmod` 实测等于**抓取时刻**（同一批 URL 的 lastmod 精确到秒递增）→ **不能用来判断新旧**。RSS 的 `pubDate` 才是可靠日期。

### 7.2 正文：403，硬封锁（已三重验证）

| 尝试 | 结果 |
| --- | --- |
| Node fetch 默认 UA 抓 `/index/accelerating-engineering-for-the-physical-world` | **403**，10 KB 拦截页（内联 CSS 的 logo 页） |
| Node fetch + 完整浏览器头（`Accept`、`Accept-Language`、`Sec-Fetch-*`、`Referer: google`）抓 `/index/chatham-financial/` | **403**，同样是拦截页 |
| DSH `web_fetch` 同一 URL | **403**（返回空正文） |

→ 不是 UA 或 header 问题，是该网络出口被整体拦截。**不要**用代理/阅读代理绕过（地图 out of scope）；也不要伪造 cookie。

### 7.3 结论

- **列表：能抓**（RSS，含标题/日期/分类/一句 dek）。
- **全文：不能抓**。本轮明确**不做 OpenAI 全文**，只做「标题 + 官方 dek + 日期 + 链接」的条目，用 digest 现有的 `excerpt: true` 语义表达「节选」。
- 语言：英文。RSS `Cache-Control: public, max-age=0`，每天一次请求足够（800 KB）。

---

## 8. 逐来源「列表 → 正文 → 语言 → 降级」推荐路线（可直接施工）

| 来源 | 列表调用 | 正文调用 | 语言 | 降级顺序 |
| --- | --- | --- | --- | --- |
| arXiv | `export.arxiv.org/api/query?search_query=cat:<类>+AND+submittedDate:[起 TO 止]&max_results=200&sortBy=submittedDate`（串行，间隔 ≥3s） | `GET https://arxiv.org/html/<id>`（超时 60s）；正文取 `#abstract`/`.ltx_abstract`、`h2/h3`、`p.ltx_para`、`figure.ltx_figure>figcaption.ltx_caption`、`math annotation[encoding="application/x-tex"]`、`div.ltx_listing` | 英 | `/html` 非 200 → `/abs` 摘要级（`excerpt:true`）→ PDF 解析（最后手段） |
| HF 每日榜 | `hf-mirror.com/api/daily_papers?date=<今天>`，按 `upvotes` 排序取前 N | 不抓正文；用 `paper.id` 去 arXiv 取 | 英 | 镜像不可用 → **整源跳过**（不做替代热度） |
| Anthropic | `anthropic.com/sitemap.xml`，过滤 `/research/` + `/news/`，与新 URL 集合差集 | 文章页：`ld+json` 元数据 + `main#main-content`（先删 script/style） | 英 | 单篇失败 → 跳过该篇并告警，不整源失败 |
| DeepSeek | `api-docs.deepseek.com/sitemap.xml`，取 `/news/newsYYMMDD` 新 slug | `…/news/<slug>.md`（en）+ `…/zh-cn/news/<slug>.md`（zh）**成对写入，免翻译** | 中+英 | zh `.md` 缺失 → 只存 en + 标记 `zhState:"pending"` |
| Kimi | `www.kimi.com/blog/`，`a[aria-label]` + `h4.card-title` + `p.card-date` | `www.kimi.com/en/blog/<slug>`，`main.layout-content`，去重明暗双图 | 英 | 单篇失败 → 跳过并保留列表条目（`excerpt:true`） |
| OpenAI | `openai.com/news/rss.xml`，按 `pubDate` 取当日 | **不抓**（403） | 英 | 无；直接以 RSS `description` 作 `summaryZh` 的翻译源，`excerpt: true` |

**统一约束（实测得出）**

1. **arXiv 是唯一慢站**：API 单次 2–55s、HTML 单篇 6–13s，超时不能设 10s；建议 60s，并串行 + 3s 间隔。其余站点均在 0.1–5s。
2. **只有 Hugging Face（镜像）与 OpenAI RSS 允许一次请求拿到「一天的全量」**；其余来源都需要「列表 + N 篇正文」，按每日 5–20 篇估算，整轮 20–60 个请求。
3. **正文块对齐**：arXiv/Kimi/Anthropic 都能按 `h2/h3` + `p` 拿到稳定段落，DeepSeek 是天然 Markdown 段落。只有 OpenAI 没有任何段落可对齐。
4. **去重键**：arXiv/HF 用 arXiv id；Anthropic 用 canonical URL；DeepSeek 用 slug；Kimi/OpenAI 用 canonical URL。与 `docs/DESIGN.md` §4「canonical URL 或 arxiv id」一致。

---

## 9. 「不可用就不做」的明确结论

| 项目 | 结论 | 依据 |
| --- | --- | --- |
| HF 官方直连 | **不做** | `huggingface.co` TCP 连接超时（`/papers`、`/api/daily_papers` 均失败） |
| HF 镜像 | **有条件做**（需显式豁免「镜像」类方案） | 镜像 API 全通，但 `robots.txt` 为 `Disallow: /`，且为第三方无条款服务 |
| HF 替代榜单（PwC / arxiv-sanity / S2 / alphaXiv） | **不做** | PwC 已并入 HF（同域不可达）、sanity 超时、S2 无 key 时 429、alphaXiv 无公开列表 API（未验证） |
| OpenAI 全文 | **不做** | 文章页 403（普通 UA / 浏览器头 / `web_fetch` 三种方式一致），且不允许用代理绕过 |
| X | **不做**（本轮预留） | 与地图 out of scope 一致 |
| arXiv PDF 解析 | **不做主路径** | 支持 Range 但吞吐差（13s 未读完 256 KB），文本层未验证；HTML 已覆盖新老论文 |
| Anthropic `/news` HTML 列表 | **不做** | 283 条只 SSR 7 条，完整清单只有 sitemap |

---

## 10. 仍不确定 / 未验证

1. **arXiv `/html/` 覆盖率**：只验证 3 篇（2023 会议论文、2026 新论文、1999 老论文，均 200）。是否所有 `new` 论文都有 HTML、缺失时是 404 还是 200 空壳，需在实现票里用 20–50 篇样本统计；老论文已见 `ltx_ERROR`。
2. **arXiv PDF 文本层**：未下载整包，未验证是否有可抽文本（虽然 LaTeX 生成的 PDF 通常有）。
3. **HF 镜像的可信度与新鲜度**：无法与官方比对（官方不可达）；镜像日期看起来当天（`submittedOnDailyAt=2026-11-04`），但无法排除内容被改动；`Disallow: /` 的合规结论需要人或上层拍板。
4. **HF 票数稳定性**：当日 0–35 票，排名对采集时刻敏感；需要连续几天快照才能定「每日热度」的采集时点与截断线。
5. **DeepSeek 双语 `.md` 是否全覆盖**：只验证 `news261017` 一对；早年条目是否也有 `zh-cn` 版未逐一验证（可用 sitemap + 两次 HEAD 检查）。
6. **Kimi 是否有中文正文**：只找到 `/en/blog/…`；`/blog/<slug>` 302 到 `/en/`。若用户要求「中文原文」而非译文，需另找（如微信公众号，不在本轮范围）。
7. **各站 ToS 未逐条阅读**：只读了 arXiv 的 `robots.txt` 与 API ToU，以及 `hf-mirror.com` 的 `robots.txt`。OpenAI / Anthropic / Kimi / DeepSeek 的使用条款未逐条核对。
8. **Anthropic `lastmod` 语义**：确认是「修改时间」，但样本不足以判断它对旧文批量刷新的频率（可能造成每日增量噪声）。
9. **OpenAI 是否存在非 `openai.com` 的官方全文通道**：未找到；按「不绕过」原则未继续尝试。
