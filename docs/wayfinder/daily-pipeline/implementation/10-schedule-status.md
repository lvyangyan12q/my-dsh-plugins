---
id: paper-reader-impl-10
title: 每日调度、运行状态与安装/回退
parent: paper-reader-pipeline-map
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [paper-reader-impl-04, paper-reader-impl-05, paper-reader-impl-06, paper-reader-impl-07, paper-reader-impl-08, paper-reader-impl-09]
---

# 10: 每日调度、运行状态与安装/回退

## What to build

链路自动跑起来：DSH Schedule 每日 09:00 创建会话运行 CLI；页面显示最近一次运行的时间、条数、失败/跳过来源；用户可手动补跑；安装、启用、升级、卸载与回退步骤有文档；插件版本与 DSH 版本锁定。

## Blocked by

- 04 翻译服务、缓存、pending 与预算
- 05 代理配置、健康检查与来源降级状态
- 06 Anthropic 与 Kimi 博客适配器
- 07 HF 官方每日榜、热度选择与代理降级
- 08 DeepSeek 官方双语适配器
- 09 OpenAI 全文与节选降级

## Acceptance criteria

- [ ] DSH Schedule 任务按本地时区每日 09:00 运行；错过/失败后可手动补跑，不自动重放历史。
- [ ] 页面显示最近运行状态、条数、耗时、失败与被跳过来源；不用错误页盖住可读的上一份 digest。
- [ ] 运行记录保留最近 30 天，含 token 与来源状态；失败日志不含密钥。
- [ ] 安装/启用/升级/卸载/回退步骤可照做；版本不匹配时拒绝加载。
- [ ] 验收记录包含一次定时触发与一次手动补跑的真实输出。
