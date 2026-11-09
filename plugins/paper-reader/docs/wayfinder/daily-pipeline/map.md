---
id: paper-reader-pipeline-map
title: 每日论文与博客抓取、中英对照与自动阅读链路
labels: [wayfinder:map]
status: open
---

## Destination

做出可每天自动运行的完整工具：从 X（本轮预留）、arXiv、Hugging Face 每日榜单、Anthropic、DeepSeek、月之暗面（Kimi）、OpenAI 等来源抓取最新内容，抽取全文，生成中英对照，写入 digest，并由本地 DSH 插件阅读。到达终点意味着这条链路真实跑通、可定时、可恢复，而不是只有页面。

## Notes

- 本地 Markdown 跟踪器：子票为 `issues/` 下 Markdown，frontmatter 的 `parent` 指向本图，`blocked_by` 引用子票 id；前沿用 `frontier.ps1` 查询（open、无 assignee、所有 blockers 已 closed）。先认领再工作；研究可并行，其余每轮最多解决一个。
- 地图与子票放在插件目录 `docs/wayfinder/`，因为本会话写权限限定在 `plugins/paper-reader`。若之后要并入仓库级 `docs/wayfinder/`，需另开写权限再迁移，当前不复制第二份。
- 本图目的地包含实现，不只规划；研究/原型/任务/讨论票都可推进到可交付。实施按票逐步，不一次性全铺。
- 既有资产：digest 数据契约与三模式阅读页已实现（`docs/DESIGN.md`、`src/`）；采集、抽取、翻译、定时尚未实现。
- 环境事实（2026-11-04 实测）：arXiv API/HTML/PDF 可达；Anthropic、DeepSeek、Kimi、Moonshot、OpenAI RSS 可达；Hugging Face、OpenAI 文章页、X 直连失败。系统代理 `127.0.0.1:7897` 下，HF 官方 API/HTML、OpenAI 文章页、X 页面均 200（15:40 复测，见 [代理复测](research/proxy-retest-2026-11-04.md)）。browser-use 未安装。抓取不依赖 DSH `web_search`（用户明确去掉），只走来源自身入口。
- 研究结论写在 `research/` 与本票 Resolution，不建远程分支、不推送（本环境 GitHub 不可达且写权限受限）。
- 规划阶段已完成（2026-11-05）：所有决策票关闭；实施转 [spec.md](spec.md) 与 [implementation/README.md](implementation/README.md)，地图保持 open 直到工具真实运行。
- 查询前沿：`pwsh -File docs/wayfinder/daily-pipeline/frontier.ps1`（脚本已带 BOM，兼容 Windows PowerShell 5.1；若手改脚本请保持 UTF-8 BOM）。

## Decisions so far

- [确认目的地、来源范围与全文/自动化边界](issues/00-scope.md)：完整工具、每天自动抓取、六类实抓来源（X 预留）、全文、中英对照；配额/翻译/调度/存储另票决定。
- [确认各来源的入口、列表与正文抽取路径](issues/01-source-access.md)：arXiv 用 API + HTML；HF 官方直连失败、代理下可抓（镜像去留见 11）；Anthropic 用 sitemap + SSR；DeepSeek 有官方双语；Kimi 英文需译；OpenAI 仅 RSS 标题 + dek、代理下可恢复全文（见 12）；Claude Code 已移出。
- [确定原文语言与三种阅读模式的语义](issues/06-language-semantics.md)：对照固定「原文 | 译文」，中文来源左中右英；仅中文/English 是目标语言视图；数据用 `sourceLanguage` + `original/translation`，迁移见适配票。
- [抓取链是否允许使用系统代理访问被封锁来源](issues/13-proxy-policy.md)：允许但显式配置（env/插件配置，不硬编码）；只用于直连失败来源；代理失败跳过并标注，健康检查写入 run 记录。
- [确定每日配额、排序与重要度规则](issues/02-daily-quota.md)：每日 10 条（论文 6、博客 4），HF 票数 + arXiv 分类/关键词，去重按 arXiv id / canonical URL，配置可调。
- [确定翻译引擎、凭据、缓存与失败策略](issues/03-translation-engine.md)：OpenAI 兼容端点 + 环境变量；段落批量；术语表；内容哈希缓存；pending 与每日 token 预算。
- [确定自动运行架构与调度方式](issues/04-automation.md)：独立 CLI + DSH Schedule 每日会话包装；run 记录；按来源隔离失败。
- [由原型验证全文抽取与对齐](issues/05-fulltext-quality.md)：抽取方案已定（arXiv HTML、Anthropic、DeepSeek 双语、Kimi、OpenAI、HF 回 arXiv），验证并入实施票。
- [确定 digest 存储、历史保留与页面加载范围](issues/07-storage-history.md)：按天文件 + index，保留 30 天，页面先加载 7 天，原子写入。
- [Hugging Face 官方接口的代理接入与降级](issues/11-hf-mirror.md)：官方 HF + 显式代理，不用镜像；代理失败跳过并用 arXiv 自排序补位。
- [OpenAI 全文与代理降级选择](issues/12-openai-excerpt.md)：代理可用抓全文；不可用保留节选并标注。
- [单日端到端演练](issues/08-end-to-end.md)：由实施图端到端验收承接。
- [安装插件并配置每日定时任务](issues/09-schedule-install.md)：由实施图调度/安装切片承接。
- [数据契约与阅读页适配原文/译文语义](issues/10-schema-adaptation.md)：由实施图切片 01 承接。

## 规格与实施图

- [实现规格](spec.md)（`ready-for-agent`）：问题、方案、30 条用户故事、实现决策、测试决策、范围外说明。
- [实施工单索引](implementation/README.md)：11 张纵向切片，按 `blocked_by` 推进；工单关闭与验收分离，创建工单不代表实现完成。
- 本图只保留规划决策；实施进度看工单勾选与真实运行证据。

## Not yet specified

- 翻译质量抽检标准与人工修正入口（实施后按实际译文评估）
- 是否把抓取器泛化为可配置来源框架，还是只服务当前来源集合（等首轮演练成本数据）
- 跨天全文检索/历史搜索（等实施后的数据量与性能评估）

## Out of scope

- 本轮不做 X 抓取，只保留来源占位与 schema 扩展位。
- 不做账号体系、云同步、多用户与分享。
- 不使用 DSH `web_search` 作为发现或抓取入口（用户明确去掉）。
- 不使用 Hugging Face 镜像；HF 官方代理不可用即跳过。
- 不在插件内硬编码代理；代理按 [代理策略票](issues/13-proxy-policy.md) 显式配置，只用于直连失败来源。
- 不修改 DSH 原生代码，不接入 worktable。
- 不自动提交、推送或发布。
