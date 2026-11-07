---
id: window4-session-source
title: DSH会话证据的读取方式
labels: [wayfinder:grilling]
status: open
assignee: null
parent: window4-retro-collection-map
blocked_by: [window4-collection-scope]
---

## Question

2026-10-28补充：用户表示“可以配置”。来源选择应支持配置；尚未确认默认来源或DSH适配实现，不将上一轮推荐视为批准。

窗口4首期是否以run产物为主要输入、授权后才读取绑定会话的限定窗口？DSH应通过Host日志适配还是显式导出接入Speckit增量来源语义？需要先验证真实会话身份、日志格式及读取副作用，不能假设retro_context.py可直接消费DSH。建议先提供材料复盘，来源缺失逐项显示。
