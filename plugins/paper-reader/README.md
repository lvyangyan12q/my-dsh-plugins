# dsh-paper-reader

DeepSeek Harness 的**独立本地插件**：一个论文与重要博客的中英文阅读页。

左侧按天聚合 agent 每日抓取的 X / Claude Blog 条目，可折叠、搜索、按方向筛选；右侧阅读区支持 **中英对照 / 仅中文 / English** 三种模式。页面由插件直接渲染在 DSH 主面板中——不是 iframe，不打开独立站点，也不依赖 worktable。

```
┌──────────────────────── DSH 窗口 ─────────────────────────┐
│  DSH 侧栏    │ 论文阅读  [示例数据]      每日 09:00 · 8 篇 │
│  会话…       ├────────────────────────────────────────────┤
│              │ 搜索…  方向 × 筛选         1/8 · 已读 3/8 │
│              │ ┌───────────┬──────────────────────────────┐│
│              │ │ 今天   3  │ 标题（中/英）                 ││
│              │ │  □ 论文 A │ 导读                         ││
│              │ │  □ 论文 B │ ┌─原文──────┬─中文─────────┐ ││
│              │ │ 昨天   2  │ │ paragraph │ 段落译文      │ ││
│              │ │  □ 论文 C │ └───────────┴──────────────┘ ││
│              │ └───────────┴──────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
```

## 安装

插件是本地目录包，进入 DSH 插件管理页选择「本地目录」安装，或用 CLI：

```powershell
dsh plugin --profile web add "F:\ai-project\my-dsh-plugins\plugins\paper-reader"
```

安装后重启 `dsh web`（或桌面端）使 Host 组合生效；若插件管理页显示未启用，先启用该 bundle。重启后左侧栏出现「论文阅读」入口，点击即打开本页。

完整的安装、启用、每日 09:00 DSH Schedule 配置、手动补跑、升级、卸载、回退与版本锁定说明见 **[docs/INSTALL.md](docs/INSTALL.md)**。

> 当前包声明支持 DSH `0.2.2-alpha.2` 和 `0.2.2-rc.1`。

## 数据：agent 每日写入

插件只读取本地文件，不主动访问来源，也不保存任何凭据。数据按天存储：

```
$DSH_HOME/paper-reader/
├── index.json                 # 日期索引，最后写入（默认 C:\Users\<你>\.dsh\paper-reader\）
└── digest/
    ├── 2026-11-05.json        # 单日 digest（schema v2：date + items）
    └── 2026-11-04.json
```

- 页面启动先读 `index.json`，默认加载最近 7 天并按天分组；点「加载更早」最多回溯到 30 天。
- 每天一个文件、原子写入（临时文件 + rename），单日上限 8 MiB；超限的当天失败并保留上一份文件。
- 索引在当天文件之后写入；索引缺失、单日文件缺失 / 损坏 / 超限都有明确错误。
- 保留 30 天：写入新一天后清理更早的日文件；清理失败不阻塞当天写入。
- 还没有 `index.json` 时回退到旧的 `digest.json`；两者都没有时使用包内 `sample/digest.json` 并显示「示例数据」。
- 宿主路由：`/api/paper-reader/index`、`/api/paper-reader/status`（最近一次 run 的只读摘要）、`/api/paper-reader/digest/YYYY-MM-DD`、`/api/paper-reader/digest`（旧单文件）、`/api/paper-reader/health`；沿用浏览器会话鉴权，只读、不创建用户数据。
- 页面顶部显示最近一次运行的状态、日期、耗时、条数、翻译 token/预算，以及失败与被跳过来源；状态读取失败只显示提示，不覆盖上一份可读 digest。

写入由每日 agent / CLI 负责（原子写 + 索引 + 保留清理见 `src/storage.js`），插件只读。数据契约见 [docs/DESIGN.md](docs/DESIGN.md#数据契约)。

### 每日抓取（插件之外）

采集链路方案已定：[实现规格](docs/wayfinder/daily-pipeline/spec.md) 与 [11 张纵向切片工单](docs/wayfinder/daily-pipeline/implementation/README.md) 是唯一实施入口。目标：每天 10 条、全文抽取、中英对照、按天 digest、DSH Schedule 每日运行；来源 arXiv、HF 每日榜、Anthropic、DeepSeek、Kimi、OpenAI；HF/OpenAI 需显式代理；X 预留，Claude Code 与 DSH `web_search` 不在范围内。

已实现链路（工单 03/04/05/06/07/08/09）：CLI → arXiv 列表/LaTeXML 抽取 + Hugging Face 每日榜（经代理） + DeepSeek 官方双语新闻 + Anthropic/Kimi 英文博客 + OpenAI RSS/文章页 → 选择/去重/配额 → 正文抽取 → 段落批量翻译（DeepSeek 已有官方译文，免翻译）→ 当日 digest + 索引 + run 记录。没有模型配置时英文条目保持 `translation: null` / `translationState: "pending"` 并明确跳过，页面显示「翻译进行中」。OpenAI 的 RSS 列表直连，文章页经代理抽取；代理不可用时保留 RSS 节选。

```powershell
node scripts/paper-reader.mjs --date 2026-11-05
node scripts/paper-reader.mjs --dry-run        # 只抓取和统计，不写文件，也不调用翻译
node scripts/paper-reader.mjs --source arxiv   # 只跑一个来源（arxiv / deepseek / hf / anthropic / kimi / openai）
```

- 配置在 `$DSH_HOME/paper-reader/config.json`，可选；缺失时使用内置默认（论文 6、每日 10、分类 `cs.AI`/`cs.CL`/`cs.LG`、超时 20s、DeepSeek 回看 1 天）。工具只读该文件，不会覆盖。
- 示例：`{"quota":{"papers":4},"sources":{"arxiv":{"categories":["cs.CL"],"keywords":["agent"]},"deepseek":{"lookbackDays":2},"openai":{"enabled":true}}}`。
- 代理（工单 05）：只对直连失败的来源生效，开关是 `sources.<id>.useProxy`（默认 HF 官方与 OpenAI 为 `true`，arXiv/DeepSeek 等直连来源为 `false`）。`sources.openai.extractViaProxy`（默认 `true`）把 OpenAI 的代理收窄到文章页：RSS 列表仍直连。
- OpenAI（工单 09）：默认 `sources.openai.enabled` 为 `false`，需显式开启。开启后从 `openai.com/news/rss.xml` 取标题、官方 dek、`pubDate`、分类与链接；代理可用时抓文章页 SSR 正文（标题、日期、作者、段落）并翻译。代理不可用、单篇 403 或抽取失败时保留 RSS 节选条目（`excerpt: true` + `excerptReason`），页面显示「节选 / 代理不可用」，不伪装成全文、不循环重试。全文与节选都占博客配额（默认 4），节选不计入「全文已翻译」统计（run 记录 `counts.fullTextTranslated`）。
- 地址只来自 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`（Node 24 还需启动前设置 `NODE_USE_ENV_PROXY=1`）或配置 `proxy.url`；代码不内置代理地址，也不读取系统代理。
- 每日运行先做一次代理健康检查（`proxy.healthCheckUrl`，默认 HF 每日榜接口）。代理未配置、认证失败、超时或不可达时，受影响来源记为 `skipped` 并写入原因，其他来源照常产出；页面顶部显示「因代理不可用跳过：…」。不会回退直连硬闯，代理凭据不写入 digest 或 run 记录。
- arXiv 正文取 `arxiv.org/html/<id>`（LaTeXML），保留标题、段落、公式、图注与代码；HTML 缺失时回退摘要并标记「节选」。
- Hugging Face 每日榜（工单 07）：只取官方 `api/daily_papers?date=YYYY-MM-DD` 当日榜（不带日期的跨天结果不使用），按 `upvotes` 排序参与 6 条论文配额；`paper.id` 就是 arXiv id，正文一律回 arXiv 抽取，与 arXiv 结果按 id 去重（HF 副本保留票数）。HF 走 `sources.hf.useProxy`（默认 `true`）；代理缺失或健康检查失败时整源 `skipped`、arXiv 自排序补位，run 记录与页面写明原因；不使用镜像，也不回退直连。
- DeepSeek（工单 08）：列表只取 `api-docs.deepseek.com/sitemap.xml`（`/news` 是软 404），按 slug 自带的日期进入当天窗口；正文读官方英文 `/news/<slug>.md` 与中文 `/zh-cn/news/<slug>.md`，直接写成「中文原文 + 英文译文」，**不调用翻译**，`sourceLanguage: "zh"`、`translationState: "complete"`。中文版缺失时保留英文并标 pending；两者都缺失的条目跳过并写入 run 记录告警。
- DeepSeek 的博客条目按发布时间参与每日 4 条博客配额；窗口外的旧新闻不会每天重复占用配额。
- Anthropic（工单 06）：从 `anthropic.com/sitemap.xml` 过滤 `/news/`、`/research/`，与 `state/sources.json` 里已见 URL 做差集（同一天重跑仍可复现），正文取 `main#main-content`，标题/日期/作者取 `ld+json`；单篇失败跳过并在 run 记录计数，不影响其他来源。
- Kimi（工单 06）：从 `www.kimi.com/blog/` 卡片解析标题与发布日期，正文取 `main.layout-content`，明/暗重复图按图片 URL 去重；英文正文进入翻译。Anthropic 与 Kimi 共同参与每日 4 条博客配额（按来源轮转、各取最新）。
- 翻译使用 OpenAI 兼容 Chat Completions 端点，环境变量：`PAPER_READER_LLM_BASE_URL`、`PAPER_READER_LLM_API_KEY`、`PAPER_READER_LLM_MODEL`（也可在 `translation.baseUrl/apiKey/model` 固定）。三者缺一时整轮翻译明确跳过并写入 run 记录，不影响抓取。
- 翻译按块批量（每批 6–12 块）、标题/图注/公式说明单独处理；公式主体与代码不翻译。单块失败重试 2 次后保持 pending，其余块照常。
- 译文缓存在 `$DSH_HOME/paper-reader/cache/`，键为原文、目标语言、模型与术语表版本的 SHA-256；重复运行不再付费。术语表内置常用 AI 词汇，可用 `translation.glossary` 覆盖。
- 每日 token 预算默认 300k（`translation.dailyTokenBudget`）；超限后剩余条目 pending，run 记录与页面可见。密钥只出现在 Authorization 头，不写入 digest、run 记录或日志。
- 每个日期写 `digest/YYYY-MM-DD.json` 与 `runs/YYYY-MM-DD.json`；索引最后更新。全部来源失败时不写当日 digest，上一份保持可读，退出码为 1。
- run 记录保留最近 30 天，写入后清理更早的同名日期文件；记录来源状态、条数、耗时、翻译 token、警告与失败/跳过原因，密钥不落盘。
- 手动补跑：`node scripts/paper-reader.mjs --date YYYY-MM-DD`（同一天重跑会覆盖当天文件，token 预算接着已用额度计算）；不自动重放历史。调度配置见 [docs/INSTALL.md](docs/INSTALL.md#每日-0900-调度dsh-schedule)。
- 退出码：`0` 已写入（或 dry-run 完成），`1` 抓取失败且未写入，`2` 参数或配置错误。

## 阅读与交互

| 操作 | 方式 |
|---|---|
| 切换论文 | 点击左栏条目；`J` / `K` 下一篇 / 上一篇 |
| 搜索 | `/` 聚焦搜索框，匹配标题、作者、关键词、机构 |
| 按方向筛选 | 顶部方向标签（Agent / 推理 / 训练 / 对齐 / 架构…），与搜索、收藏叠加 |
| 只看收藏 | 方向标签旁的「★ 收藏」 |
| 折叠某天 | 点击日期分组标题；筛选时自动展开 |
| 阅读模式 | 顶部分段控件，或快捷键 `1` / `2` / `3` |
| 收藏当前论文 | 阅读栏星标，或 `B` |
| 收起/展开列表 | 顶部侧栏按钮，或 `Ctrl+B`（macOS `⌘B`） |
| 本文大纲 | 顶部大纲按钮；点击小节跳转，滚动时高亮当前节 |

阅读状态（模式、已读、收藏、折叠的天、当前论文）保存在浏览器 `localStorage`，键为 `dsh-paper-reader:v1`。

## 设计要点

- **对照固定「原文 | 译文」**：每一行左原文、右译文，滚动天然同步；列的先后由条目的 `sourceLanguage` 决定——英文来源左英文右中文，中文来源左中文右英文。
- **「仅中文 / English」是目标语言视图**：不假定原文语言；中文来源的 English 模式读的是英文译文。
- **公式、图、代码整行跨栏**：不复制两份，避免对照模式里出现两个相同公式；它们的说明与图注仍按原文/译文成对显示。
- **切模式保持阅读位置**：从对照切到仅中文时，按当前段落锚点恢复滚动位置。
- **跟随 DSH 主题**：颜色使用宿主 `--dsw-*` 变量，亮/暗主题自动适配，不额外提供主题开关。
- **翻译缺失可见**：`translation: null` + `translationState: "pending"` 渲染骨架屏；缺失译文在单语模式下回退原文并标注「未翻译，显示原文」，不静默留白。

更多布局理由、状态矩阵与验收清单见 [docs/DESIGN.md](docs/DESIGN.md)。

## 开发

```powershell
pnpm install          # 安装 esbuild
pnpm build            # 生成 lib/index.js 与 lib/client.js
pnpm check            # 语法检查
pnpm test             # 宿主路由/契约测试 + jsdom 阅读页渲染测试
```

阅读页测试需要 jsdom 与 react（不在本包内）：

```powershell
$env:PAPER_READER_TEST_DEPS = 'C:\path\to\package-with-react-and-jsdom'
$env:ESBUILD_BIN = 'C:\path\to\esbuild.exe'   # 仅当 lib/client.js 缺失或过期
node test/client.test.mjs
```

没有本地 esbuild 时，可把 `ESBUILD_MODULE` 指向已有安装：

```powershell
$env:ESBUILD_MODULE = 'file:///path/to/node_modules/esbuild/lib/main.js'
node build.mjs
```

## 已知边界

- 抓取、抽取与翻译由外部 CLI 完成；DSH 插件本身仍只读、不发起模型调用、不保存密钥、不访问外网。
- `sample/digest.json` 是演示数据，不是真实抓取结果。
- 升级到 `engines.dsh` 范围之外的宿主版本时，需按新契约复验。
- 已在隔离的 DOM 环境验证列表、筛选、搜索、三种模式、折叠与收藏；尚未在运行中的 DSH 实例里做安装后的视觉验收。

## License

MIT
