---
id: paper-reader-automation
title: 确定自动运行架构与调度方式
parent: paper-reader-pipeline-map
labels: [wayfinder:grilling]
status: closed
assignee: null
blocked_by: [paper-reader-translation-engine]
---

## Question

抓取链跑在哪里、怎么定时、失败怎么恢复？

## Resolution

采用**独立 CLI + DSH Schedule 包装**的单编排架构：

- 抓取/抽取/翻译/写 digest 由插件内独立 Node CLI 完成（确定性、可单测、可手跑）；不把全流程塞进 agent 会话上下文。
- 配置文件：`$DSH_HOME/paper-reader/config.json`（来源开关、配额、代理、模型、术语表、并发/超时）；密钥仍走环境变量。
- 运行记录：`$DSH_HOME/paper-reader/runs/YYYY-MM-DD.json`，含各来源状态、请求数、条数、翻译 token、耗时、跳过原因；CLI 退出码只在「当日一个文件都没写成」时非零。
- **调度**：DSH Schedule 每日 09:00 创建一个新会话，prompt 只做「运行 CLI → 校验 index/run 记录 → 汇报失败」，不参与翻译与抽取；用户可在 Schedule 页面改时间/时区。
- 手动补跑：同一 CLI 命令，文档给出；页面显示最近一次 run 状态与失败来源，不在页面内直接触发抓取（避免无鉴权的危险入口）。
- 失败：按来源隔离；单源失败不回滚其他来源；代理失败只影响 HF/OpenAI；保留上一份 digest，不写半份文件。
- 不用系统计划任务、不在插件加载时自动抓取，避免双重调度。
