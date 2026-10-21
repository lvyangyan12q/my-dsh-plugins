---
id: worktable-framework-14
title: 模块内编辑与模板搭建
parent: worktable-ai-framework-spec
labels: [ready-for-agent]
status: open
assignee: null
blocked_by: [worktable-framework-12, worktable-framework-13]
---

# 14: 模块内编辑与模板搭建

范围依据：[完整spec](../framework-spec.md)、[2026-10-21后续实施边界](../continuation-spec.md)。

## What to build

沿现有项目布局和窗格配置实现组合应用草稿编辑、模板选择、页面与模块配置、资源/角色绑定、预览和显式启用；保留网站/原生会话/资源/动画/自定义内容承载。简化入口/视图标签与错误文案，身份详情折叠；不新增第二套窗口或聊天。

## Acceptance

- [ ] 已确认模块内UI用户流程；从空项目新建→模块配置→预览→启用→改草稿，运行版本和Session身份稳定，键盘/窄屏可操作。
- [ ] 先在已确认的公开接缝观察RED，再最小实现GREEN，保留命令/版本/输出；不测试私有结构镜像。
- [ ] 实际安装证据、版本和限制齐全后才关闭；未实测项保留，不借构建/测试通过宣称闭环。
- [ ] 原生/上游、六份历史用户改动、原资料/历史保持；不直接修改3080或发送未经准入的模型任务。

## Dependencies

- [12](12-composed-authoring.md)
- [13](13-presentation.md)
