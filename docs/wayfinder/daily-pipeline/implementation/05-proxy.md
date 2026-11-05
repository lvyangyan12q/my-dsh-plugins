---
id: paper-reader-impl-05
title: 代理配置、健康检查与来源降级状态
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: closed
assignee: null
blocked_by: [paper-reader-impl-03]
---

# 05: 代理配置、健康检查与来源降级状态

## What to build

抓取链按显式配置使用代理：读 `HTTP(S)_PROXY`/`ALL_PROXY` 或配置项；只对被直连封锁的来源启用；运行前做代理健康检查；失败时跳过受影响来源并把原因写进 run 记录与页面，不硬编码代理、不静默直连。

## Blocked by

- 03 CLI 骨架、选择/去重/配额与 arXiv 全链路

## Acceptance criteria

- [x] 代理地址只来自环境变量或配置文件；代码中不出现固定代理地址。
- [x] 直连可用的来源默认直连；仅 HF 官方、OpenAI 文章页按来源开关走代理。
- [x] 健康检查失败 → 受影响来源状态为 skipped，写明原因；其他来源照常产出。
- [x] 页面显示「今日哪些来源因代理不可用被跳过」；digest 记录跳过原因。
- [x] fixture/假代理测试覆盖成功、认证失败、超时、未配置四种情况。

**Evidence:** `5a96e50`（含 `3a3710b` 无硬编码校验）；集成分支 `a714d99` 上 12 个测试文件 140 项通过（新增 proxy 32、proxy-page 2）。已知限制：程序化 `proxy.url` 需注入 dispatcher 型 fetch，CLI 目前以 env + `NODE_USE_ENV_PROXY` 为主，缺传输层时明确 skipped。
