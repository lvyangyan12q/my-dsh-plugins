---
id: paper-reader-pipeline-spec
title: 每日论文与博客抓取、中英对照阅读工具规格
labels: [ready-for-agent]
status: open
---

# 每日论文与博客抓取、中英对照阅读工具规格

## Problem Statement

需要每天跟进 AI 领域的新论文与官方博客，但来源分散在 arXiv、Hugging Face 每日榜、Anthropic、DeepSeek、月之暗面（Kimi）、OpenAI；打开、筛选、复制、翻译、对照要花大量时间。现有 DSH 插件只能读取一份手工维护的 `digest.json`，采集、全文抽取、翻译、定时与失败恢复都不存在，所以页面是空的或只有示例数据。

## Solution

提供一个本地可运行的完整工具：

- 每日定时抓取上述来源的最新内容，按重要度选出**最多** 10 条（不足不凑数）；
- 抽取全文（标题、段落、公式、图注、代码），保留原文；
- 生成原文/译文成对内容；中文来源也能以中文原文 + 英文译文阅读；
- 写入按天组织的 digest 与索引；
- DSH 插件读取后，在中英对照 / 仅中文 / English 三种模式下阅读，支持搜索、方向与来源筛选、历史。

网络受限的来源（Hugging Face 官方、OpenAI 文章页）通过用户显式配置的代理访问；代理不可用时降级并明确标注，不静默失败。X 本轮不接入。

## User Stories

1. 作为读者，我希望每天 09:00 自动抓取最新内容，这样我不需要手动巡回来来源。
2. 作为读者，我希望左栏按天分组当天条目，这样我能先扫一遍再决定读哪篇。
3. 作为读者，我希望看到每条内容的来源、发布时间、方向与阅读时长，这样我能快速判断相关性。
4. 作为读者，我希望 Hugging Face 每日榜按票数排序，这样热度高的论文不会漏掉。
5. 作为读者，我希望 arXiv 的新论文按分类与关键词筛选，这样我不必翻完当天全部论文。
6. 作为读者，我希望 Anthropic 的新文章自动进入列表，这样我不会错过 Claude 相关的工程与研究内容。
7. 作为读者，我希望 DeepSeek 的中英官方内容直接成对展示，这样不需要额外翻译。
8. 作为读者，我希望 Kimi 的英文博客被翻译成中文，这样我能用中文快速理解。
9. 作为读者，我希望 OpenAI 的全文在代理可用时被抓取，这样我不用离开阅读页。
10. 作为读者，我希望 OpenAI 全文不可得时仍能看到官方标题与摘要，并明确看到「节选」标记。
11. 作为读者，我希望同一条论文只出现一次，这样列表不被 arXiv/HF 重复项污染。
12. 作为读者，我希望每天条目数量可控，这样我不会被几十篇全文淹没。
13. 作为读者，我希望点开条目就能读全文，而不是跳转外站。
14. 作为读者，我希望中英对照按段落逐行对齐，这样长文也不会错位。
15. 作为读者，我希望中文来源的对照是「中文 | 英文」，而不是强行英文在左。
16. 作为读者，我希望「仅中文」和「English」是目标语言视图，这样切换模式符合我的阅读目的。
17. 作为读者，我希望公式、图、代码只出现一次，这样对照模式不会重复占屏。
18. 作为读者，我希望翻译中的段落有明确占位，这样我不会把缺失当成原文。
19. 作为读者，我希望按标题、作者、关键词搜索，这样我能找回读过的内容。
20. 作为读者，我希望按方向与来源筛选，这样我能只看 Agent 或只看 Anthropic。
21. 作为读者，我希望已读与收藏状态在刷新后保留，这样我能继续昨天的阅读。
22. 作为读者，我希望浏览最近 7 天的内容，并可加载到 30 天前，这样短期回顾不必翻文件。
23. 作为读者，我希望代理不可用导致某来源缺失时看到原因，这样我不会误以为当天没有新内容。
24. 作为读者，我希望某个来源抓取失败不影响其他来源，这样一次故障不会让整页空白。
25. 作为读者，我希望看到最近一次运行的耗时、条数与失败来源，这样我能判断数据是否新鲜。
26. 作为读者，我希望需要时能手动补跑一次，这样定时任务错过或失败后可以恢复。
27. 作为读者，我希望插件安装后只需配置一次，不需要每天启动脚本。
28. 作为读者，我希望断网或代理故障时仍能看到上一份 digest，而不是错误页。
29. 作为读者，我希望代理与模型密钥不出现在 digest、页面或日志明文里，这样分享数据不会泄密。
30. 作为维护者，我希望来源、配额、代理、翻译模型都通过配置调整，不改代码即可换环境。

## Implementation Decisions

### 架构

- **独立 CLI + DSH Schedule 包装**：抓取、抽取、翻译、写 digest 由确定性 Node CLI 完成；DSH Schedule 每日 09:00 创建新会话，只负责运行 CLI、校验结果与汇报失败，不把长文塞进 agent 上下文。
- CLI 可手动运行，同一入口支持 `--date`、`--dry-run`、`--source` 等参数；退出码只在「当日一个文件都没写成」时非零。
- 运行记录写入 `$DSH_HOME/paper-reader/runs/YYYY-MM-DD.json`，包含各来源状态、请求数、条数、翻译 token、耗时与跳过原因。

### 来源适配

- 适配器契约：`list()` 返回候选（id、标题、URL、时间、来源、热度/分类），`extract()` 返回结构化全文块；每个来源独立开关与超时。
- arXiv：官方 Atom API 按分类与 `submittedDate` 查询；正文取 LaTeXML HTML（标题、段落、公式、图注、代码）；HTML 缺失回退 `/abs` 摘要级并标 `excerpt`；PDF 只作最后手段。
- Hugging Face：官方 API 按 `?date=YYYY-MM-DD` 拿当日榜，`upvotes` 排序；`paper.id` 作为 arXiv id，正文回 arXiv；代理不可用时整源跳过并记录。
- Anthropic：`sitemap.xml` 发现新文章，正文取服务端渲染主体与结构化元数据；单篇失败跳过并告警。
- DeepSeek：sitemap 发现新闻，官方英文/中文 Markdown 成对写入，**免翻译**；官方缺一侧时保持 `pending`，绝不调用翻译模型。
- Kimi：博客列表按发布日期发现，正文取英文页；生成中文译文。
- OpenAI：RSS 做列表；代理可用时抓文章页 SSR 全文；不可用时只保留标题 + 官方 dek 的节选条目。**条款复核前默认关闭（opt-in）**：用户显式设置 `sources.openai.enabled=true` 才纳入每日运行；复核通过后再改默认值。
- X：声明占位，不实现抓取。

### 选择与配额

- 默认每日**最多** 10 条（上限，不是目标值；候选不足时按实际条数写入，不补足）：论文最多 6（HF 先按 `upvotes`，再看关键词/来源权重；arXiv 去重补足），博客/公告最多 4（各来源按发布时间取最新、轮转分配）。
- 去重：arXiv id 优先，其次 canonical URL，最后标题指纹。
- 配额、来源权重、每源上限、关键词/机构白名单都在配置中，可改而不改代码：
  - `selection.sourceWeights` 是 `{ sourceId: number }` 的加性相关度权重，在票数与关键词之后参与排序；
  - `selection.institutions` 是机构白名单：候选声明了机构且全部不匹配时被过滤；未声明机构的候选保留（与分类过滤同一条「不拿无法满足的规则过滤」原则）。
- 全文翻译只针对入选条目；未入选不进入当日 digest。

### 代理

- 代理必须显式配置：环境变量 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`，或插件配置中的代理 URL；不硬编码、不默认读系统代理。
- 配置里的 `proxy.url` 在 CLI 中可用：Node 24 只有在进程启动前设置 `HTTP(S)_PROXY` 且 `NODE_USE_ENV_PROXY=1` 时才让 `fetch` 走代理，因此 CLI 入口检测到配置 URL 时用同一命令**自重启一次**并导出这些环境变量；不新增代理依赖，测试只覆盖重启决策与参数，不连接真实代理。
- 只对直连失败的来源启用（HF 官方、OpenAI 文章页）；arXiv/Anthropic/DeepSeek/Kimi 直连优先。
- 每日运行先做代理健康检查；失败时跳过受影响来源并写入状态，不回退直连硬闯、不静默失败；代理凭据不落盘到 digest 或日志明文。

### 翻译

- OpenAI 兼容 Chat Completions 端点：`PAPER_READER_LLM_BASE_URL`、`PAPER_READER_LLM_API_KEY`、`PAPER_READER_LLM_MODEL`；默认指向用户配置的 DeepSeek 兼容端点。
- 段落级批量翻译（每批 6–12 块，保留块 id 映射），不整篇单次请求；标题、图注、公式说明分别处理；公式主体与代码不翻译。
- 术语表（模型名、方法名、缩写）参与 system prompt，版本进入缓存键。
- 缓存键：`sha256(原文 + 目标语言 + 模型 + 术语表版本)`；跨天复用。
- 单块失败重试 2 次，仍失败写 `translation: null` 与 `translationState: "pending"`；不阻塞其他块。
- DeepSeek 官方双语条目是**最终文本**，整条跳过翻译服务（不进 batch、不计 token）；官方缺一侧时保持 `pending`。
- 每日 token 预算可配置（默认 300k）；超限后剩余条目 pending，并在 run 记录与页面标注。
- 中文来源：DeepSeek 直接用官方双语；其他中文来源生成英文译文。

### 数据契约 v2

```json
{
  "schemaVersion": 2,
  "date": "2026-11-05",
  "generatedAt": "2026-11-05T09:02:00+08:00",
  "run": { "status": "ok", "finishedAt": "…", "sources": [{ "id": "arxiv", "status": "ok", "items": 5 }] },
  "items": [
    {
      "id": "arxiv:2611.05377",
      "sourceId": "arxiv",
      "sourceLanguage": "en",
      "title": { "original": "…", "translation": "…" },
      "summary": { "original": "…", "translation": "…" },
      "authors": ["…"],
      "venue": "arXiv cs.CL",
      "url": "https://arxiv.org/abs/2611.05377",
      "publishedAt": "2026-11-04T18:59:56Z",
      "collectedAt": "2026-11-05T09:02:00+08:00",
      "direction": "agent",
      "tags": ["…"],
      "readingMinutes": 12,
      "excerpt": false,
      "excerptReason": { "code": "proxy_unavailable", "message": "…" },
      "translationState": "complete",
      "blocks": [
        { "type": "heading", "level": 1, "original": "Abstract", "translation": "摘要" },
        { "type": "paragraph", "original": "…", "translation": "…" },
        { "type": "equation", "display": "…", "note": { "original": "…", "translation": "…" } },
        { "type": "figure", "caption": { "original": "…", "translation": "…" } }
      ]
    }
  ]
}
```

- **契约字段（v2 的一部分，非扩展）**：`sourceId`（唯一来源键，不再写 `source`）、`publishedAt`（ISO 8601；日期型来源写成当天 00:00:00Z）、`authors`、`venue`、`readingMinutes`、`excerptReason`（`{ code, message?, detail? }`）。`published` 只作为旧文件的读取别名，写入不再产生。
- 旧字段（`en`/`zh`、`titleEn`/`titleZh`、`source`、`published`）在迁移期可作为读取别名，但写入统一用 v2；示例与测试同步更新。
- 索引文件记录日期列表、条数、各来源状态与最新运行；页面用它加载最近 7 天。

### 存储与路由

- 每天一个文件：`paper-reader/digest/YYYY-MM-DD.json`；索引：`paper-reader/index.json`；运行记录：`paper-reader/runs/YYYY-MM-DD.json`；保留 30 天，过期清理不阻塞当天写入。
- 跨天发现状态：`paper-reader/state/sources.json` 记录每个来源已提供的 URL 及其首次出现日期（Anthropic sitemap 等），使「新文章」按 URL 差集判定，而不是每天重复整个归档；状态写入失败只告警，不失败当天。
- 原子写入：临时文件 + rename；索引最后更新；单日文件上限 8 MiB，运行记录上限 1 MiB，超限则该文件失败并保留上一份。
- 宿主路由：索引、按日期取 digest、运行状态、健康检查；沿用浏览器会话鉴权；只读，不创建或迁移用户数据。

### 阅读页

- 对照模式固定「原文 | 译文」，列顺序由 `sourceLanguage` 决定；「仅中文 / English」按目标语言取文本。
- 语言中性块（公式、图、代码）只渲染一份；缺失译文显示占位或原文回退并标注。
- 左栏新增来源筛选，与方向、搜索、收藏叠加；来源/方向标签显示在当前其他筛选下的计数，叠加后为空时显示空状态与「清除搜索与筛选」；选择持久化。条目显示来源、节选/代理降级标记。
- 历史导航：默认加载最近 7 天，可继续加载更早；阅读状态按条目 id 保存在浏览器。
- 最近运行状态与失败来源在页面可见；不在页面内直接触发抓取。

### 调度与运维

- DSH Schedule 每日 09:00（本地时区）新建会话运行 CLI；错过/失败后按用户手动补跑，不自动重放历史。
- 安装/升级/回退文档与版本锁定跟随插件；DSH 版本固定在已验证范围。
- 代理健康检查、模型凭据检查在运行开始时执行；失败项写入 run 记录并影响页面状态。

## Testing Decisions

- **只测外部行为**：选择/去重/配额的结果、抽取后的块结构、翻译对齐与状态、文件与索引内容、路由响应、页面在三种模式下的可读性；不断言内部函数拆分或私有字段。
- **一个高位接缝**：CLI 的 `run` 入口注入 fetch、LLM、时钟、文件系统端口；绝大多数行为在 fixture 上验证，不访问真实网络。其次是宿主路由与阅读页组件。
- **适配器 fixture**：每个来源保存真实响应的最小样本（Atom、HF JSON、Anthropic HTML、DeepSeek 双语、Kimi/OpenAI HTML），断言列表字段、正文块、语言与降级。
- **纯逻辑**：选择/配额/去重、代理解析与健康判断、翻译缓存键、digest 校验与原子写、索引合并。
- **宿主路由**：索引/按日 digest/健康检查/鉴权拒绝/文件缺失/损坏/超限，沿用现有 `node:test` 风格。
- **阅读页**：jsdom + React 渲染，覆盖英文源与中文源的对照顺序、三种模式、来源/方向筛选（叠加、计数、空结果、持久化）、历史加载、pending 与代理降级提示。
- **端到端**：本地 fixture 源 + 假 LLM，跑 CLI → 写文件 → 宿主读取 → 页面渲染；断言条数、去重、配额、pending、索引与清理。
- **人工冒烟**：真实网络与代理、真实模型调用作为发布前可选验收，不进入默认 CI；结果记录在实施票。
- 参考现有 `test/host.test.mjs` 与客户端 jsdom 冒烟。

## Out of Scope

- X 抓取与任何登录态自动化；仅保留来源占位。
- 账号体系、云同步、多用户、分享与发布。
- 在插件内硬编码代理、镜像或绕过付费墙；HF 镜像不使用。
- 把 PDF 解析作为主路径；PDF 只作降级。
- 浏览器自动化抓取（browser-use）与网页桥接。
- 翻译质量的逐句人工审校、术语自动学习。
- 自动提交、推送、安装到用户环境。

## Further Notes

- 代理是本机环境能力：当前验证为 `127.0.0.1:7897`（Node 24 需 `NODE_USE_ENV_PROXY=1`）；换机器需重新配置，不能写死。
- 翻译模型与 token 预算依据首轮演练调整；默认 300k/日只是起点。
- 每日 10 条是**上限**（默认值，配置可改）：候选不足时不补足，实际阅读量可能更低。
- 各站条款只核对了 arXiv 与 HF 镜像 robots，正式运行前应复核 OpenAI/Anthropic/Kimi/DeepSeek 的抓取条款。
- 研究依据：[来源接入研究](research/01-source-access.md) 与 [代理复测](research/proxy-retest-2026-11-04.md)。
- 规格不承诺实现完成；完成以实施工单的验收勾选与真实安装运行为准。
