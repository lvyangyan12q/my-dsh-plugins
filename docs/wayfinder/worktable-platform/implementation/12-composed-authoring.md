---
id: worktable-framework-12
title: 组合应用草稿、预览与显式启用
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: continuation_authoring
blocked_by: []
---

# 12: 组合应用草稿、预览与显式启用

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

通过公开Host合同持久化组合应用草稿与运行版本；校验模板/页面/模块/数据引用/可选角色，乐观并发和版本递增；预览无运行替换和发送副作用；启用通过现有应用注册、实例和视图模型承载，重启后恢复。独立应用仍保持自有协议，不导入旧前台。

## Acceptance

- [ ] 公开草稿生命周期及应用/实例注册合同；实际保存/预览/启用/再次编辑，验证运行版隔离与实例/历史保持。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

无；可作为后续首次前沿。
