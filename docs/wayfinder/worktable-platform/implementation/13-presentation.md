---
id: worktable-framework-13
title: 公共展示组件与可选主题
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: continuation_presentation
blocked_by: []
---

# 13: 公共展示组件与可选主题

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

提供可选统计卡片、列表、详情、筛选和空/错/加载态及明确字段映射，保持browser-safe SDK与唯一打包门禁。展示数据由调用者提供；以Reading和Notes两个独立消费者证明不需平台业务特判；不全局改原生/网页CSS。

## Acceptance

- [ ] 公开展示入口与真实挂载控件，字段缺失/筛选/选中/主题/窄屏行为；两个应用接入，SDK独立消费者及精确归档。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

无；可作为后续首次前沿。
