---
id: paper-reader-proxy-policy
title: 抓取链是否允许使用系统代理访问被封锁来源
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: []
---

## Question

2026-11-04 15:40 复测：本机系统代理 `127.0.0.1:7897` 下，Hugging Face 官方 API/HTML、OpenAI 文章页、X 页面均返回 200；同一网络直连仍失败（HF TCP 超时、OpenAI 403、X 失败）。代理让「HF 官方」「OpenAI 全文」重新可用。

需要决定：

- 每日抓取链是否允许使用代理？只读 `HTTP(S)_PROXY` / `NODE_USE_ENV_PROXY`，还是自动读取 Windows 系统代理（注册表）？
- 是否把代理地址写进配置（例如 `paper-reader/config.json`），还是完全交给环境变量？
- 代理不可用、认证失败或超时时，各来源如何降级与告警（跳过并标注 / 回退直连 / 整轮失败）？
- 是否接受代理带来的稳定性、合规与隐私边界（流量经过本地代理进程）。

➡️ 建议：**允许，但必须显式配置**（`HTTP(S)_PROXY` 或插件配置，不硬编码 `127.0.0.1:7897`）；代理不可用时跳过受影响来源并在 digest 标注原因，不静默直连、不静默失败；每日任务先做一次代理健康检查。

## Resolution

用户回复「keyi」，确认推荐策略：

- **允许使用代理，但必须显式配置**：优先读 `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY`（Node 24 还需 `NODE_USE_ENV_PROXY=1`），或在插件配置中提供 `proxy.url`；不硬编码 `127.0.0.1:7897`，不默认自动读取 Windows 系统代理。
- **只对直连失败的来源启用**：当前是 Hugging Face 官方与 OpenAI 文章页；直连可用的来源不走代理。X 仍按约定预留。
- **代理不可用/认证失败/超时**：跳过受影响来源并在 digest 与页面标注原因；不回退直连硬闯、不静默失败；其余来源照常产出。
- **每日任务先做代理健康检查**：检查结果写入 run 记录，页面显示「今日哪些来源因代理缺失被跳过」。
- **边界**：代理流量经过用户配置的本地/远程代理进程，接受其稳定性与隐私边界；代理凭据不写入 digest、不写日志明文。
- 代理是环境能力，不是产品默认值；换机器或无代理时，HF 官方与 OpenAI 全文自动降级。
