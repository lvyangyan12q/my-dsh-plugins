---
id: worktable-framework-17
title: 显式受控网页桥接
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-14, worktable-framework-16]
---

# 17: 显式受控网页桥接

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

提供opt-in有限桥接，仅授予所选只读资源和准备任务；校验精确来源、source窗口、视图/实例与代际、请求关联和授权，撤销/卸载/迟到响应拒绝。普通网页继续sandbox/no-referrer无能力，桥接不能直接发模型或调用任意原生工具。

## Acceptance

- [ ] F14真实网页与平台交互、错误来源/窗口/实例、撤销与旧请求拒绝；不把纯消息fixture替代实际网页。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

- [14](14-inline-builder.md)
- [16](16-failure-states.md)
