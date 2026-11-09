# 代理复测：Hugging Face / OpenAI / X（2026-11-04 15:40）

- 环境：Windows 系统代理已启用 `127.0.0.1:7897`；Node 24.22.1 使用 `HTTP_PROXY`/`HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1` 走代理。
- 直连（未设置代理）仍与主报告一致：Hugging Face TCP 超时、OpenAI 文章页 403、X 失败。
- 复测方式：只读 GET，不登录、不伪造 cookie；未测长时间稳定性与代理认证。

| URL | 结果 | 关键观察 |
| --- | --- | --- |
| `https://huggingface.co/api/daily_papers?date=2026-11-04` | 200 JSON，202,148 B | 34 条；`upvotes` 0–41；`paper.id` 为 arXiv id；含 `ai_summary`、`ai_keywords`、`githubRepo`、`githubStars`、`organization` |
| `https://huggingface.co/api/daily_papers?date=2026-11-03` | 200 JSON，276,534 B | 46 条；字段同上 |
| `https://huggingface.co/api/daily_papers`（不带 date） | 200 JSON，294,412 B | 50 条，跨两天且非按日过滤，**不要用作每日全量** |
| `https://huggingface.co/papers` | 200 HTML，534,430 B | 页面可用；API 更适合结构化 |
| `https://openai.com/index/gpt-4o-system-card/` | 200 HTML，1,097,432 B | SSR，`<main>` 存在，`<p>` ×561；无 `ld+json`，需 DOM 抽取 |
| `https://openai.com/news/` | 200 HTML，402,778 B | 列表页可用（但仍建议 RSS） |
| `https://x.com/AnthropicAI` | 200 HTML，169,444 B | 页面壳可拿，正文仍需登录/API；X 仍按约定预留，不纳入本轮 |

## 对原结论的修正

1. **HF 官方不再「不可达」**：走系统代理可拿官方每日榜，`hf-mirror` 不再是必需路径，`robots.txt: Disallow: /` 的镜像风险可以绕开。
2. **OpenAI 全文恢复可能**：代理下文章页 200 且服务端渲染，可抽正文；「只能标题 + dek」的结论仅在无代理时成立。
3. **X 仍不接入**：页面壳可达不等于可稳定抓取帖子，且用户已明确本轮预留。
4. **代理是环境相关能力**：`127.0.0.1:7897` 是当前机器的系统代理，不应硬编码进插件；需由 13 号票决定「是否允许显式配置代理」。

## 证据

逐条记录见 [`proxy-retest-2026-11-04.jsonl`](./proxy-retest-2026-11-04.jsonl)。
